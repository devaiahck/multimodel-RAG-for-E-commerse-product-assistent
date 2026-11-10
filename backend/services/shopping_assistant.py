"""
Shopping Assistant Service.
Category-agnostic, data-grounded assistant for UrbanPick.
Extracts constraints, builds catalog vocabulary dynamically from Chroma (cached for 5 minutes),
matches categories/brands/synonyms, enriches price scores, and returns grounded answers.
"""

import asyncio
import json
import logging
import os
import re
import statistics
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional, Set, Tuple

from rag.retriever import VectorRetriever
from rag.encoder import MultimodalEncoder
from services.price_score import compute_buy_score, compute_real_discount
from services.ollama_client import generate_text as ollama_generate
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VOCAB_CACHE_TTL = 300.0  # 5 minutes
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "assistant_vocab.json"

USE_CASES = [
    "running", "gym", "office", "gift", "travel", "gaming", "party", "daily", "kids"
]

# ---------------------------------------------------------------------------
# Catalog Vocabulary Data Structure & Dynamic Extraction
# ---------------------------------------------------------------------------

@dataclass
class CatalogVocabulary:
    top_level_categories: Set[str] = field(default_factory=set)
    subcategories: Set[str] = field(default_factory=set)
    full_categories: Set[str] = field(default_factory=set)
    brands: Set[str] = field(default_factory=set)
    # pattern_string -> canonical category/subcategory to use in filter
    category_patterns: Dict[str, str] = field(default_factory=dict)
    # pattern_string -> canonical brand
    brand_patterns: Dict[str, str] = field(default_factory=dict)
    cached_at: float = 0.0


def generate_word_variants(term: str) -> Set[str]:
    """Generate singular/plural variations for a word or phrase."""
    term_lower = term.strip().lower()
    if not term_lower:
        return set()
    variants = {term_lower}

    words = term_lower.split()
    last_word = words[-1]

    # Singular candidates of the last word
    sing_candidates = set()
    if len(last_word) > 3:
        if last_word.endswith("ies") and len(last_word) > 4:
            sing_candidates.add(last_word[:-3] + "y")
        elif last_word.endswith("es") and len(last_word) > 3:
            sing_candidates.add(last_word[:-2])
            sing_candidates.add(last_word[:-1])
        elif last_word.endswith("s"):
            sing_candidates.add(last_word[:-1])

    for s in sing_candidates:
        new_words = list(words)
        new_words[-1] = s
        variants.add(" ".join(new_words))

    # Plural candidates of the last word
    plural_candidates = set()
    if last_word.endswith("y") and len(last_word) > 2 and last_word[-2] not in "aeiou":
        plural_candidates.add(last_word[:-1] + "ies")
    elif last_word.endswith(("s", "sh", "ch", "x", "z")):
        plural_candidates.add(last_word + "es")
    else:
        plural_candidates.add(last_word + "s")

    for p in plural_candidates:
        new_words = list(words)
        new_words[-1] = p
        variants.add(" ".join(new_words))

    return variants


def load_synonyms_file() -> Dict[str, str]:
    """Load everyday synonyms mapping from backend/config/assistant_vocab.json."""
    if not CONFIG_PATH.exists():
        return {}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("synonyms", {})
    except Exception as e:
        logger.warning("Could not read assistant_vocab.json: %s", e)
        return {}


def build_catalog_vocabulary(metadatas: List[Dict[str, Any]]) -> CatalogVocabulary:
    """
    Build vocabulary dynamically from catalog metadatas and assistant_vocab.json.
    Derives top-level categories, subcategories, brands, variants, and active synonyms.
    """
    top_cats: Set[str] = set()
    sub_cats: Set[str] = set()
    full_cats: Set[str] = set()
    brands: Set[str] = set()

    for m in metadatas:
        if not m:
            continue
        cat = str(m.get("category", "")).strip()
        if cat:
            full_cats.add(cat)
            if " - " in cat:
                parts = cat.split(" - ", 1)
                top_cats.add(parts[0].strip())
                sub_cats.add(parts[1].strip())
            else:
                top_cats.add(cat)

        brand = str(m.get("brand", "")).strip()
        if brand:
            brands.add(brand)

    brand_patterns: Dict[str, str] = {}
    for b in brands:
        for var in generate_word_variants(b):
            brand_patterns[var] = b

    category_patterns: Dict[str, str] = {}

    # 1. Subcategories and their variants
    for sc in sub_cats:
        for var in generate_word_variants(sc):
            category_patterns[var] = sc

    # 2. Top-level categories and their variants
    for tc in top_cats:
        for var in generate_word_variants(tc):
            # Only set if not already set by a more specific subcategory
            if var not in category_patterns:
                category_patterns[var] = tc

    # 3. Load synonyms from assistant_vocab.json: only use if target exists in catalog
    synonyms = load_synonyms_file()
    for syn_word, target in synonyms.items():
        target_clean = target.strip()
        target_lower = target_clean.casefold()

        # Check if target exists in the catalog (top-level, subcategory, or substring of full category)
        matched_target = None
        for sc in sub_cats:
            if sc.casefold() == target_lower:
                matched_target = sc
                break
        if not matched_target:
            for tc in top_cats:
                if tc.casefold() == target_lower:
                    matched_target = tc
                    break
        if not matched_target:
            for fc in full_cats:
                if target_lower in fc.casefold():
                    matched_target = target_clean
                    break

        if matched_target:
            for var in generate_word_variants(syn_word):
                if var not in category_patterns:
                    category_patterns[var] = matched_target

    return CatalogVocabulary(
        top_level_categories=top_cats,
        subcategories=sub_cats,
        full_categories=full_cats,
        brands=brands,
        category_patterns=category_patterns,
        brand_patterns=brand_patterns,
        cached_at=time.time(),
    )


# Module-level vocabulary cache
_vocab_cache: Optional[CatalogVocabulary] = None


def get_cached_vocabulary(
    retriever: Optional[VectorRetriever] = None,
    force_refresh: bool = False,
) -> CatalogVocabulary:
    """Return the cached CatalogVocabulary, refreshing if expired (> 5 min) or forced."""
    global _vocab_cache
    now = time.time()
    if not force_refresh and _vocab_cache is not None and (now - _vocab_cache.cached_at < VOCAB_CACHE_TTL):
        return _vocab_cache

    metadatas: List[Dict[str, Any]] = []
    if retriever is not None:
        try:
            res = retriever.collection.get(include=["metadatas"])
            metadatas = res.get("metadatas", []) or []
        except Exception as e:
            logger.warning("Could not read Chroma collection for vocabulary: %s", e)
    else:
        # Fallback: attempt to read Chroma directly using default path if available
        try:
            import chromadb
            from config import settings
            client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
            coll = client.get_collection("products")
            res = coll.get(include=["metadatas"])
            metadatas = res.get("metadatas", []) or []
        except Exception:
            metadatas = []

    _vocab_cache = build_catalog_vocabulary(metadatas)
    return _vocab_cache


def reset_vocab_cache():
    """Clear vocabulary cache (used by tests)."""
    global _vocab_cache
    _vocab_cache = None


# ---------------------------------------------------------------------------
# Constraint Extraction (Plain Python, Dynamic Vocabulary, No LLM)
# ---------------------------------------------------------------------------

def parse_price_val(raw_num_str: str) -> Optional[float]:
    """Parse number supporting Indian comma notation and 'k' suffix."""
    if not raw_num_str:
        return None
    clean = raw_num_str.strip().lower().replace(",", "")
    if clean.endswith("k"):
        try:
            return float(clean[:-1].strip()) * 1000.0
        except ValueError:
            return None
    try:
        return float(clean)
    except ValueError:
        return None


# Max price regex patterns
_MAX_PRICE_P1 = re.compile(
    r"(?:under|below|less than|within|budget(?:\s*of)?|up to|upto|max(?:imum)?)\s*(?:(?:rs\.?|inr|₹)\s*)?([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*k?)",
    re.IGNORECASE,
)
_MAX_PRICE_P2 = re.compile(
    r"(?:(?:rs\.?|inr|₹)\s*)?([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*k?)\s*(?:budget|max)",
    re.IGNORECASE,
)

# Min price regex patterns
_MIN_PRICE_P1 = re.compile(
    r"(?:above|over|more than|at least|min(?:imum)?)\s*(?:(?:rs\.?|inr|₹)\s*)?([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*k?)",
    re.IGNORECASE,
)
_MIN_PRICE_P2 = re.compile(
    r"(?:(?:rs\.?|inr|₹)\s*)?([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*k?)\s*(?:and above|or more|min|minimum)",
    re.IGNORECASE,
)


def extract_constraints(
    message: str,
    vocab: Optional[CatalogVocabulary] = None,
) -> Dict[str, Any]:
    """
    Extract budget caps, floors, brands, categories, price intent, and use case from query message.
    Uses dynamic vocabulary derived from the catalog data.
    """
    text = message.strip()
    filters: Dict[str, Any] = {}

    if vocab is None:
        vocab = get_cached_vocabulary()

    # 1. Max price
    m_max = _MAX_PRICE_P1.search(text)
    if not m_max:
        m_max = _MAX_PRICE_P2.search(text)
    if m_max:
        val = parse_price_val(m_max.group(1))
        if val is not None and val >= 0:
            filters["max_price"] = val

    # 2. Min price
    m_min = _MIN_PRICE_P1.search(text)
    if not m_min:
        m_min = _MIN_PRICE_P2.search(text)
    if m_min:
        val = parse_price_val(m_min.group(1))
        if val is not None and val >= 0:
            filters["min_price"] = val

    text_lower = text.lower()

    # 3. Brand names (case-insensitive boundary matching, longest patterns first)
    sorted_brands = sorted(vocab.brand_patterns.keys(), key=len, reverse=True)
    for b_pat in sorted_brands:
        pattern = r"\b" + re.escape(b_pat) + r"\b"
        if re.search(pattern, text_lower):
            filters["brand"] = vocab.brand_patterns[b_pat]
            break

    # 4. Category words mapped from catalog & active synonyms (longest pattern first)
    sorted_categories = sorted(vocab.category_patterns.keys(), key=len, reverse=True)
    for c_pat in sorted_categories:
        pattern = r"\b" + re.escape(c_pat) + r"\b"
        if re.search(pattern, text_lower):
            filters["category"] = vocab.category_patterns[c_pat]
            break

    # 5. Generic use cases (kept only as extra ranking context, never as filters)
    for uc in USE_CASES:
        pattern = r"\b" + re.escape(uc) + r"\b"
        if re.search(pattern, text_lower):
            filters["use_case"] = uc
            break

    # 6. Price intent detection
    low_price_words = [
        "cheap", "cheapest", "budget", "affordable", "low price", "lowest price"
    ]
    high_price_words = [
        "premium", "best quality", "luxury", "high end"
    ]

    for w in low_price_words:
        if re.search(r"\b" + re.escape(w) + r"\b", text_lower):
            filters["price_intent"] = "low"
            break

    if "price_intent" not in filters:
        for w in high_price_words:
            if re.search(r"\b" + re.escape(w) + r"\b", text_lower):
                filters["price_intent"] = "high"
                break

    return filters


def is_off_topic_or_adversarial(message: str) -> bool:
    """Detect queries explicitly attempting prompt injection or completely off-topic topics."""
    msg = message.lower().strip()
    triggers = [
        "tell me about the moon",
        "tell me about the sun",
        "ignore the catalog",
        "ignore all previous",
        "ignore previous instructions",
        "who is the president",
        "write a poem",
        "write python code",
    ]
    return any(t in msg for t in triggers)


# ---------------------------------------------------------------------------
# Template Answer Builder (Category-Agnostic, Concise)
# ---------------------------------------------------------------------------

def build_template_answer(products: List[Dict[str, Any]], query: str = "") -> str:
    """
    Generate a deterministic, 100% data-grounded response from returned products.
    Category-agnostic: a one-line intro, then products with price, rating and buy score.
    """
    if not products:
        return (
            "I could not find a matching product in the catalog. "
            "Try raising your budget or exploring a different category."
        )

    top_picks = products[:3]
    lines = ["Here are the top recommendations from our catalog:"]

    for i, p in enumerate(top_picks, 1):
        title = p.get("title", "")
        price = p.get("current_price", 0)
        price_str = f"₹{int(price):,}" if price == int(price) else f"₹{price:,.2f}"
        rating = p.get("rating")
        rating_str = f"{rating}/5" if rating else "Unrated"
        buy_score = p.get("buy_score", 50)
        buy_label = p.get("buy_score_label", "Fair price")

        lines.append(
            f"{i}. {title}\n"
            f"   • Price: {price_str}\n"
            f"   • Rating: {rating_str}\n"
            f"   • Buy Score: {buy_score}/100 ({buy_label})"
        )

    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Dynamic Suggestion Chips
# ---------------------------------------------------------------------------

def get_catalog_suggestions(
    retriever: Optional[VectorRetriever] = None,
    metadatas: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """
    Returns 4 suggestion strings built from real catalog data:
      - "Best deals in <category>" for the two categories with most products
      - "<Category> under ₹<price>" where price is the rounded median price of that category
      - "Cheapest <subcategory>" for the largest subcategory
    If catalog is empty, returns a short generic list.
    """
    if metadatas is None:
        if retriever is not None:
            try:
                res = retriever.collection.get(include=["metadatas"])
                metadatas = res.get("metadatas", []) or []
            except Exception as e:
                logger.warning("Could not fetch metadatas for suggestions: %s", e)
                metadatas = []
        else:
            try:
                import chromadb
                from config import settings
                client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
                coll = client.get_collection("products")
                res = coll.get(include=["metadatas"])
                metadatas = res.get("metadatas", []) or []
            except Exception:
                metadatas = []

    if not metadatas:
        return [
            "Best deals today",
            "Trending products",
            "Budget picks",
            "Top rated items",
        ]

    top_cat_counts = Counter()
    sub_cat_counts = Counter()
    cat_prices: Dict[str, List[float]] = {}

    for m in metadatas:
        if not m:
            continue
        raw_cat = str(m.get("category", "")).strip()
        if not raw_cat:
            continue

        if " - " in raw_cat:
            parts = raw_cat.split(" - ", 1)
            top = parts[0].strip()
            sub = parts[1].strip()
        else:
            top = raw_cat
            sub = raw_cat

        top_cat_counts[top] += 1
        sub_cat_counts[sub] += 1

        price = float(m.get("current_price", 0) or 0)
        if price > 0:
            cat_prices.setdefault(top, []).append(price)

    top_ranked = [cat for cat, _ in top_cat_counts.most_common() if cat]
    sub_ranked = [sub for sub, _ in sub_cat_counts.most_common() if sub]

    if not top_ranked:
        return [
            "Best deals today",
            "Trending products",
            "Budget picks",
            "Top rated items",
        ]

    primary_cat = top_ranked[0]

    # 1. Best deals in <category 1>
    sugg1 = f"Best deals in {primary_cat}"

    # 2. Best deals in <category 2> (or largest subcategory if only 1 top-level category exists)
    if len(top_ranked) >= 2:
        sugg2 = f"Best deals in {top_ranked[1]}"
    elif sub_ranked:
        # Use largest or second largest subcategory if different from primary
        second_sub = sub_ranked[1] if len(sub_ranked) >= 2 else sub_ranked[0]
        sugg2 = f"Best deals in {second_sub}"
    else:
        sugg2 = f"Top rated in {primary_cat}"

    # 3. <Category> under ₹<price> (rounded median price of primary category)
    prices = cat_prices.get(primary_cat, [])
    if not prices:
        prices = [p for plist in cat_prices.values() for p in plist]

    if prices:
        med = statistics.median(prices)
        if med >= 5000:
            rounded_price = int(round(med / 1000.0) * 1000)
        elif med >= 1000:
            rounded_price = int(round(med / 500.0) * 500)
        else:
            rounded_price = int(round(med / 100.0) * 100)
        if rounded_price <= 0:
            rounded_price = 1000
    else:
        rounded_price = 5000

    sugg3 = f"{primary_cat} under ₹{rounded_price:,}"

    # 4. Cheapest <subcategory> for largest subcategory
    if sub_ranked:
        largest_sub = sub_ranked[0]
        sugg4 = f"Cheapest {largest_sub}"
    else:
        sugg4 = f"Cheapest {primary_cat}"

    return [sugg1, sugg2, sugg3, sugg4]


# ---------------------------------------------------------------------------
# Safety Checks on LLM Generation
# ---------------------------------------------------------------------------

_RUPEE_AMOUNT_RE = re.compile(
    r"(?:(?:₹|rs\.?|inr)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*k?))|([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*k?)\s*(?:rupees|/-)",
    re.IGNORECASE,
)


def verify_llm_answer(
    answer: str,
    products: List[Dict[str, Any]],
    all_catalog_titles: Optional[Set[str]] = None,
) -> bool:
    """
    Verify that:
    1. Every ₹ amount in answer matches one of the returned prices.
    2. No product titles outside the returned products are referenced.
    """
    if not answer or not answer.strip():
        return False

    valid_prices: Set[int] = set()
    for p in products:
        try:
            valid_prices.add(round(float(p.get("current_price", 0) or 0)))
        except (ValueError, TypeError):
            pass
        try:
            if p.get("original_price"):
                valid_prices.add(round(float(p.get("original_price", 0) or 0)))
        except (ValueError, TypeError):
            pass

    for match in _RUPEE_AMOUNT_RE.finditer(answer):
        raw_amt = match.group(1) or match.group(2)
        val = parse_price_val(raw_amt)
        if val is not None:
            if round(val) not in valid_prices:
                logger.warning(
                    "Safety check failed: LLM price '%s' (%.1f) not in valid prices %s",
                    raw_amt,
                    val,
                    valid_prices,
                )
                return False

    if all_catalog_titles:
        allowed_titles = {p.get("title", "") for p in products}
        for other_title in all_catalog_titles - allowed_titles:
            if len(other_title) >= 8 and other_title.lower() in answer.lower():
                logger.warning(
                    "Safety check failed: LLM mentioned outside product title '%s'",
                    other_title,
                )
                return False

    return True


# ---------------------------------------------------------------------------
# Shopping Assistant Pipeline
# ---------------------------------------------------------------------------

class ShoppingAssistant:
    def __init__(self, retriever: VectorRetriever, encoder: MultimodalEncoder):
        self.retriever = retriever
        self.encoder = encoder
        self._all_catalog_titles: Optional[Set[str]] = None

    def _get_catalog_titles(self) -> Set[str]:
        if self._all_catalog_titles is None:
            try:
                res = self.retriever.collection.get(include=["metadatas"])
                metas = res.get("metadatas", []) or []
                self._all_catalog_titles = {
                    m.get("title", "") for m in metas if m and m.get("title")
                }
            except Exception as e:
                logger.warning("Could not pre-fetch catalog titles: %s", e)
                self._all_catalog_titles = set()
        return self._all_catalog_titles

    async def chat(
        self,
        message: str,
        history: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """
        Process a user shopping query and return a grounded answer, product list,
        and filter metadata.
        """
        cleaned_msg = message.strip()
        if not cleaned_msg:
            return {
                "answer": "Ask about products, prices or deals.",
                "products": [],
                "filters_used": {},
                "grounded": True,
            }

        # Handle off-topic queries politely
        if is_off_topic_or_adversarial(cleaned_msg):
            return {
                "answer": (
                    "I am UrbanPick's shopping assistant and can only help with questions "
                    "about products in our catalog. Please let me know what kind of products, "
                    "brands, or budget you're looking for, and I would be delighted to assist!"
                ),
                "products": [],
                "filters_used": {},
                "grounded": True,
            }

        # Step a: Dynamic constraint extraction using catalog vocabulary
        vocab = get_cached_vocabulary(self.retriever)
        filters = extract_constraints(cleaned_msg, vocab=vocab)
        logger.info("Shopping assistant extracted filters: %s", filters)

        max_price = filters.get("max_price")
        min_price = filters.get("min_price")
        category = filters.get("category")
        brand = filters.get("brand")

        # Step b: Retrieval
        query_vector = await run_in_threadpool(self.encoder.encode_text, cleaned_msg)

        raw_candidates = await run_in_threadpool(
            self.retriever.retrieve,
            query_vector=query_vector,
            top_k=8,
            max_price=max_price,
            min_price=min_price,
            category=category,
            query_text=cleaned_msg,
        )

        # If brand was specified, filter or prioritize matching brand
        if brand:
            brand_matched = [
                p for p in raw_candidates
                if p.get("brand", "").casefold() == brand.casefold()
            ]
            if brand_matched:
                raw_candidates = brand_matched

        candidates = raw_candidates[:8]

        # Step g: If no products match
        if not candidates:
            return {
                "answer": (
                    "I could not find a matching product in the catalog. "
                    "Try raising your budget or exploring a different category."
                ),
                "products": [],
                "filters_used": filters,
                "grounded": True,
            }

        # Step c: Enrichment
        for p in candidates:
            p_price = float(p.get("current_price", 0) or 0)
            p_mrp = float(p.get("original_price", 0) or 0) if p.get("original_price") else None
            p_hist = p.get("price_history", [])

            buy_res = compute_buy_score(p_hist, p_price)
            p["buy_score"] = buy_res["score"]
            p["buy_score_verdict"] = buy_res["verdict"]
            p["buy_score_label"] = buy_res["label"]

            real_disc = compute_real_discount(p_hist, p_price, p_mrp)
            p["real_discount"] = real_disc

        # Step d: Ranking
        price_intent = filters.get("price_intent")

        if price_intent == "high":
            if len(candidates) > 1:
                prices = sorted(float(p.get("current_price", 0) or 0) for p in candidates)
                median_price = prices[len(prices) // 2]
                top_half = [p for p in candidates if float(p.get("current_price", 0) or 0) >= median_price]
                if top_half:
                    candidates = top_half

        max_price_cand = max((float(p.get("current_price", 0) or 0) for p in candidates), default=1.0)
        if max_price_cand <= 0:
            max_price_cand = 1.0

        for p in candidates:
            sim = float(p.get("similarity_score", 0.0) or 0.0)
            buy = float(p.get("buy_score", 50) or 50) / 100.0
            rating = float(p.get("rating", 0.0) or 0.0)
            rating_norm = min(5.0, max(0.0, rating)) / 5.0
            price = float(p.get("current_price", 0) or 0)

            if price_intent == "low":
                price_factor = max(0.0, 1.0 - (price / max_price_cand))
                p["final_rank_score"] = round(
                    (0.35 * sim) + (0.2 * buy) + (0.1 * rating_norm) + (0.35 * price_factor), 4
                )
            else:
                p["final_rank_score"] = round((sim * 0.5) + (buy * 0.3) + (rating_norm * 0.2), 4)

        candidates.sort(key=lambda p: p["final_rank_score"], reverse=True)
        top_products = candidates[:5]

        # Step e: Answer generation
        compact_products = []
        for p in top_products:
            compact_products.append({
                "title": p.get("title"),
                "brand": p.get("brand"),
                "current_price": p.get("current_price"),
                "original_price": p.get("original_price"),
                "rating": p.get("rating"),
                "buy_score": p.get("buy_score"),
                "buy_score_label": p.get("buy_score_label"),
                "real_discount_verdict": p.get("real_discount", {}).get("verdict"),
                "real_discount_percent": p.get("real_discount", {}).get("real_pct"),
                "specs": p.get("specs"),
            })

        system_prompt = (
            "You are UrbanPick's shopping assistant. You answer questions strictly using ONLY "
            "the products in our catalog and their price data provided below.\n\n"
            "Rules:\n"
            "1. Answer ONLY from the products listed below. Never state a spec, price, rating or fact that is not in the list.\n"
            "2. Mention at most 3 products by exact title.\n"
            "3. Explain the choice using their price, rating, buy score and real discount.\n"
            "4. If nothing matches, say so and suggest relaxing the budget.\n"
            "5. If the user asks about anything unrelated to products or shopping, politely refuse and stay on shopping.\n"
        )

        history_context = ""
        if history:
            turns = history[-6:]
            history_lines = []
            for t in turns:
                role = getattr(t, "role", "user") if hasattr(t, "role") else t.get("role", "user")
                content = getattr(t, "content", "") if hasattr(t, "content") else t.get("content", "")
                history_lines.append(f"{role.capitalize()}: {content}")
            if history_lines:
                history_context = "Conversation history:\n" + "\n".join(history_lines) + "\n\n"

        user_prompt = (
            f"Products in catalog:\n{json.dumps(compact_products, indent=2, ensure_ascii=False)}\n\n"
            f"{history_context}"
            f"User question: {cleaned_msg}\n"
        )

        llm_text: Optional[str] = None
        try:
            llm_text = await asyncio.wait_for(
                ollama_generate(
                    prompt=user_prompt,
                    system=system_prompt,
                    timeout=10,
                ),
                timeout=10.0,
            )
        except Exception as exc:
            logger.info("Ollama LLM call failed or timed out (%s). Falling back to template.", exc)
            llm_text = None

        # Step f: Safety checks after generation
        catalog_titles = self._get_catalog_titles()
        if llm_text and verify_llm_answer(llm_text, top_products, catalog_titles):
            final_answer = llm_text.strip()
            grounded = True
        else:
            final_answer = build_template_answer(top_products, cleaned_msg)
            grounded = True

        return {
            "answer": final_answer,
            "products": top_products,
            "filters_used": filters,
            "grounded": grounded,
        }
