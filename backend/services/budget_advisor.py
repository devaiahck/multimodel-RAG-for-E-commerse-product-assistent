"""
Budget Advisor Service.
Deterministic budget planning without LLM.
Recommends the best way to spend a given budget based on price, rating,
real discount, and buy confidence score.
"""

import json
import logging
import time
from typing import List, Dict, Any, Optional, Set

from services.price_score import compute_buy_score, compute_real_discount

logger = logging.getLogger(__name__)

CACHE_TTL = 300.0  # 5 minutes
_enriched_cache: Optional[List[Dict[str, Any]]] = None
_enriched_cache_time: float = 0.0


def reset_budget_cache():
    """Clear memory cache (used by tests)."""
    global _enriched_cache, _enriched_cache_time
    _enriched_cache = None
    _enriched_cache_time = 0.0


def enrich_product(p: Dict[str, Any]) -> Dict[str, Any]:
    """Enrich raw product metadata with buy score and real discount."""
    price = float(p.get("current_price", 0) or 0)
    mrp = float(p.get("original_price", 0) or 0) if p.get("original_price") else None

    raw_hist = p.get("price_history", [])
    if isinstance(raw_hist, str):
        try:
            hist = json.loads(raw_hist)
        except Exception:
            hist = []
    elif isinstance(raw_hist, list):
        hist = raw_hist
    else:
        hist = []

    buy_res = compute_buy_score(hist, price)
    real_disc = compute_real_discount(hist, price, mrp)

    rating_raw = p.get("rating")
    rating = float(rating_raw) if rating_raw is not None else 0.0

    raw_cat = str(p.get("category", "")).strip()
    if " - " in raw_cat:
        parts = raw_cat.split(" - ", 1)
        top_cat = parts[0].strip()
        sub_cat = parts[1].strip()
    else:
        top_cat = raw_cat
        sub_cat = raw_cat

    return {
        "id": str(p.get("product_id") or p.get("id", "")),
        "product_id": str(p.get("product_id") or p.get("id", "")),
        "title": str(p.get("title", "")),
        "brand": str(p.get("brand", "")),
        "category": raw_cat,
        "top_category": top_cat,
        "sub_category": sub_cat,
        "current_price": price,
        "price": price,
        "original_price": mrp,
        "rating": rating,
        "image_url": p.get("image_url"),
        "specs": p.get("specs", ""),
        "buy_score": int(buy_res["score"]),
        "buy_score_verdict": buy_res["verdict"],
        "buy_score_label": buy_res["label"],
        "real_discount": real_disc,
        "real_discount_verdict": real_disc["verdict"],
        "real_discount_pct": float(real_disc["real_pct"]),
        "typical_price": float(real_disc["typical_price"]),
    }


def get_all_enriched_products(retriever=None, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Retrieve and cache all enriched products from Chroma."""
    global _enriched_cache, _enriched_cache_time
    now = time.time()
    if not force_refresh and _enriched_cache is not None and (now - _enriched_cache_time < CACHE_TTL):
        return _enriched_cache

    metadatas: List[Dict[str, Any]] = []
    if retriever is not None:
        try:
            res = retriever.collection.get(include=["metadatas"])
            metadatas = res.get("metadatas", []) or []
        except Exception as e:
            logger.warning("Could not fetch Chroma metadata for budget advisor: %s", e)
    else:
        try:
            import chromadb
            from config import settings
            client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
            coll = client.get_or_create_collection(name="products", metadata={"hnsw:space": "cosine"})
            res = coll.get(include=["metadatas"])
            metadatas = res.get("metadatas", []) or []
        except Exception as e:
            logger.warning("Could not read Chroma directly: %s", e)

    _enriched_cache = [enrich_product(m) for m in metadatas if m and m.get("current_price")]
    _enriched_cache_time = now
    return _enriched_cache


def compute_value_score(product: Dict[str, Any], budget: float, mode: str) -> float:
    """
    Compute deterministic value score for candidate (price <= budget):
    value = 0.4*(buy_score/100) + 0.3*(rating/5) + 0.2*realDiscountScore + 0.1*priceFit
    """
    buy_score = float(product.get("buy_score", 50))
    rating = float(product.get("rating", 0.0))
    price = float(product.get("current_price", 0.0))
    real_pct = float(product.get("real_discount_pct", 0.0))

    buy_norm = max(0.0, min(1.0, buy_score / 100.0))
    rating_norm = max(0.0, min(1.0, rating / 5.0))

    # realDiscountScore = clamp(realPct/30, 0, 1) (0 when realPct is negative)
    real_disc_score = max(0.0, min(1.0, real_pct / 30.0)) if real_pct > 0 else 0.0

    # priceFit = how well price uses budget (price/budget, capped at 1 for "single"; 0 for "mix")
    if mode == "single" and budget > 0:
        price_fit = max(0.0, min(1.0, price / budget))
    else:
        price_fit = 0.0

    score = (0.4 * buy_norm) + (0.3 * rating_norm) + (0.2 * real_disc_score) + (0.1 * price_fit)
    return round(score, 4)


def build_why_sentence(item: Dict[str, Any]) -> str:
    """Build one short factual sentence explaining why this product is recommended."""
    real_pct = item.get("real_discount_pct", 0.0)
    verdict = item.get("real_discount_verdict", "none")
    buy_score = item.get("buy_score", 50)
    rating = item.get("rating", 0.0)

    if verdict == "genuine" and real_pct >= 5:
        pct_str = f"{real_pct:.0f}%" if real_pct == int(real_pct) else f"{real_pct:.1f}%"
        return f"{pct_str} below its 90-day typical price, buy score {buy_score}"
    elif verdict == "inflated":
        return f"Fairly priced near its typical median, buy score {buy_score}"
    elif buy_score >= 70:
        if rating > 0:
            return f"High buy score of {buy_score} and customer rating of {rating:.1f}/5"
        return f"High buy confidence score of {buy_score}"
    elif real_pct > 0:
        pct_str = f"{real_pct:.0f}%" if real_pct == int(real_pct) else f"{real_pct:.1f}%"
        return f"{pct_str} below typical tracking, buy score {buy_score}"
    else:
        if rating > 0:
            return f"Buy score {buy_score}, customer rating {rating:.1f}/5"
        return f"Balanced value with buy score {buy_score}"


def plan_budget(
    budget: float,
    categories: Optional[List[str]] = None,
    mode: str = "mix",
    all_products: Optional[List[Dict[str, Any]]] = None,
    retriever=None,
) -> Dict[str, Any]:
    """
    Plan spending for given budget and category constraints.
    Returns:
      {
        "budget": float,
        "mode": str,
        "plan": {
            "items": [...],
            "total": float,
            "remaining": float
        },
        "buy_now": [...],
        "wait": [...],
        "message": Optional[str]
      }
    """
    mode = mode.lower().strip() if mode else "mix"
    if mode not in ("single", "mix"):
        mode = "mix"

    if all_products is None:
        all_products = get_all_enriched_products(retriever=retriever)
    else:
        # If raw dicts provided without enrichment, ensure they are enriched
        if all_products and "buy_score" not in all_products[0]:
            all_products = [enrich_product(p) for p in all_products]

    # Overall cheapest product in catalog (for helpful no-match message)
    min_catalog_price = min((p["current_price"] for p in all_products if p["current_price"] > 0), default=0.0)

    # Filter by categories if specified
    clean_categories: Set[str] = set()
    if categories:
        for c in categories:
            c_clean = str(c).strip()
            if c_clean and c_clean.lower() != "all":
                clean_categories.add(c_clean.casefold())

    pool = all_products
    if clean_categories:
        pool = [
            p for p in all_products
            if p["top_category"].casefold() in clean_categories
            or p["category"].casefold() in clean_categories
        ]

    # Filter candidates with price <= budget
    candidates = [p for p in pool if p["current_price"] <= budget]

    # If no candidates fit the budget
    if not candidates:
        if min_catalog_price > 0 and budget < min_catalog_price:
            price_str = f"₹{int(min_catalog_price):,}"
            msg = f"Nothing in the catalog fits this budget yet. The lowest priced product in the catalog is {price_str}."
        else:
            msg = "Nothing in the catalog fits this budget yet."

        return {
            "budget": budget,
            "mode": mode,
            "plan": {
                "items": [],
                "total": 0.0,
                "remaining": budget,
            },
            "buy_now": [],
            "wait": [],
            "message": msg,
        }

    # Score candidates
    scored_candidates = []
    for p in candidates:
        val = compute_value_score(p, budget=budget, mode=mode)
        item_copy = dict(p)
        item_copy["value_score"] = val
        scored_candidates.append(item_copy)

    # Sort descending by value score
    scored_candidates.sort(key=lambda x: x["value_score"], reverse=True)

    plan_items: List[Dict[str, Any]] = []

    if mode == "single":
        # Consider only products priced between 40% and 100% of the budget
        qualifying = [p for p in scored_candidates if 0.4 * budget <= p["current_price"] <= budget]
        if not qualifying:
            # Relax lower bound to 10%
            qualifying = [p for p in scored_candidates if 0.1 * budget <= p["current_price"] <= budget]

        if qualifying:
            best_item = dict(qualifying[0])
            best_item["why"] = build_why_sentence(best_item)
            plan_items.append(best_item)

    else:
        # mode == "mix"
        # Greedy selection, highest value first, at most 4 items.
        # Check if user chose only one category
        # If exactly one category is selected, or if all candidates belong to a single top category,
        # allow up to 3 items, preferring distinct subcategories.
        distinct_top_cats_in_pool = {p["top_category"] for p in candidates}
        single_category_mode = (len(clean_categories) == 1) or (len(distinct_top_cats_in_pool) == 1)

        running_total = 0.0
        used_top_cats: Set[str] = set()
        used_sub_cats: Set[str] = set()

        if single_category_mode:
            # Allow up to 3 items from it, but from different subcategories where possible
            max_mix_items = 3
            # Phase 1: Try picking items with different subcategories
            for p in scored_candidates:
                if len(plan_items) >= max_mix_items:
                    break
                if running_total + p["current_price"] <= budget:
                    if p["sub_category"] not in used_sub_cats:
                        item_copy = dict(p)
                        item_copy["why"] = build_why_sentence(item_copy)
                        plan_items.append(item_copy)
                        running_total += p["current_price"]
                        used_sub_cats.add(p["sub_category"])

            # Phase 2: If we still have budget and space, allow any other fitting item from candidates
            if len(plan_items) < max_mix_items:
                chosen_ids = {item["id"] for item in plan_items}
                for p in scored_candidates:
                    if len(plan_items) >= max_mix_items:
                        break
                    if p["id"] not in chosen_ids and running_total + p["current_price"] <= budget:
                        item_copy = dict(p)
                        item_copy["why"] = build_why_sentence(item_copy)
                        plan_items.append(item_copy)
                        running_total += p["current_price"]
                        chosen_ids.add(p["id"])

        else:
            # Default mix: at most 4 items, only one item per top-level category
            max_mix_items = 4
            for p in scored_candidates:
                if len(plan_items) >= max_mix_items:
                    break
                if p["top_category"] not in used_top_cats:
                    if running_total + p["current_price"] <= budget:
                        item_copy = dict(p)
                        item_copy["why"] = build_why_sentence(item_copy)
                        plan_items.append(item_copy)
                        running_total += p["current_price"]
                        used_top_cats.add(p["top_category"])

    total = sum(item["current_price"] for item in plan_items)
    remaining = max(0.0, round(budget - total, 2))
    plan_item_ids = {item["id"] for item in plan_items}

    # buy_now: candidates with buy_score >= 70 (top 5 by value, not already in the plan)
    buy_now_pool = [
        dict(p) for p in scored_candidates
        if p["id"] not in plan_item_ids and p["buy_score"] >= 70
    ]
    buy_now_pool.sort(key=lambda x: x["value_score"], reverse=True)
    buy_now = buy_now_pool[:5]

    # wait: candidates with buy_score < 40 (top 5 by rating)
    wait_pool = [
        dict(p) for p in scored_candidates
        if p["buy_score"] < 40
    ]
    wait_pool.sort(key=lambda x: x["rating"], reverse=True)
    wait = wait_pool[:5]

    return {
        "budget": budget,
        "mode": mode,
        "plan": {
            "items": plan_items,
            "total": total,
            "remaining": remaining,
        },
        "buy_now": buy_now,
        "wait": wait,
        "message": None if plan_items else "Nothing in the catalog fits this budget yet.",
    }
