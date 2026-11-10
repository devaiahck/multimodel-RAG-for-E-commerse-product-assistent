"""
Tests for Personalized Recommender Service and Saved Insights.

Verifies:
1. Multi-category fixture with at least 3 categories, 3 products each.
2. User who viewed & saved products of one category gets that category's products first.
3. Products in cart or saved items are never recommended.
4. Personalization paused returns empty items with state "paused".
5. Fewer than 3 signals returns "not_enough_activity".
6. User A's activity never alters User B's results.
7. budget_max preference is strictly respected.
8. At most 3 products per brand.
9. Saved insights verdicts ("good_time", "wait", "fair") and lowest historical price.
10. FastAPI endpoint integration via TestClient.
"""

import json
import os
import sqlite3
import tempfile
import pytest
import numpy as np
import chromadb
from fastapi.testclient import TestClient

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import services.users_db as users_db
from services.recommender import get_recommendations, get_saved_insights
from main import app


@pytest.fixture(autouse=True)
def setup_test_users_db(monkeypatch):
    """Isolate users database in a temporary file for each test run."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    monkeypatch.setattr(users_db, "DB_PATH", temp_db_path)
    users_db.init_users_db()

    yield temp_db_path

    try:
        os.remove(temp_db_path)
    except Exception:
        pass


@pytest.fixture(scope="module")
def multi_category_collection():
    """
    Creates an in-memory ChromaDB collection with 3 categories:
    Electronics, Clothing, Shoes, with 3+ products each.
    Uses distinct orthogonal synthetic embeddings to guarantee clean test separation.
    """
    client = chromadb.Client()
    collection = client.get_or_create_collection(
        name="test_multi_category_catalog",
        metadata={"hnsw:space": "cosine"},
    )

    # 16-dimensional embedding space
    # Electronics centered on dim 0
    # Clothing centered on dim 1
    # Shoes centered on dim 2
    def make_vector(primary_dim: int, noise_scale: float = 0.05) -> list:
        vec = np.zeros(16, dtype=np.float32)
        vec[primary_dim] = 1.0
        vec += np.random.uniform(-noise_scale, noise_scale, size=16).astype(np.float32)
        norm = np.linalg.norm(vec)
        return (vec / norm).tolist()

    catalog = [
        # Electronics (Brand: Sony x4 to test brand cap, Samsung x1)
        {
            "id": "elec-1",
            "title": "Sony Alpha Camera",
            "brand": "Sony",
            "category": "Electronics",
            "price": 50000.0,
            "rating": 4.8,
            "price_history": [{"date": "2026-01-01", "price": 55000}, {"date": "2026-02-01", "price": 50000}],
            "vector": make_vector(0),
        },
        {
            "id": "elec-2",
            "title": "Sony Wireless Headphones",
            "brand": "Sony",
            "category": "Electronics",
            "price": 15000.0,
            "rating": 4.6,
            "price_history": [{"date": "2026-01-01", "price": 18000}, {"date": "2026-02-01", "price": 15000}],
            "vector": make_vector(0),
        },
        {
            "id": "elec-3",
            "title": "Sony Bravia Display",
            "brand": "Sony",
            "category": "Electronics",
            "price": 60000.0,
            "rating": 4.5,
            "price_history": [{"date": "2026-01-01", "price": 65000}, {"date": "2026-02-01", "price": 60000}],
            "vector": make_vector(0),
        },
        {
            "id": "elec-4",
            "title": "Sony Portable Speaker",
            "brand": "Sony",
            "category": "Electronics",
            "price": 8000.0,
            "rating": 4.4,
            "price_history": [{"date": "2026-01-01", "price": 9000}, {"date": "2026-02-01", "price": 8000}],
            "vector": make_vector(0),
        },
        {
            "id": "elec-5",
            "title": "Samsung Galaxy Tablet",
            "brand": "Samsung",
            "category": "Electronics",
            "price": 30000.0,
            "rating": 4.7,
            "price_history": [{"date": "2026-01-01", "price": 32000}, {"date": "2026-02-01", "price": 30000}],
            "vector": make_vector(0),
        },

        # Clothing (Brand: Zara x2, H&M x2)
        {
            "id": "cloth-1",
            "title": "Zara Linen Overshirt",
            "brand": "Zara",
            "category": "Clothing",
            "price": 2990.0,
            "rating": 4.3,
            "price_history": [{"date": "2026-01-01", "price": 3990}, {"date": "2026-02-01", "price": 2990}],
            "vector": make_vector(1),
        },
        {
            "id": "cloth-2",
            "title": "Zara Slim Chinos",
            "brand": "Zara",
            "category": "Clothing",
            "price": 2590.0,
            "rating": 4.2,
            "price_history": [{"date": "2026-01-01", "price": 2990}, {"date": "2026-02-01", "price": 2590}],
            "vector": make_vector(1),
        },
        {
            "id": "cloth-3",
            "title": "H&M Cotton Tee",
            "brand": "H&M",
            "category": "Clothing",
            "price": 999.0,
            "rating": 4.1,
            "price_history": [{"date": "2026-01-01", "price": 1299}, {"date": "2026-02-01", "price": 999}],
            "vector": make_vector(1),
        },
        {
            "id": "cloth-4",
            "title": "H&M Denim Jacket",
            "brand": "H&M",
            "category": "Clothing",
            "price": 3499.0,
            "rating": 4.5,
            "price_history": [{"date": "2026-01-01", "price": 3999}, {"date": "2026-02-01", "price": 3499}],
            "vector": make_vector(1),
        },

        # Shoes (Brand: Nike x2, Adidas x2)
        {
            "id": "shoe-1",
            "title": "Nike Air Zoom Pegasus",
            "brand": "Nike",
            "category": "Shoes",
            "price": 8995.0,
            "rating": 4.8,
            "price_history": [{"date": "2026-01-01", "price": 10495}, {"date": "2026-02-01", "price": 8995}],
            "vector": make_vector(2),
        },
        {
            "id": "shoe-2",
            "title": "Nike Court Vision Low",
            "brand": "Nike",
            "category": "Shoes",
            "price": 4995.0,
            "rating": 4.4,
            "price_history": [{"date": "2026-01-01", "price": 5495}, {"date": "2026-02-01", "price": 4995}],
            "vector": make_vector(2),
        },
        {
            "id": "shoe-3",
            "title": "Adidas Ultraboost Light",
            "brand": "Adidas",
            "category": "Shoes",
            "price": 11999.0,
            "rating": 4.7,
            "price_history": [{"date": "2026-01-01", "price": 13999}, {"date": "2026-02-01", "price": 11999}],
            "vector": make_vector(2),
        },
    ]

    for p in catalog:
        collection.add(
            ids=[p["id"]],
            embeddings=[p["vector"]],
            metadatas=[{
                "product_id": p["id"],
                "title": p["title"],
                "brand": p["brand"],
                "category": p["category"],
                "current_price": p["price"],
                "rating": p["rating"],
                "price_history": json.dumps(p["price_history"]),
            }],
            documents=[p["title"]],
        )

    return collection


def test_category_affinity(multi_category_collection):
    """User who viewed and saved products of Clothing gets Clothing products first."""
    u = users_db.create_user("Alice", "alice@example.com", "password123")
    user_id = u["id"]

    # Alice views cloth-1, views cloth-2, saves cloth-3 (3 usable signals in Clothing)
    users_db.add_activity(user_id, "view", product_id="cloth-1")
    users_db.add_activity(user_id, "view", product_id="cloth-2")
    users_db.add_saved_item(user_id, "cloth-3")

    res = get_recommendations(user_id, limit=5, collection=multi_category_collection)
    assert res["state"] == "ok"
    items = res["items"]
    assert len(items) > 0

    # Top recommended item must be in Clothing (since cloth-3 is saved and excluded, cloth-4 is Clothing!)
    assert items[0]["category"] == "Clothing"
    assert items[0]["id"] == "cloth-4"
    assert "Because you" in items[0]["reason"]


def test_cart_and_saved_never_recommended(multi_category_collection):
    """Products currently in cart or saved items are strictly excluded from recommendations."""
    u = users_db.create_user("Bob", "bob@example.com", "password123")
    user_id = u["id"]

    users_db.add_activity(user_id, "view", product_id="cloth-1")
    users_db.add_activity(user_id, "view", product_id="cloth-2")
    users_db.add_activity(user_id, "view", product_id="cloth-4")

    # Put cloth-1 in cart, and cloth-2 in saved
    users_db.set_cart_item(user_id, "cloth-1", quantity=1)
    users_db.add_saved_item(user_id, "cloth-2")

    res = get_recommendations(user_id, limit=10, collection=multi_category_collection)
    assert res["state"] == "ok"
    rec_ids = [item["id"] for item in res["items"]]

    assert "cloth-1" not in rec_ids
    assert "cloth-2" not in rec_ids


def test_personalization_paused(multi_category_collection):
    """When personalization_paused is set to True, returns empty items with state 'paused'."""
    u = users_db.create_user("Charlie", "charlie@example.com", "password123")
    user_id = u["id"]

    # Provide 3 signals
    users_db.add_activity(user_id, "view", product_id="shoe-1")
    users_db.add_activity(user_id, "view", product_id="shoe-2")
    users_db.add_activity(user_id, "view", product_id="shoe-3")

    # Pause personalization
    users_db.update_preferences(user_id, personalization_paused=True)

    res = get_recommendations(user_id, collection=multi_category_collection)
    assert res["state"] == "paused"
    assert res["items"] == []


def test_fewer_than_3_signals(multi_category_collection):
    """Fewer than 3 usable signals returns state 'not_enough_activity' and empty items."""
    u = users_db.create_user("Diana", "diana@example.com", "password123")
    user_id = u["id"]

    # 0 signals
    res0 = get_recommendations(user_id, collection=multi_category_collection)
    assert res0["state"] == "not_enough_activity"
    assert res0["items"] == []

    # 1 signal
    users_db.add_activity(user_id, "view", product_id="shoe-1")
    res1 = get_recommendations(user_id, collection=multi_category_collection)
    assert res1["state"] == "not_enough_activity"

    # 2 signals
    users_db.add_activity(user_id, "view", product_id="shoe-2")
    res2 = get_recommendations(user_id, collection=multi_category_collection)
    assert res2["state"] == "not_enough_activity"


def test_user_data_isolation(multi_category_collection):
    """User A's activity never alters User B's recommendations."""
    u_a = users_db.create_user("UserA", "userA@example.com", "password123")
    u_b = users_db.create_user("UserB", "userB@example.com", "password123")

    # User A interacts with Electronics
    users_db.add_activity(u_a["id"], "view", product_id="elec-1")
    users_db.add_activity(u_a["id"], "view", product_id="elec-2")
    users_db.add_activity(u_a["id"], "view", product_id="elec-3")

    # User B interacts with Shoes
    users_db.add_activity(u_b["id"], "view", product_id="shoe-1")
    users_db.add_activity(u_b["id"], "view", product_id="shoe-2")
    users_db.add_activity(u_b["id"], "view", product_id="shoe-3")

    res_a = get_recommendations(u_a["id"], limit=5, collection=multi_category_collection)
    res_b = get_recommendations(u_b["id"], limit=5, collection=multi_category_collection)

    assert res_a["items"][0]["category"] == "Electronics"
    assert res_b["items"][0]["category"] == "Shoes"


def test_budget_max_respected(multi_category_collection):
    """User preferences budget_max filter is strictly respected."""
    u = users_db.create_user("Eve", "eve@example.com", "password123")
    user_id = u["id"]

    users_db.add_activity(user_id, "view", product_id="elec-1")
    users_db.add_activity(user_id, "view", product_id="elec-2")
    users_db.add_activity(user_id, "view", product_id="elec-3")

    # Set budget_max = 20000.0 (elec-1: 50k and elec-3: 60k must be excluded)
    users_db.update_preferences(user_id, budget_max=20000.0)

    res = get_recommendations(user_id, limit=10, collection=multi_category_collection)
    assert res["state"] == "ok"
    for item in res["items"]:
        assert item["price"] <= 20000.0


def test_brand_capping_max_3(multi_category_collection):
    """At most 3 products per brand are returned, even if more match."""
    u = users_db.create_user("Frank", "frank@example.com", "password123")
    user_id = u["id"]

    # Provide interaction with Electronics (which has 4 Sony products in the fixture)
    users_db.add_activity(user_id, "view", product_id="elec-5")
    users_db.add_activity(user_id, "view", product_id="elec-5")
    users_db.add_activity(user_id, "save", product_id="elec-5")

    res = get_recommendations(user_id, limit=10, collection=multi_category_collection)
    assert res["state"] == "ok"

    sony_count = sum(1 for item in res["items"] if item["brand"].lower() == "sony")
    assert sony_count <= 3


def test_saved_insights_logic(multi_category_collection):
    """Tests /me/saved/insights verdicts and lowest historical prices."""
    u = users_db.create_user("Grace", "grace@example.com", "password123")
    user_id = u["id"]

    users_db.add_saved_item(user_id, "cloth-1")
    users_db.add_saved_item(user_id, "shoe-1")

    insights = get_saved_insights(user_id, collection=multi_category_collection)
    assert len(insights) == 2

    cloth_insight = next(i for i in insights if i["product_id"] == "cloth-1")
    assert cloth_insight["verdict"] in ("good_time", "wait", "fair")
    assert cloth_insight["current_price"] == 2990.0
    assert cloth_insight["lowest_price_in_history"] == 2990.0


def test_endpoints_via_test_client(multi_category_collection, monkeypatch):
    """FastAPI TestClient integration check for /api/v1/me/recommendations and /api/v1/me/saved/insights."""
    # Monkeypatch get_retriever in rag.retriever to return our test collection
    import rag.retriever
    class MockRetriever:
        collection = multi_category_collection

    monkeypatch.setattr(rag.retriever, "get_retriever", lambda: MockRetriever())

    u = users_db.create_user("Henry", "henry@example.com", "password123")
    token = users_db.create_session(u["id"])

    users_db.add_activity(u["id"], "view", product_id="cloth-1")
    users_db.add_activity(u["id"], "view", product_id="cloth-2")
    users_db.add_activity(u["id"], "view", product_id="cloth-3")
    users_db.add_saved_item(u["id"], "cloth-3")

    client = TestClient(app)
    client.cookies.set("access_token", token)

    # 1. Recommendations endpoint
    resp = client.get("/api/v1/me/recommendations?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "ok"
    assert len(data["items"]) > 0

    # 2. Saved insights endpoint
    resp_insights = client.get("/api/v1/me/saved/insights")
    assert resp_insights.status_code == 200
    insights_data = resp_insights.json()
    assert len(insights_data) == 1
    assert insights_data[0]["product_id"] == "cloth-3"
