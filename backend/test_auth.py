"""
Unit and integration tests for Authentication, Sessions, Rate Limiting,
User Data (/api/v1/me/*), and Price Drop Alerts.
"""

import os
import pytest
from fastapi.testclient import TestClient

from main import app
from services.users_db import (
    init_users_db,
    get_db_connection,
    delete_user_account,
    get_user_by_email,
)
from services.alerts_db import init_db as init_alerts_db, get_db_connection as get_alerts_conn


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def setup_databases(client):
    """Ensure clean test databases and clear cookies before tests run."""
    client.cookies.clear()
    init_users_db()
    init_alerts_db()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM users")
            conn.execute("DELETE FROM sessions")
            conn.execute("DELETE FROM cart_items")
            conn.execute("DELETE FROM saved_items")
            conn.execute("DELETE FROM history")
            conn.execute("DELETE FROM activity")
            conn.execute("DELETE FROM preferences")
            conn.execute("DELETE FROM signup_attempts")
            conn.execute("DELETE FROM login_attempts")
    finally:
        conn.close()

    aconn = get_alerts_conn()
    try:
        with aconn:
            aconn.execute("DELETE FROM alerts")
    finally:
        aconn.close()

    yield
    client.cookies.clear()


def test_signup_success(client):
    email = "test_user_signup@example.com"
    u = get_user_by_email(email)
    if u:
        delete_user_account(u["id"])

    res = client.post(
        "/api/v1/auth/signup",
        json={"name": "Test User", "email": email, "password": "password123"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "user" in data
    assert data["user"]["email"] == email
    assert data["user"]["name"] == "Test User"
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]
    assert "access_token" in client.cookies


def test_signup_duplicate_email_case_insensitive(client):
    email = "test_dup@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={"name": "First User", "email": email, "password": "password123"},
    )

    # Attempt with uppercase
    res = client.post(
        "/api/v1/auth/signup",
        json={"name": "Second User", "email": email.upper(), "password": "password123"},
    )
    assert res.status_code == 400
    assert "already exists" in res.json()["detail"].lower()


def test_signup_short_password(client):
    res = client.post(
        "/api/v1/auth/signup",
        json={"name": "Short Pwd", "email": "short@example.com", "password": "short"},
    )
    assert res.status_code == 422


def test_login_and_me_and_logout(client):
    email = "test_flow@example.com"
    password = "secure_password_123"
    client.post(
        "/api/v1/auth/signup",
        json={"name": "Flow User", "email": email, "password": password},
    )

    # Clear cookie to test fresh login
    client.cookies.clear()

    # GET /auth/me without cookies returns 401
    me_unauth = client.get("/api/v1/auth/me")
    assert me_unauth.status_code == 401

    # Login
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    assert "access_token" in client.cookies

    # GET /auth/me with active session
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == email

    # Logout
    logout_res = client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 204

    # Subsequent /auth/me returns 401
    me_after_logout = client.get("/api/v1/auth/me")
    assert me_after_logout.status_code == 401


def test_login_wrong_password_generic_error(client):
    email = "test_wrong_pwd@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={"name": "User", "email": email, "password": "correct_password"},
    )
    client.cookies.clear()

    res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong_password"},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Incorrect email or password."


def test_login_rate_limiting(client):
    email = "test_ratelimit_login@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={"name": "RL User", "email": email, "password": "real_password"},
    )
    client.cookies.clear()

    # 5 failed attempts
    for _ in range(5):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong_attempt"},
        )
        assert r.status_code == 400

    # 6th attempt should be blocked by rate limiter
    r6 = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong_attempt"},
    )
    assert r6.status_code == 429
    assert "too many failed login attempts" in r6.json()["detail"].lower()


def test_change_password(client):
    email = "test_change_pwd@example.com"
    old_pwd = "initial_password_123"
    new_pwd = "new_strong_password_456"

    client.post(
        "/api/v1/auth/signup",
        json={"name": "Pwd User", "email": email, "password": old_pwd},
    )

    # Try change password with bad old password
    bad_res = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "wrong_old_pwd", "new_password": new_pwd},
    )
    assert bad_res.status_code == 400

    # Successful change password
    good_res = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": old_pwd, "new_password": new_pwd},
    )
    assert good_res.status_code == 200

    # Clear cookies
    client.cookies.clear()

    # Login with new password
    login_new = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": new_pwd},
    )
    assert login_new.status_code == 200


def test_user_data_isolation_cart_and_saved(client):
    # User 1
    u1_res = client.post(
        "/api/v1/auth/signup",
        json={"name": "User One", "email": "user1@example.com", "password": "password123"},
    )
    u1_token = client.cookies.get("access_token")

    # User 1 adds item to cart & saved
    client.post("/api/v1/me/cart", json={"product_id": "prod-101", "quantity": 2})
    client.post("/api/v1/me/saved", json={"product_id": "prod-202"})

    cart_u1 = client.get("/api/v1/me/cart").json()
    saved_u1 = client.get("/api/v1/me/saved").json()
    assert len(cart_u1) == 1
    assert cart_u1[0]["product_id"] == "prod-101"
    assert cart_u1[0]["quantity"] == 2
    assert len(saved_u1) == 1
    assert saved_u1[0]["product_id"] == "prod-202"

    # User 2
    client.cookies.clear()
    u2_res = client.post(
        "/api/v1/auth/signup",
        json={"name": "User Two", "email": "user2@example.com", "password": "password123"},
    )

    # User 2 sees empty cart & saved
    cart_u2 = client.get("/api/v1/me/cart").json()
    saved_u2 = client.get("/api/v1/me/saved").json()
    assert len(cart_u2) == 0
    assert len(saved_u2) == 0

    # Back to User 1
    client.cookies.set("access_token", u1_token)
    cart_u1_again = client.get("/api/v1/me/cart").json()
    assert len(cart_u1_again) == 1
    assert cart_u1_again[0]["product_id"] == "prod-101"


def test_personalization_pause_stops_activity_logging(client):
    client.post(
        "/api/v1/auth/signup",
        json={"name": "Active User", "email": "active_user@example.com", "password": "password123"},
    )

    # Log activity when NOT paused
    client.post(
        "/api/v1/me/activity",
        json={"type": "view_product", "product_id": "prod-1"},
    )
    act1 = client.get("/api/v1/me/activity").json()
    assert len(act1) == 1

    # Pause personalization
    client.put(
        "/api/v1/me/preferences",
        json={"personalization_paused": True},
    )
    prefs = client.get("/api/v1/me/preferences").json()
    assert prefs["personalization_paused"] is True

    # Attempt to log another activity
    client.post(
        "/api/v1/me/activity",
        json={"type": "view_product", "product_id": "prod-2"},
    )
    act2 = client.get("/api/v1/me/activity").json()
    # Count must remain 1 because personalization was paused
    assert len(act2) == 1

    # Clear activity
    clear_res = client.delete("/api/v1/me/activity")
    assert clear_res.status_code == 204
    act3 = client.get("/api/v1/me/activity").json()
    assert len(act3) == 0


def test_alerts_require_session_and_isolate_user(client):
    # Unauthenticated alert operations must return 401
    assert client.get("/api/v1/alerts").status_code == 401
    assert (
        client.post(
            "/api/v1/alerts",
            json={
                "product_id": "prod-999",
                "channel": "email",
                "destination": "alerts@example.com",
                "notify_on_good_time": True,
            },
        ).status_code
        == 401
    )

    # Create account
    email = "alert_user@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={"name": "Alert Tester", "email": email, "password": "password123"},
    )

    # Create alert
    alert_res = client.post(
        "/api/v1/alerts",
        json={
            "product_id": "prod-999",
            "channel": "email",
            "destination": "alerts@example.com",
            "target_price": 5000.0,
        },
    )
    assert alert_res.status_code == 201
    alert_data = alert_res.json()
    assert alert_data["user_email"] == email
    alert_id = alert_data["id"]

    # List alerts
    list_res = client.get("/api/v1/alerts")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # Delete alert
    del_res = client.delete(f"/api/v1/alerts/{alert_id}")
    assert del_res.status_code == 200


def test_delete_account_cascades_everything(client):
    email = "delete_me@example.com"
    pwd = "password123"
    client.post(
        "/api/v1/auth/signup",
        json={"name": "To Delete", "email": email, "password": pwd},
    )

    # Add cart item, saved item, alert
    client.post("/api/v1/me/cart", json={"product_id": "p-del-1", "quantity": 1})
    client.post("/api/v1/me/saved", json={"product_id": "p-del-2"})
    client.post(
        "/api/v1/alerts",
        json={
            "product_id": "p-del-3",
            "channel": "email",
            "destination": email,
            "target_price": 1000.0,
        },
    )

    # Wrong password delete
    bad_del = client.post(
        "/api/v1/auth/delete-account",
        json={"password": "wrong_password"},
    )
    assert bad_del.status_code == 400

    # Correct password delete
    del_res = client.post(
        "/api/v1/auth/delete-account",
        json={"password": pwd},
    )
    assert del_res.status_code == 204

    # Subsequent /auth/me returns 401
    assert client.get("/api/v1/auth/me").status_code == 401

    # Check that user row and alerts are gone
    assert get_user_by_email(email) is None
    alerts_conn = get_alerts_conn()
    cur = alerts_conn.execute("SELECT COUNT(*) FROM alerts WHERE user_email = ?", (email,))
    count = cur.fetchone()[0]
    alerts_conn.close()
    assert count == 0
