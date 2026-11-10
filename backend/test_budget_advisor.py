"""
Tests for Budget Advisor Service and API Endpoint.
Covers:
  - Plan total never exceeds the budget
  - Mix mode returns distinct categories (or distinct subcategories if 1 category chosen)
  - Single mode returns one item in the 40-100% price band
  - Tiny budget returns the no-match message
  - Wait list only contains products with buy_score below 40
  - API endpoint validation and response shapes
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from services.budget_advisor import plan_budget, enrich_product

MULTI_CATEGORY_FIXTURE = [
    # 3 Shoes
    {
        "product_id": "shoe-1",
        "title": "Nike Air Zoom Pegasus",
        "brand": "Nike",
        "category": "Shoes - Running Shoes",
        "current_price": 2500.0,
        "original_price": 3000.0,
        "rating": 4.5,
        "price_history": [
            {"date": "2026-08-01", "price": 3000.0},
            {"date": "2026-11-01", "price": 2500.0},
        ],
    },
    {
        "product_id": "shoe-2",
        "title": "Adidas Ultraboost Light",
        "brand": "Adidas",
        "category": "Shoes - Running Shoes",
        "current_price": 2800.0,
        "original_price": 3500.0,
        "rating": 4.6,
        "price_history": [
            {"date": "2026-08-01", "price": 3500.0},
            {"date": "2026-11-01", "price": 2800.0},
        ],
    },
    {
        "product_id": "shoe-3",
        "title": "Puma Smash V2 Casual Sneakers",
        "brand": "Puma",
        "category": "Shoes - Casual Shoes",
        "current_price": 3200.0,
        "original_price": 3200.0,
        "rating": 4.2,
        "price_history": [
            {"date": "2026-08-01", "price": 3200.0},
            {"date": "2026-11-01", "price": 3200.0},
        ],
    },
    # 3 Phones
    {
        "product_id": "phone-1",
        "title": "Redmi Note 13 5G",
        "brand": "Xiaomi",
        "category": "Electronics - Smartphones",
        "current_price": 13999.0,
        "original_price": 16999.0,
        "rating": 4.3,
        "price_history": [
            {"date": "2026-08-01", "price": 16999.0},
            {"date": "2026-11-01", "price": 13999.0},
        ],
    },
    {
        "product_id": "phone-2",
        "title": "Samsung Galaxy M34 5G",
        "brand": "Samsung",
        "category": "Electronics - Smartphones",
        "current_price": 14999.0,
        "original_price": 17999.0,
        "rating": 4.4,
        "price_history": [
            {"date": "2026-08-01", "price": 17999.0},
            {"date": "2026-11-01", "price": 14999.0},
        ],
    },
    {
        "product_id": "phone-3",
        "title": "OnePlus Nord CE 3 5G",
        "brand": "OnePlus",
        "category": "Electronics - Smartphones",
        "current_price": 18999.0,
        "original_price": 21999.0,
        "rating": 4.5,
        "price_history": [
            {"date": "2026-08-01", "price": 21999.0},
            {"date": "2026-11-01", "price": 18999.0},
        ],
    },
    # 3 Watches
    {
        "product_id": "watch-1",
        "title": "Casio Vintage A168W",
        "brand": "Casio",
        "category": "Watches - Digital Watches",
        "current_price": 2495.0,
        "original_price": 2695.0,
        "rating": 4.4,
        "price_history": [
            {"date": "2026-08-01", "price": 2695.0},
            {"date": "2026-11-01", "price": 2495.0},
        ],
    },
    {
        "product_id": "watch-2",
        "title": "Timex Expedition Scout",
        "brand": "Timex",
        "category": "Watches - Analog Watches",
        "current_price": 3995.0,
        "original_price": 4995.0,
        "rating": 4.3,
        "price_history": [
            {"date": "2026-08-01", "price": 4995.0},
            {"date": "2026-11-01", "price": 3995.0},
        ],
    },
    {
        "product_id": "watch-3",
        "title": "Titan Neo Analog",
        "brand": "Titan",
        "category": "Watches - Analog Watches",
        "current_price": 6495.0,
        "original_price": 6495.0,
        "rating": 4.5,
        "price_history": [
            {"date": "2026-08-01", "price": 5000.0},
            {"date": "2026-11-01", "price": 6495.0},  # Price hike -> low buy score (< 40)
        ],
    },
]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_plan_total_never_exceeds_budget():
    """Verify plan total is always <= budget across different budgets and modes."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]

    for budget in [2000, 5000, 10000, 25000, 50000]:
        for mode in ["single", "mix"]:
            res = plan_budget(budget=budget, mode=mode, all_products=enriched)
            plan = res["plan"]
            assert plan["total"] <= budget, f"Plan total {plan['total']} exceeds budget {budget} for mode {mode}"
            assert plan["remaining"] == round(budget - plan["total"], 2)


def test_mix_mode_returns_distinct_categories():
    """Verify mix mode across multiple categories selects at most one item per top category."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]
    res = plan_budget(budget=25000, mode="mix", all_products=enriched)
    items = res["plan"]["items"]

    assert len(items) > 1
    top_cats = [item["top_category"] for item in items]
    assert len(top_cats) == len(set(top_cats)), f"Duplicate top categories found in mix: {top_cats}"


def test_single_mode_price_band():
    """Verify single mode returns exactly one item within the 40-100% price band."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]
    budget = 5000.0
    res = plan_budget(budget=budget, mode="single", all_products=enriched)
    items = res["plan"]["items"]

    assert len(items) == 1
    item = items[0]
    assert 0.4 * budget <= item["current_price"] <= budget
    assert "why" in item and len(item["why"]) > 0


def test_tiny_budget_returns_no_match_message():
    """Verify a budget below any catalog item returns empty plan and helpful message."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]
    budget = 500.0  # cheaper than 2495 (cheapest in fixture)
    res = plan_budget(budget=budget, mode="mix", all_products=enriched)

    assert res["plan"]["items"] == []
    assert res["plan"]["total"] == 0.0
    assert res["plan"]["remaining"] == budget
    assert "Nothing in the catalog fits this budget yet." in res["message"]
    assert "2,495" in res["message"]  # Lowest price in fixture


def test_wait_list_only_contains_buy_score_below_40():
    """Verify wait list strictly contains only products with buy score < 40."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]
    res = plan_budget(budget=50000, mode="mix", all_products=enriched)

    wait_list = res["wait"]
    for item in wait_list:
        assert item["buy_score"] < 40, f"Product {item['title']} in wait list has buy_score {item['buy_score']} >= 40"


def test_buy_now_only_contains_buy_score_ge_70():
    """Verify buy_now list strictly contains only products with buy score >= 70 not in plan."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]
    res = plan_budget(budget=5000, mode="mix", all_products=enriched)

    plan_ids = {item["id"] for item in res["plan"]["items"]}
    buy_now = res["buy_now"]
    for item in buy_now:
        assert item["buy_score"] >= 70, f"Product {item['title']} in buy_now has buy_score {item['buy_score']} < 70"
        assert item["id"] not in plan_ids


def test_single_category_mix_subcategories():
    """Verify selecting only one category allows up to 3 items from different subcategories."""
    enriched = [enrich_product(p) for p in MULTI_CATEGORY_FIXTURE]
    res = plan_budget(budget=10000, categories=["Shoes"], mode="mix", all_products=enriched)
    items = res["plan"]["items"]

    assert len(items) <= 3
    assert all(item["top_category"] == "Shoes" for item in items)
    subcats = [item["sub_category"] for item in items]
    # Check that different subcategories are prioritized where possible (both subcategories represented)
    assert len(set(subcats)) >= 2


def test_budget_plan_endpoint_success(client):
    """Test POST /api/v1/budget/plan end-to-end with real catalog."""
    payload = {
        "budget": 10000.0,
        "categories": ["Watches"],
        "mode": "mix",
    }
    response = client.post("/api/v1/budget/plan", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["budget"] == 10000.0
    assert data["mode"] == "mix"
    assert "plan" in data
    assert "items" in data["plan"]
    assert "buy_now" in data
    assert "wait" in data
    assert data["plan"]["total"] <= 10000.0


def test_budget_plan_endpoint_validation_errors(client):
    """Test 422 errors for out-of-range budget or invalid mode."""
    # Budget too low (< 100)
    res_low = client.post("/api/v1/budget/plan", json={"budget": 50.0, "mode": "mix"})
    assert res_low.status_code == 422

    # Budget too high (> 10,000,000)
    res_high = client.post("/api/v1/budget/plan", json={"budget": 20000000.0, "mode": "mix"})
    assert res_high.status_code == 422

    # Invalid mode
    res_mode = client.post("/api/v1/budget/plan", json={"budget": 5000.0, "mode": "random_mode"})
    assert res_mode.status_code == 422
