"""
Persistent Vector Retriever using ChromaDB.

Design notes:
- Uses cosine distance space ("hnsw:space": "cosine").
- ChromaDB cosine distance is in [0, 2]:
    0 = identical vectors, 1 = orthogonal, 2 = opposite.
- similarity_score = 1 - distance, then clamped to [0.0, 1.0] so
  users never see confusing negative numbers.
- Complex fields (store_availability, price_history) are serialized to
  JSON strings because ChromaDB metadata only supports flat types.

Lexical rerank (applied when query_text is non-empty):
  After vector retrieval and post-filtering, a lightweight overlap score is
  computed over title + brand + category + specs:

    1. Tokenise query_text: lowercase, split on non-alphanumeric chars, drop
       stopwords and pure-number tokens, strip trailing "s" from tokens > 3
       chars (simple plural normalisation).
    2. For each candidate count the fraction of query tokens that appear as a
       substring in the product text (title and category hits are weighted 2×).
    3. final_score = vector_similarity + 0.35 × overlap  (clamped to [0, 1])

  Candidates are then re-sorted by final_score (descending) before truncating
  to top_k.  Pure image queries (empty query_text) skip this step entirely.

Candidate pool sizing:
  When any filter is active (max_price, category, form-factor keywords), or
  when query_text is provided (for rerank), n_results = min(total, 2000) so
  that all matching products are reachable.  Without filters and without text,
  n_results = max(top_k × 5, 50).
"""

import json
import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

import chromadb

from config import settings

logger = logging.getLogger(__name__)

# Fetch extra results before applying post-query filters.
OVER_FETCH_MULTIPLIER = 5
OVER_FETCH_MIN = 50
MAX_CANDIDATE_CAP = 2000

# ---------------------------------------------------------------------------
# Lexical rerank helpers
# ---------------------------------------------------------------------------

_STOPWORDS = frozenset({
    "a", "an", "the", "for", "under", "below", "over", "above",
    "with", "and", "of", "in", "to", "best", "cheap", "buy",
    "price", "rs", "inr",
})

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _tokenise(text: str) -> List[str]:
    """Lowercase → split on non-alphanumeric → drop stopwords & pure numbers → simple plural strip."""
    raw = _NON_ALNUM.split(text.casefold())
    tokens: List[str] = []
    for t in raw:
        if not t:
            continue
        if t in _STOPWORDS:
            continue
        if t.isdigit():
            continue
        # Strip trailing "s" for simple plural normalisation (token > 3 chars)
        if len(t) > 3 and t.endswith("s"):
            t = t[:-1]
        tokens.append(t)
    return tokens


def _lexical_overlap(query_tokens: List[str], meta: Dict[str, Any]) -> float:
    """Return overlap ∈ [0, 1]: fraction of query tokens found in product text.

    Title and category hits are weighted 2×; brand and specs hits 1×.
    """
    if not query_tokens:
        return 0.0

    title    = str(meta.get("title",    "")).casefold()
    brand    = str(meta.get("brand",    "")).casefold()
    category = str(meta.get("category", "")).casefold()
    specs    = str(meta.get("specs",    "")).casefold()

    weighted_hits = 0.0
    max_weight = len(query_tokens) * 2.0  # title/category weight is 2× per token

    for tok in query_tokens:
        if tok in title or tok in category:
            weighted_hits += 2.0
        elif tok in brand or tok in specs:
            weighted_hits += 1.0

    return min(1.0, weighted_hits / max_weight) if max_weight > 0 else 0.0


class VectorRetriever:

    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)

        # Cosine distance space — all embeddings must be normalized.
        self.collection = self.client.get_or_create_collection(
            name="products",
            metadata={"hnsw:space": "cosine"},
        )

        logger.info(
            "VectorRetriever ready. Indexed products: %d",
            self.collection.count(),
        )

    # ------------------------------------------------------------------
    # Add / update
    # ------------------------------------------------------------------

    def add_product(self, product_data: Dict[str, Any], vector: List[float]) -> None:
        """Insert or update (upsert) a product in ChromaDB."""

        product_id = str(product_data["product_id"]).strip()

        # Serialize complex fields to JSON strings for ChromaDB compatibility.
        store_availability_json = json.dumps(
            product_data.get("store_availability") or [], ensure_ascii=False
        )
        price_history_json = json.dumps(
            product_data.get("price_history") or [], ensure_ascii=False
        )
        image_credit_json = json.dumps(
            product_data.get("image_credit") or {}, ensure_ascii=False
        )

        metadata = {
            "product_id": product_id,
            "title": str(product_data.get("title", "") or ""),
            "brand": str(product_data.get("brand", "") or ""),
            "category": str(product_data.get("category", "") or ""),
            "specs": str(product_data.get("specs", "") or ""),
            "current_price": float(product_data.get("current_price", 0) or 0),
            "original_price": float(product_data.get("original_price", 0) or 0),
            "discount": float(product_data.get("discount", 0) or 0),
            "rating": float(product_data.get("rating", 0) or 0),
            "availability": str(product_data.get("availability", "In Stock") or "In Stock"),
            "store": str(product_data.get("store", "") or ""),
            "image_url": str(product_data.get("image_url", "") or ""),
            "image_credit": image_credit_json,
            "store_availability": store_availability_json,
            "price_history": price_history_json,
            "indexed_at": datetime.utcnow().isoformat(),
        }

        # Human-readable document text used by ChromaDB for BM25 fallback.
        document = (
            f"Product: {metadata['title']}\n"
            f"Brand: {metadata['brand']}\n"
            f"Category: {metadata['category']}\n"
            f"Price: {metadata['current_price']}\n"
            f"Specifications: {metadata['specs']}\n"
            f"Availability: {metadata['availability']}"
        )

        self.collection.upsert(
            ids=[product_id],
            embeddings=[vector],
            metadatas=[metadata],
            documents=[document],
        )

        logger.info(
            "Upserted product '%s' (%s). Total indexed: %d",
            product_id,
            metadata["title"],
            self.collection.count(),
        )

    # ------------------------------------------------------------------
    # Retrieve
    # ------------------------------------------------------------------

    def retrieve(
        self,
        query_vector: List[float],
        top_k: int = 5,
        max_price: Optional[float] = None,
        min_price: Optional[float] = None,
        category: Optional[str] = None,
        query_text: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant products with semantic similarity + optional filters
        + lexical rerank.

        Filters applied (post-query):
        - max_price: exclude products whose current_price > max_price
        - min_price: exclude products whose current_price < min_price
        - category: substring match (case-insensitive)
        - query_text: keyword guards for over-ear / in-ear form factors

        When query_text is non-empty, a lexical overlap score is blended with
        the vector similarity before final ranking:
            final_score = similarity + 0.35 * overlap  (clamped [0, 1])

        Returns products sorted by descending final_score (best first).
        """

        total = self.collection.count()

        if total == 0 or top_k <= 0:
            logger.info("Retrieve called on empty collection or top_k=0.")
            return []

        # Detect form-factor constraints from the query text.
        query_lower = (query_text or "").casefold().replace("-", " ")
        requires_over_ear = "over ear" in query_lower
        requires_in_ear = any(
            kw in query_lower for kw in ("in ear", "earbuds", "earphones", "tws")
        )

        needs_filtering = (
            max_price is not None
            or min_price is not None
            or bool(category and category.strip())
            or requires_over_ear
            or requires_in_ear
        )

        # When any filter is active OR when we have text for reranking,
        # pull ALL candidates (capped at MAX_CANDIDATE_CAP) so that
        # post-filter / rerank operates over the full relevant pool.
        has_text = bool(query_text and query_text.strip())
        if needs_filtering or has_text:
            n_results = min(total, MAX_CANDIDATE_CAP)
        else:
            n_results = min(total, max(top_k * OVER_FETCH_MULTIPLIER, OVER_FETCH_MIN))

        raw = self.collection.query(
            query_embeddings=[query_vector],
            n_results=n_results,
            include=["metadatas", "distances"],
        )

        metadatas: List[Dict] = raw.get("metadatas", [[]])[0]
        distances: List[float] = raw.get("distances", [[]])[0]

        # Tokenise query once for rerank (empty → skip rerank)
        query_tokens = _tokenise(query_text) if has_text else []

        products: List[Dict[str, Any]] = []

        for meta, dist in zip(metadatas, distances):
            if meta is None:
                continue

            # --- price filter ---
            try:
                price = float(meta.get("current_price", 0) or 0)
            except (TypeError, ValueError):
                price = 0.0

            if max_price is not None and price > max_price:
                continue

            if min_price is not None and price < min_price:
                continue

            # --- category filter ---
            product_category = str(meta.get("category", "")).casefold()
            if category and category.strip():
                if category.strip().casefold() not in product_category:
                    continue

            # --- form-factor keyword filters ---
            title = str(meta.get("title", "")).casefold().replace("-", " ")
            specs = str(meta.get("specs", "")).casefold().replace("-", " ")
            details = f"{title} {specs}"

            if requires_over_ear and "over ear" not in details:
                continue

            if requires_in_ear and not any(
                kw in details for kw in ("in ear", "earbud", "earphone", "tws")
            ):
                continue

            # --- base vector similarity ---
            # ChromaDB cosine distance ∈ [0, 2]; clamp score to [0, 1].
            similarity = max(0.0, min(1.0, 1.0 - float(dist)))

            # --- lexical rerank blend ---
            if query_tokens:
                overlap = _lexical_overlap(query_tokens, meta)
                final_score = min(1.0, similarity + 0.35 * overlap)
            else:
                final_score = similarity

            product = dict(meta)
            product["similarity_score"] = round(final_score, 4)

            # Deserialize JSON fields back to Python structures.
            for field in ("store_availability", "price_history"):
                raw_val = product.get(field, "[]")
                try:
                    product[field] = json.loads(raw_val) if isinstance(raw_val, str) else raw_val
                except (json.JSONDecodeError, TypeError):
                    product[field] = []

            # Deserialize image_credit if present
            raw_credit = product.get("image_credit")
            if raw_credit:
                try:
                    product["image_credit"] = json.loads(raw_credit) if isinstance(raw_credit, str) else raw_credit
                except (json.JSONDecodeError, TypeError):
                    product["image_credit"] = None
            else:
                product["image_credit"] = None

            products.append(product)

        # Re-sort by final_score descending, then truncate to top_k.
        products.sort(key=lambda p: p["similarity_score"], reverse=True)
        products = products[:top_k]

        logger.info(
            "Retrieve: %d product(s) returned (top_k=%d, indexed=%d, "
            "max_price=%s, category=%s, rerank=%s).",
            len(products),
            top_k,
            total,
            max_price,
            category,
            bool(query_tokens),
        )

        return products

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_product(self, product_id: str) -> bool:
        """
        Delete one product by ID.

        Returns True if deleted, False if not found.
        """
        product_id = str(product_id).strip()

        if not product_id:
            raise ValueError("product_id cannot be empty.")

        existing = self.collection.get(ids=[product_id], include=["metadatas"])

        if not existing.get("ids"):
            logger.info("Delete requested for '%s' — not found.", product_id)
            return False

        self.collection.delete(ids=[product_id])
        logger.info(
            "Deleted product '%s'. Remaining: %d",
            product_id,
            self.collection.count(),
        )
        return True

    # ------------------------------------------------------------------
    # Clear (dangerous)
    # ------------------------------------------------------------------

    def _clear_for_tests(self) -> None:
        """
        Delete the entire products collection and recreate it empty.

        **Private — do not call from application code.**
        This exists solely for test teardown. The public API surface for
        clearing the catalog is ``DELETE /api/v1/admin/clear``.

        WARNING: Irreversible. Only use to reset the catalog deliberately.
        """
        self.client.delete_collection(name="products")
        self.collection = self.client.get_or_create_collection(
            name="products",
            metadata={"hnsw:space": "cosine"},
        )
        logger.warning("Products collection cleared and recreated empty.")


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_retriever: Optional[VectorRetriever] = None


def get_retriever() -> VectorRetriever:
    """Return the shared singleton VectorRetriever instance."""
    global _retriever
    if _retriever is None:
        _retriever = VectorRetriever()
    return _retriever
