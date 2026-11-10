"""
SQLite database storage for user accounts, sessions, cart, saved items,
purchase history, activity logging, and personalization preferences.
Uses Python's built-in sqlite3 (no external ORM).
"""

import os
import json
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

import bcrypt

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_PATH = os.path.join(DB_DIR, "users.db")


def get_db_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_users_db() -> None:
    """Initialize SQLite tables for users, sessions, user data, and rate limits."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cart_items (
                    user_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    PRIMARY KEY(user_id, product_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_items (
                    user_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(user_id, product_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS history (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    store TEXT,
                    ts TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS activity (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    product_id TEXT,
                    category TEXT,
                    brand TEXT,
                    query TEXT,
                    price REAL,
                    ts TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS preferences (
                    user_id TEXT PRIMARY KEY,
                    favorite_categories TEXT DEFAULT '[]',
                    budget_min REAL,
                    budget_max REAL,
                    personalization_paused INTEGER DEFAULT 0
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS login_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL COLLATE NOCASE,
                    ip TEXT,
                    attempted_at TEXT NOT NULL,
                    is_success INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signup_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL,
                    attempted_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_items(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email, attempted_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_signup_attempts ON signup_attempts(ip, attempted_at)"
            )
    finally:
        conn.close()


# ── Password Hashing ──────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


# ── Rate Limiting ─────────────────────────────────────────────────────────────


def check_login_rate_limit(email: str) -> bool:
    """
    Check if email has exceeded 5 failed login attempts in the last 15 minutes.
    Returns True if allowed, False if rate limited.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    conn = get_db_connection()
    try:
        cur = conn.execute(
            """
            SELECT COUNT(*) as failed_count FROM login_attempts
            WHERE email = ? AND is_success = 0 AND attempted_at >= ?
            """,
            (email.strip().lower(), cutoff),
        )
        row = cur.fetchone()
        return (row["failed_count"] if row else 0) < 5
    finally:
        conn.close()


def record_login_attempt(email: str, ip: Optional[str], is_success: bool) -> None:
    """Record a login attempt."""
    now_str = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO login_attempts (email, ip, attempted_at, is_success)
                VALUES (?, ?, ?, ?)
                """,
                (email.strip().lower(), ip or "", now_str, 1 if is_success else 0),
            )
            # Cleanup old attempts older than 1 day
            one_day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
            conn.execute("DELETE FROM login_attempts WHERE attempted_at < ?", (one_day_ago,))
    finally:
        conn.close()


def check_signup_rate_limit(ip: str) -> bool:
    """
    Check if IP has exceeded 5 signup attempts in the last 1 hour.
    Returns True if allowed, False if rate limited.
    """
    if not ip or ip in ("127.0.0.1", "localhost", "testclient"):
        # Don't arbitrarily block local test runner unless tested explicitly
        pass
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    conn = get_db_connection()
    try:
        cur = conn.execute(
            """
            SELECT COUNT(*) as signup_count FROM signup_attempts
            WHERE ip = ? AND attempted_at >= ?
            """,
            (ip, cutoff),
        )
        row = cur.fetchone()
        return (row["signup_count"] if row else 0) < 5
    finally:
        conn.close()


def record_signup_attempt(ip: str) -> None:
    """Record a signup attempt from an IP."""
    now_str = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO signup_attempts (ip, attempted_at) VALUES (?, ?)",
                (ip, now_str),
            )
            # Cleanup old attempts
            one_day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
            conn.execute("DELETE FROM signup_attempts WHERE attempted_at < ?", (one_day_ago,))
    finally:
        conn.close()


# ── User Account Operations ───────────────────────────────────────────────────


def create_user(name: str, email: str, password: str) -> Dict[str, Any]:
    """Create a new user account with hashed password and default preferences."""
    norm_email = email.strip().lower()
    clean_name = name.strip()
    user_id = f"user-{secrets.token_hex(8)}"
    now_str = datetime.now(timezone.utc).isoformat()
    pwd_hash = hash_password(password)

    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO users (id, name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, clean_name, norm_email, pwd_hash, now_str),
            )
            conn.execute(
                """
                INSERT INTO preferences (user_id, favorite_categories, budget_min, budget_max, personalization_paused)
                VALUES (?, '[]', NULL, NULL, 0)
                """,
                (user_id,),
            )
        return {
            "id": user_id,
            "name": clean_name,
            "email": norm_email,
            "created_at": now_str,
        }
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Fetch user row by email (case-insensitive)."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        )
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch user by primary id."""
    conn = get_db_connection()
    try:
        cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def update_user_password(user_id: str, new_password: str) -> bool:
    """Update a user's password hash."""
    new_hash = hash_password(new_password)
    conn = get_db_connection()
    try:
        with conn:
            cur = conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (new_hash, user_id),
            )
            return cur.rowcount > 0
    finally:
        conn.close()


def delete_user_account(user_id: str) -> bool:
    """
    Deletes the user and ALL associated rows across every table,
    including sessions, cart, saved, history, activity, preferences, and alerts in alerts.db.
    """
    user = get_user_by_id(user_id)
    if not user:
        return False
    user_email = user["email"]

    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM cart_items WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM saved_items WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM history WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM activity WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM preferences WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    finally:
        conn.close()

    # Also clean up alerts from alerts.db
    from services.alerts_db import get_db_connection as get_alerts_conn
    try:
        alerts_conn = get_alerts_conn()
        with alerts_conn:
            alerts_conn.execute("DELETE FROM alerts WHERE user_email = ? COLLATE NOCASE", (user_email,))
        alerts_conn.close()
    except Exception:
        pass

    return True


# ── Session Operations ────────────────────────────────────────────────────────


def create_session(user_id: str, days: int = 30) -> str:
    """
    Generate a 32-byte urlsafe token, store its SHA-256 hash in sessions,
    and return the raw token.
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=days)).isoformat()
    created_at = now.isoformat()

    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (token_hash, user_id, expires_at, created_at),
            )
        return raw_token
    finally:
        conn.close()


def get_user_from_token(raw_token: str) -> Optional[Dict[str, Any]]:
    """Validate token hash and return user dict if active and not expired."""
    if not raw_token or not raw_token.strip():
        return None
    token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
    now_str = datetime.now(timezone.utc).isoformat()

    conn = get_db_connection()
    try:
        cur = conn.execute(
            """
            SELECT u.id, u.name, u.email, u.created_at, s.expires_at
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = ? AND s.expires_at > ?
            """,
            (token_hash, now_str),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "created_at": row["created_at"],
        }
    finally:
        conn.close()


def delete_session(raw_token: str) -> None:
    """Delete a session row by raw token."""
    if not raw_token or not raw_token.strip():
        return
    token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
    finally:
        conn.close()


# ── Cart & Saved Items ────────────────────────────────────────────────────────


def get_cart_items(user_id: str) -> List[Dict[str, Any]]:
    """Get all items in user's cart."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT product_id, quantity FROM cart_items WHERE user_id = ?",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def set_cart_item(user_id: str, product_id: str, quantity: int) -> None:
    """Set product quantity in cart. Removes if quantity <= 0."""
    conn = get_db_connection()
    try:
        with conn:
            if quantity <= 0:
                conn.execute(
                    "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
                    (user_id, product_id.strip()),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO cart_items (user_id, product_id, quantity)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity
                    """,
                    (user_id, product_id.strip(), quantity),
                )
    finally:
        conn.close()


def remove_cart_item(user_id: str, product_id: str) -> None:
    """Remove item from cart."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
                (user_id, product_id.strip()),
            )
    finally:
        conn.close()


def clear_cart_items(user_id: str) -> None:
    """Clear all items in user's cart."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM cart_items WHERE user_id = ?", (user_id,))
    finally:
        conn.close()


def get_saved_items(user_id: str) -> List[Dict[str, Any]]:
    """Get all saved items for a user."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT product_id, created_at FROM saved_items WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def add_saved_item(user_id: str, product_id: str) -> None:
    """Add a product to saved items."""
    now_str = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO saved_items (user_id, product_id, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, product_id) DO NOTHING
                """,
                (user_id, product_id.strip(), now_str),
            )
    finally:
        conn.close()


def remove_saved_item(user_id: str, product_id: str) -> None:
    """Remove a product from saved items."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "DELETE FROM saved_items WHERE user_id = ? AND product_id = ?",
                (user_id, product_id.strip()),
            )
    finally:
        conn.close()


# ── Purchase History ──────────────────────────────────────────────────────────


def get_history(user_id: str) -> List[Dict[str, Any]]:
    """Get purchase / store click history for user."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT id, product_id, store, ts FROM history WHERE user_id = ? ORDER BY ts DESC",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def add_history(user_id: str, product_id: str, store: Optional[str] = None, ts: Optional[str] = None) -> Dict[str, Any]:
    """Add a purchase/store click record."""
    hist_id = f"hist-{secrets.token_hex(6)}"
    ts_str = ts or datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO history (id, user_id, product_id, store, ts) VALUES (?, ?, ?, ?, ?)",
                (hist_id, user_id, product_id.strip(), store, ts_str),
            )
        return {"id": hist_id, "product_id": product_id, "store": store, "ts": ts_str}
    finally:
        conn.close()


# ── Activity Logging & Personalization ────────────────────────────────────────


def get_activity(user_id: str) -> List[Dict[str, Any]]:
    """Get all activity events for a user."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT id, type, product_id, category, brand, query, price, ts FROM activity WHERE user_id = ? ORDER BY ts DESC",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def add_activity(
    user_id: str,
    activity_type: str,
    product_id: Optional[str] = None,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    query: Optional[str] = None,
    price: Optional[float] = None,
    ts: Optional[str] = None,
) -> bool:
    """
    Record an activity event for a user.
    If personalization_paused is 1, does nothing and returns False.
    """
    prefs = get_preferences(user_id)
    if prefs.get("personalization_paused"):
        return False

    act_id = f"act-{secrets.token_hex(6)}"
    ts_str = ts or datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO activity (id, user_id, type, product_id, category, brand, query, price, ts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (act_id, user_id, activity_type.strip(), product_id, category, brand, query, price, ts_str),
            )
        return True
    finally:
        conn.close()


def clear_activity(user_id: str) -> None:
    """Clear all activity records for a user."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM activity WHERE user_id = ?", (user_id,))
    finally:
        conn.close()


# ── Preferences ───────────────────────────────────────────────────────────────


def get_preferences(user_id: str) -> Dict[str, Any]:
    """Get user preferences."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT favorite_categories, budget_min, budget_max, personalization_paused FROM preferences WHERE user_id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            return {
                "favorite_categories": [],
                "budget_min": None,
                "budget_max": None,
                "personalization_paused": False,
            }
        try:
            favs = json.loads(row["favorite_categories"]) if row["favorite_categories"] else []
        except Exception:
            favs = []
        return {
            "favorite_categories": favs,
            "budget_min": row["budget_min"],
            "budget_max": row["budget_max"],
            "personalization_paused": bool(row["personalization_paused"]),
        }
    finally:
        conn.close()


def update_preferences(
    user_id: str,
    favorite_categories: Optional[List[str]] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    personalization_paused: Optional[bool] = None,
) -> Dict[str, Any]:
    """Update or upsert user preferences."""
    current = get_preferences(user_id)
    new_favs = favorite_categories if favorite_categories is not None else current["favorite_categories"]
    new_min = budget_min if budget_min is not None else current["budget_min"]
    new_max = budget_max if budget_max is not None else current["budget_max"]
    new_paused = (
        int(personalization_paused)
        if personalization_paused is not None
        else (1 if current["personalization_paused"] else 0)
    )

    favs_json = json.dumps(new_favs)
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO preferences (user_id, favorite_categories, budget_min, budget_max, personalization_paused)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    favorite_categories = excluded.favorite_categories,
                    budget_min = excluded.budget_min,
                    budget_max = excluded.budget_max,
                    personalization_paused = excluded.personalization_paused
                """,
                (user_id, favs_json, new_min, new_max, new_paused),
            )
        return {
            "favorite_categories": new_favs,
            "budget_min": new_min,
            "budget_max": new_max,
            "personalization_paused": bool(new_paused),
        }
    finally:
        conn.close()

