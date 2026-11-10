"""
End-to-End Smoke Test for UrbanPick Backend.

Exercises the full user and admin lifecycle against a running server:
1. Health check (GET /api/v1/health)
2. Sign up random user (POST /api/v1/auth/signup)
3. Log in (POST /api/v1/auth/login)
4. Text search (POST /api/v1/search)
5. Shopping assistant chat (POST /api/v1/assistant/chat)
6. Budget planner (POST /api/v1/budget/plan)
7. Save product (POST /api/v1/me/saved)
8. Record activity (POST /api/v1/me/activity)
9. Get personalized recommendations (GET /api/v1/me/recommendations)
10. Create price drop alert (POST /api/v1/alerts)
11. Simulate price drop via admin endpoint (POST /api/v1/admin/simulate-price-drop)

Usage:
    python scripts/smoke_test.py
    python scripts/smoke_test.py http://localhost:8001
"""

import os
import sys
import uuid
import httpx

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else os.getenv("API_BASE_URL", "http://127.0.0.1:8001").rstrip("/")
API_KEY = os.getenv("INGEST_API_KEY", "")


def run_smoke_test():
    print(f"=== Starting UrbanPick Smoke Test against {BASE_URL} ===\n", flush=True)
    client = httpx.Client(base_url=BASE_URL, timeout=30.0, follow_redirects=True)

    try:
        # 1. Health check
        print("[1/11] Checking backend health...", flush=True)
        r = client.get("/api/v1/health")
        assert r.status_code == 200, f"Health check failed: {r.status_code} - {r.text}"
        data = r.json()
        assert data.get("status") == "healthy", f"Backend reported unhealthy: {data}"
        print(f"       OK: {data.get('encoder', {}).get('model')} loaded, {data.get('chromadb', {}).get('indexed_products')} products indexed.", flush=True)

        # 2. Sign up random user
        print("[2/11] Signing up new random user...", flush=True)
        rand_id = uuid.uuid4().hex[:8]
        user_name = f"Smoke Tester {rand_id}"
        user_email = f"smoke_{rand_id}@example.com"
        user_pwd = f"Password_{rand_id}!123"

        r = client.post(
            "/api/v1/auth/signup",
            json={"name": user_name, "email": user_email, "password": user_pwd},
        )
        assert r.status_code == 201, f"Signup failed: {r.status_code} - {r.text}"
        user_data = r.json().get("user", {})
        assert user_data.get("email") == user_email, f"User email mismatch: {user_data}"
        print(f"       OK: Created user {user_data.get('id')} ({user_email}).", flush=True)

        # 3. Log in (fresh session cookies)
        print("[3/11] Logging in...", flush=True)
        client.cookies.clear()
        r = client.post(
            "/api/v1/auth/login",
            json={"email": user_email, "password": user_pwd},
        )
        assert r.status_code == 200, f"Login failed: {r.status_code} - {r.text}"
        assert "access_token" in client.cookies, "access_token cookie not received"
        print("       OK: Session authenticated with httpOnly cookie.", flush=True)

        # 4. Search by text
        print("[4/11] Searching products by text...", flush=True)
        r = client.post("/api/v1/search", data={"text_prompt": "watch", "top_k": 5})
        assert r.status_code == 200, f"Search failed: {r.status_code} - {r.text}"
        search_res = r.json()
        products = search_res.get("recommended_products", [])
        assert len(products) > 0, "No products returned from search"
        test_product = products[0]
        test_pid = test_product.get("product_id")
        test_price = float(test_product.get("current_price", 1000.0) or 1000.0)
        print(f"       OK: Found {len(products)} products. Selected test product: '{test_pid}' (₹{test_price}).", flush=True)

        # 5. Shopping Assistant
        print("[5/11] Calling shopping assistant...", flush=True)
        r = client.post(
            "/api/v1/assistant/chat",
            json={"message": "budget friendly watch under 5000", "history": []},
        )
        assert r.status_code == 200, f"Assistant chat failed: {r.status_code} - {r.text}"
        assistant_res = r.json()
        assert "answer" in assistant_res and assistant_res["answer"], "No assistant answer"
        print(f"       OK: Assistant returned answer ({len(assistant_res.get('products', []))} products).", flush=True)

        # 6. Budget Planner
        print("[6/11] Calling budget planner...", flush=True)
        r = client.post(
            "/api/v1/budget/plan",
            json={"budget": 10000, "categories": ["Watches"], "mode": "single"},
        )
        assert r.status_code == 200, f"Budget plan failed: {r.status_code} - {r.text}"
        budget_res = r.json()
        plan_items = budget_res.get("plan", {}).get("items", [])
        print(f"       OK: Budget plan generated ({len(plan_items)} items, total: ₹{budget_res.get('plan', {}).get('total')}).", flush=True)

        # 7. Add product to saved
        print("[7/11] Adding product to saved list...")
        r = client.post("/api/v1/me/saved", json={"product_id": test_pid})
        assert r.status_code == 200, f"Save item failed: {r.status_code} - {r.text}"
        saved_list = r.json()
        assert any(item.get("product_id") == test_pid for item in saved_list), "Saved item not in returned list"
        print(f"       OK: Product '{test_pid}' saved.")

        # 8. Record user activity
        print("[8/11] Recording user activity...", flush=True)
        r = client.post(
            "/api/v1/me/activity",
            json={"type": "view", "product_id": test_pid, "price": test_price},
        )
        assert r.status_code in (200, 204), f"Record activity failed: {r.status_code} - {r.text}"
        print("       OK: View activity recorded.", flush=True)

        # 9. Get recommendations
        print("[9/11] Fetching personalized recommendations...", flush=True)
        r = client.get("/api/v1/me/recommendations?limit=8")
        assert r.status_code == 200, f"Recommendations failed: {r.status_code} - {r.text}"
        rec_data = r.json()
        assert "state" in rec_data, "Recommendations missing state key"
        print(f"       OK: Recommendations returned state='{rec_data.get('state')}'.", flush=True)

        # 10. Create price drop alert
        print("[10/11] Creating price drop alert...", flush=True)
        target_price = max(100.0, test_price - 50.0)
        r = client.post(
            "/api/v1/alerts",
            json={
                "product_id": test_pid,
                "target_price": target_price,
                "notify_on_good_time": True,
                "channel": "email",
                "destination": user_email,
            },
        )
        assert r.status_code in (200, 201), f"Create alert failed: {r.status_code} - {r.text}"
        alert_data = r.json()
        alert_id = alert_data.get("id")
        assert alert_id, "No alert ID returned"
        print(f"       OK: Alert created (ID: {alert_id}, target: ₹{target_price}).", flush=True)

        # 11. Simulate price drop with admin endpoint
        print("[11/11] Simulating price drop via admin endpoint...", flush=True)
        headers = {}
        if API_KEY:
            headers["X-Api-Key"] = API_KEY

        sim_price = max(50.0, target_price - 10.0)
        r = client.post(
            "/api/v1/admin/simulate-price-drop",
            headers=headers,
            json={"product_id": test_pid, "new_price": sim_price},
        )
        assert r.status_code == 200, f"Simulate price drop failed: {r.status_code} - {r.text}"
        sim_res = r.json()
        assert sim_res.get("ok") is True, f"Simulation not ok: {sim_res}"
        print(f"       OK: Price dropped to ₹{sim_price}. Dispatched {sim_res.get('notifications_sent')} notification(s).", flush=True)

        # Restore original price
        client.post(
            "/api/v1/admin/simulate-price-drop",
            headers=headers,
            json={"product_id": test_pid, "new_price": test_price},
        )

        print("\nALL 11 SMOKE TEST CHECKS PASSED SUCCESSFULLY (200/201 OK)!", flush=True)

    finally:
        client.close()


if __name__ == "__main__":
    run_smoke_test()
