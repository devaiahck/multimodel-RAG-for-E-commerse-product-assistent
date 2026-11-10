"""
Browse-endpoint tests for UrbanPick backend.

Strategy
--------
* Monkey-patch the FastAPI lifespan so it skips ML model (SigLIP encoder)
  loading while keeping the rest of the app — ChromaDB, rate-limiter, etc.
* Use TestClient(app) WITH the context manager so the event loop is set up
  properly for async route handlers that use run_in_threadpool.
* Inject test products directly via retriever.add_product(data, vector) using
  a dummy normalised vector (dimension auto-detected from the live collection,
  defaulting to 768 when the collection is empty).
* All test product_ids are prefixed "browse-test-" for easy isolation.

Covers
------
  5a. Category filter (substring, case-insensitive)
  5b. min_price / max_price filter
  5c. Sort options: price_asc, price_desc, rating, discount
  5d. Pagination: offset, limit, total
  5e. q-filter (substring over title / brand / category)
  5f. /api/v1/categories counts
  5g. /api/v1/products/{id} still works and deserialises store_availability
      and price_history as lists
"""

from __future__ import annotations

import json
import math
import sys
import os
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

# --- make sure the backend package root is on sys.path -----------------------
_backend_dir = os.path.join(os.path.dirname(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# ---------------------------------------------------------------------------
# Patch the lifespan BEFORE importing main so the encoder is never loaded.
# We replace the app's lifespan with a no-op that just yields.
# ---------------------------------------------------------------------------
import main as _main_module  # noqa: E402

@asynccontextmanager
async def _noop_lifespan(app):
    """Minimal lifespan: skip encoder loading and Ollama health check."""
    import httpx
    # Still set up the shared http_client so the ingest route doesn't crash
    # if it tries to access it; browse tests don't call ingest, but be safe.
    _main_module.http_client = httpx.AsyncClient()
    yield
    await _main_module.http_client.aclose()

_main_module.app.router.lifespan_context = _noop_lifespan

from main import app  # noqa: E402  (re-uses the already-imported module)
from rag.retriever import VectorRetriever

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FIXED_DIM = 768


def _probe_dim() -> int:
    """Return the embedding dimension of the live collection, or FIXED_DIM.

    ChromaDB may return a numpy array for embeddings, so we avoid truthiness
    checks on arrays and use explicit None / size checks instead.
    """
    import numpy as np  # noqa: PLC0415

    r = VectorRetriever()
    sample = r.collection.get(include=["embeddings"], limit=1)
    embs = sample.get("embeddings")
    if embs is None:
        return FIXED_DIM
    if isinstance(embs, np.ndarray):
        return int(embs.shape[-1]) if embs.size > 0 else FIXED_DIM
    # plain list
    if not embs or not embs[0]:
        return FIXED_DIM
    return len(embs[0])


def _unit_vector(dim: int, seed: int = 0) -> list[float]:
    """Return a deterministic L2-normalised vector of the given dimension."""
    import random
    rng = random.Random(seed)
    v = [rng.gauss(0, 1) for _ in range(dim)]
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v]


# ---------------------------------------------------------------------------
# Test products — 8 items across 4 top-level categories
# ---------------------------------------------------------------------------

BROWSE_PRODUCTS = [
    # Clothing — 3
    {
        "product_id": "browse-test-clothing-1",
        "title": "H&M Slim Fit Linen Shirt",
        "brand": "H&M",
        "category": "Clothing / Shirts",
        "specs": "100% linen fabric, slim fit, roll-up sleeve detail, machine washable",
        "image_url": None,
        "current_price": 1499.0,
        "original_price": 1999.0,
        "discount": 25.0,
        "rating": 4.1,
        "availability": "In Stock",
        "store": "Myntra",
        "store_availability": [{"store": "Myntra", "price": 1499.0, "url": "https://myntra.com/shirts"}],
        "price_history": [{"date": "2026-11-01", "price": 1499.0}],
    },
    {
        "product_id": "browse-test-clothing-2",
        "title": "Levis 511 Slim Fit Jeans",
        "brand": "Levis",
        "category": "Clothing / Jeans",
        "specs": "Slim fit stretch denim, 5 pocket styling, zip fly, mid-rise waist",
        "image_url": None,
        "current_price": 799.0,
        "original_price": 2499.0,
        "discount": 68.0,
        "rating": 4.3,
        "availability": "In Stock",
        "store": "Amazon",
        "store_availability": [{"store": "Amazon", "price": 799.0, "url": "https://amazon.in/s?k=levis"}],
        "price_history": [{"date": "2026-11-01", "price": 799.0}],
    },
    {
        "product_id": "browse-test-clothing-3",
        "title": "Puma Essential Hoodie",
        "brand": "Puma",
        "category": "Clothing / Hoodies",
        "specs": "Fleece lined hoodie with kangaroo pocket and drawstring hood",
        "image_url": None,
        "current_price": 2999.0,
        "original_price": 3999.0,
        "discount": 25.0,
        "rating": 4.5,
        "availability": "In Stock",
        "store": "Flipkart",
        "store_availability": [{"store": "Flipkart", "price": 2999.0, "url": "https://flipkart.com/search?q=puma"}],
        "price_history": [{"date": "2026-11-01", "price": 2999.0}],
    },
    # Shoes — 2
    {
        "product_id": "browse-test-shoes-1",
        "title": "Nike Air Zoom Pegasus Running Shoes",
        "brand": "Nike",
        "category": "Shoes / Running Shoes",
        "specs": "Zoom Air cushioning, breathable mesh upper, rubber outsole for traction",
        "image_url": None,
        "current_price": 7495.0,
        "original_price": 9995.0,
        "discount": 25.0,
        "rating": 4.8,
        "availability": "In Stock",
        "store": "Amazon",
        "store_availability": [{"store": "Amazon", "price": 7495.0, "url": "https://amazon.in/s?k=nike"}],
        "price_history": [{"date": "2026-11-01", "price": 7495.0}],
    },
    {
        "product_id": "browse-test-shoes-2",
        "title": "Adidas Ultraboost 22 Shoes",
        "brand": "Adidas",
        "category": "Shoes / Running Shoes",
        "specs": "Boost midsole, Primeknit upper, Continental rubber outsole",
        "image_url": None,
        "current_price": 9999.0,
        "original_price": 14999.0,
        "discount": 33.0,
        "rating": 4.6,
        "availability": "In Stock",
        "store": "Flipkart",
        "store_availability": [{"store": "Flipkart", "price": 9999.0, "url": "https://flipkart.com/search?q=adidas"}],
        "price_history": [{"date": "2026-11-01", "price": 9999.0}],
    },
    # Watches — 2
    {
        "product_id": "browse-test-watches-1",
        "title": "Titan Edge Analog Watch",
        "brand": "Titan",
        "category": "Watches / Analog Watches",
        "specs": "Super slim quartz analog watch, stainless steel case and strap",
        "image_url": None,
        "current_price": 3500.0,
        "original_price": 4500.0,
        "discount": 22.0,
        "rating": 4.2,
        "availability": "In Stock",
        "store": "Amazon",
        "store_availability": [{"store": "Amazon", "price": 3500.0, "url": "https://amazon.in/s?k=titan"}],
        "price_history": [{"date": "2026-11-01", "price": 3500.0}],
    },
    {
        "product_id": "browse-test-watches-2",
        "title": "Casio G-Shock Digital Watch",
        "brand": "Casio",
        "category": "Watches / Digital Watches",
        "specs": "Shock resistant digital watch, 200m water resistance, world time feature",
        "image_url": None,
        "current_price": 5000.0,
        "original_price": 6500.0,
        "discount": 23.0,
        "rating": 4.7,
        "availability": "In Stock",
        "store": "Croma",
        "store_availability": [{"store": "Croma", "price": 5000.0, "url": "https://flipkart.com/search?q=casio"}],
        "price_history": [{"date": "2026-11-01", "price": 5000.0}],
    },
    # Beauty — 1
    {
        "product_id": "browse-test-beauty-1",
        "title": "Nivea Soft Moisturising Cream",
        "brand": "Nivea",
        "category": "Beauty / Moisturizers",
        "specs": "Light moisturising cream with Vitamin E and Jojoba Oil, 200ml jar",
        "image_url": None,
        "current_price": 189.0,
        "original_price": 230.0,
        "discount": 18.0,
        "rating": 4.4,
        "availability": "In Stock",
        "store": "Amazon",
        "store_availability": [{"store": "Amazon", "price": 189.0, "url": "https://amazon.in/s?k=nivea"}],
        "price_history": [{"date": "2026-11-01", "price": 189.0}],
    },
]

BROWSE_IDS = [p["product_id"] for p in BROWSE_PRODUCTS]


# ---------------------------------------------------------------------------
# Fixtures: seed once per module, teardown after all tests
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def _retriever() -> VectorRetriever:
    return VectorRetriever()


@pytest.fixture(scope="module")
def seeded(_retriever: VectorRetriever) -> VectorRetriever:
    """Insert test products once; delete them in teardown."""
    dim = _probe_dim()
    for i, prod in enumerate(BROWSE_PRODUCTS):
        vec = _unit_vector(dim, seed=i)
        _retriever.add_product(prod, vec)
    yield _retriever
    for pid in BROWSE_IDS:
        _retriever.delete_product(pid)


@pytest.fixture(scope="module")
def client(seeded: VectorRetriever) -> TestClient:
    """TestClient with no-op lifespan (no encoder loaded)."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def _browse_items(resp_json: dict, prefix: str = "browse-test-") -> list[dict]:
    """Filter response items to only our test products."""
    return [it for it in resp_json["items"] if it["product_id"].startswith(prefix)]


# ---------------------------------------------------------------------------
# 5a. Category filter
# ---------------------------------------------------------------------------


def test_category_filter_clothing(client: TestClient):
    resp = client.get("/api/v1/products?category=clothing&limit=100")
    assert resp.status_code == 200
    data = resp.json()
    ids = {it["product_id"] for it in data["items"]}
    assert "browse-test-clothing-1" in ids
    assert "browse-test-clothing-2" in ids
    assert "browse-test-clothing-3" in ids
    assert "browse-test-shoes-1" not in ids
    assert "browse-test-watches-1" not in ids
    for it in data["items"]:
        assert "clothing" in it["category"].lower()
    print(f"\n[OK] category=clothing: {len(data['items'])} items")


def test_category_filter_case_insensitive(client: TestClient):
    resp_upper = client.get("/api/v1/products?category=SHOES&limit=100")
    resp_lower = client.get("/api/v1/products?category=shoes&limit=100")
    assert resp_upper.status_code == 200
    assert resp_lower.status_code == 200
    ids_u = {it["product_id"] for it in resp_upper.json()["items"]}
    ids_l = {it["product_id"] for it in resp_lower.json()["items"]}
    assert ids_u == ids_l
    assert "browse-test-shoes-1" in ids_u
    assert "browse-test-shoes-2" in ids_u
    print(f"\n[OK] case-insensitive: SHOES == shoes ({len(ids_u)} items)")


# ---------------------------------------------------------------------------
# 5b. Price range
# ---------------------------------------------------------------------------


def test_price_min_filter(client: TestClient):
    resp = client.get("/api/v1/products?min_price=5000&limit=100")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for it in items:
        assert it["current_price"] >= 5000.0
    ids = {it["product_id"] for it in items}
    assert "browse-test-shoes-1" in ids    # 7495
    assert "browse-test-shoes-2" in ids    # 9999
    assert "browse-test-watches-2" in ids  # 5000
    assert "browse-test-clothing-1" not in ids  # 1499
    print(f"\n[OK] min_price=5000: {len(items)} items, all >= 5000")


def test_price_max_filter(client: TestClient):
    resp = client.get("/api/v1/products?max_price=1500&limit=100")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for it in items:
        assert it["current_price"] <= 1500.0
    ids = {it["product_id"] for it in items}
    assert "browse-test-clothing-1" in ids  # 1499
    assert "browse-test-clothing-2" in ids  # 799
    assert "browse-test-beauty-1" in ids    # 189
    assert "browse-test-shoes-1" not in ids  # 7495
    print(f"\n[OK] max_price=1500: {len(items)} items, all <= 1500")


def test_price_range_combined(client: TestClient):
    resp = client.get("/api/v1/products?min_price=2000&max_price=5000&limit=100")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for it in items:
        assert 2000.0 <= it["current_price"] <= 5000.0
    ids = {it["product_id"] for it in items}
    assert "browse-test-clothing-3" in ids  # 2999
    assert "browse-test-watches-1" in ids   # 3500
    assert "browse-test-watches-2" in ids   # 5000
    assert "browse-test-clothing-2" not in ids  # 799
    assert "browse-test-shoes-2" not in ids     # 9999
    print(f"\n[OK] price range [2000,5000]: {len(items)} items")


# ---------------------------------------------------------------------------
# 5c. Sort options
# ---------------------------------------------------------------------------


def test_sort_price_asc(client: TestClient):
    resp = client.get("/api/v1/products?sort=price_asc&limit=100")
    assert resp.status_code == 200
    items = _browse_items(resp.json())
    assert len(items) == len(BROWSE_PRODUCTS)
    prices = [it["current_price"] for it in items]
    assert prices == sorted(prices), f"price_asc not sorted: {prices}"
    assert items[0]["product_id"] == "browse-test-beauty-1"  # 189 cheapest
    print(f"\n[OK] sort=price_asc: cheapest first ({items[0]['current_price']})")


def test_sort_price_desc(client: TestClient):
    resp = client.get("/api/v1/products?sort=price_desc&limit=100")
    assert resp.status_code == 200
    items = _browse_items(resp.json())
    prices = [it["current_price"] for it in items]
    assert prices == sorted(prices, reverse=True), f"price_desc not sorted: {prices}"
    assert items[0]["product_id"] == "browse-test-shoes-2"  # 9999 most expensive
    print(f"\n[OK] sort=price_desc: most expensive first ({items[0]['current_price']})")


def test_sort_rating(client: TestClient):
    resp = client.get("/api/v1/products?sort=rating&limit=100")
    assert resp.status_code == 200
    items = _browse_items(resp.json())
    ratings = [it["rating"] for it in items]
    assert ratings == sorted(ratings, reverse=True), f"rating not sorted: {ratings}"
    assert items[0]["product_id"] == "browse-test-shoes-1"  # 4.8 highest
    print(f"\n[OK] sort=rating: highest first ({items[0]['rating']})")


def test_sort_discount(client: TestClient):
    resp = client.get("/api/v1/products?sort=discount&limit=100")
    assert resp.status_code == 200
    items = _browse_items(resp.json())
    discounts = [it["discount"] for it in items]
    assert discounts == sorted(discounts, reverse=True), f"discount not sorted: {discounts}"
    assert items[0]["product_id"] == "browse-test-clothing-2"  # 68% highest discount
    print(f"\n[OK] sort=discount: highest discount first ({items[0]['discount']}%)")


# ---------------------------------------------------------------------------
# 5d. Pagination
# ---------------------------------------------------------------------------


def test_pagination_limit(client: TestClient):
    resp = client.get("/api/v1/products?category=clothing&limit=2&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["limit"] == 2
    assert data["offset"] == 0
    assert data["total"] >= 3
    assert len(data["items"]) == 2
    print(f"\n[OK] limit=2: got 2 items, total={data['total']}")


def test_pagination_offset(client: TestClient):
    r1 = client.get("/api/v1/products?category=clothing&limit=1&offset=0")
    r2 = client.get("/api/v1/products?category=clothing&limit=1&offset=1")
    assert r1.status_code == 200
    assert r2.status_code == 200
    d1, d2 = r1.json(), r2.json()
    assert d1["total"] == d2["total"]
    assert len(d1["items"]) == 1
    assert len(d2["items"]) == 1
    assert d1["items"][0]["product_id"] != d2["items"][0]["product_id"]
    print(f"\n[OK] offset: page1={d1['items'][0]['product_id']}, page2={d2['items'][0]['product_id']}")


def test_pagination_beyond_end(client: TestClient):
    resp = client.get("/api/v1/products?category=beauty&limit=10&offset=999")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] >= 1
    print(f"\n[OK] beyond-end: items=[], total={data['total']}")


# ---------------------------------------------------------------------------
# 5e. q filter
# ---------------------------------------------------------------------------


def test_q_filter_title(client: TestClient):
    resp = client.get("/api/v1/products?q=linen&limit=100")
    assert resp.status_code == 200
    ids = {it["product_id"] for it in resp.json()["items"]}
    assert "browse-test-clothing-1" in ids  # title: "Linen Shirt"
    assert "browse-test-shoes-1" not in ids
    print(f"\n[OK] q=linen: matched title ({len(ids)} items)")


def test_q_filter_brand(client: TestClient):
    resp = client.get("/api/v1/products?q=casio&limit=100")
    assert resp.status_code == 200
    ids = {it["product_id"] for it in resp.json()["items"]}
    assert "browse-test-watches-2" in ids  # brand: Casio
    assert "browse-test-clothing-1" not in ids
    print(f"\n[OK] q=casio: matched brand ({len(ids)} items)")


def test_q_filter_no_match(client: TestClient):
    resp = client.get("/api/v1/products?q=zzz_nomatch_zzz&limit=100")
    assert resp.status_code == 200
    items = [it for it in resp.json()["items"] if it["product_id"].startswith("browse-test-")]
    assert items == []
    print("\n[OK] q=zzz_nomatch_zzz: 0 browse-test items")


# ---------------------------------------------------------------------------
# 5f. /api/v1/categories
# ---------------------------------------------------------------------------


def test_categories_endpoint(client: TestClient):
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    cats = resp.json()
    assert isinstance(cats, list)
    for cat in cats:
        assert "slug" in cat and "label" in cat and "product_count" in cat
        assert cat["slug"] == cat["label"].lower()

    by_slug = {c["slug"]: c for c in cats}
    for expected in ("clothing", "shoes", "watches", "electronics", "home", "beauty", "sports"):
        assert expected in by_slug, f"Missing: {expected}"

    # Our seeded products contribute
    assert by_slug["clothing"]["product_count"] >= 3
    assert by_slug["shoes"]["product_count"] >= 2
    assert by_slug["watches"]["product_count"] >= 2
    assert by_slug["beauty"]["product_count"] >= 1

    # Fixed order preserved
    slugs = [c["slug"] for c in cats]
    fixed = ["clothing", "shoes", "watches", "electronics", "home", "beauty", "sports"]
    positions = [slugs.index(s) for s in fixed if s in slugs]
    assert positions == sorted(positions), "Fixed category order violated"
    print(f"\n[OK] /api/v1/categories: {len(cats)} cats, correct order")


# ---------------------------------------------------------------------------
# 5g. /api/v1/products/{id}
# ---------------------------------------------------------------------------


def test_get_product_by_id(client: TestClient):
    resp = client.get("/api/v1/products/browse-test-watches-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["product_id"] == "browse-test-watches-1"
    assert data["title"] == "Titan Edge Analog Watch"
    # store_availability must be a list, not a JSON string
    sa = data["store_availability"]
    assert isinstance(sa, list), f"store_availability: expected list, got {type(sa)}"
    assert len(sa) == 1
    assert sa[0]["store"] == "Amazon"
    # price_history must be a list
    ph = data["price_history"]
    assert isinstance(ph, list), f"price_history: expected list, got {type(ph)}"
    assert len(ph) == 1
    print(f"\n[OK] GET /products/{{id}}: store_availability=list({len(sa)}), price_history=list({len(ph)})")


def test_get_product_not_found(client: TestClient):
    resp = client.get("/api/v1/products/browse-test-does-not-exist-xyz")
    assert resp.status_code == 404
    print("\n[OK] 404 for unknown product id")
