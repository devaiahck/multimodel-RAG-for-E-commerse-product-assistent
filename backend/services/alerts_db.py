"""
SQLite database storage for user price alerts and phone OTP verifications.
Uses Python's built-in sqlite3 (no external ORM).
"""

import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_PATH = os.path.join(DB_DIR, "alerts.db")


def get_db_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize SQLite tables for alerts and phone verifications."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS alerts (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    target_price REAL,
                    notify_on_good_time INTEGER NOT NULL DEFAULT 1,
                    channel TEXT NOT NULL,
                    destination TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    last_notified_at TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS phone_verifications (
                    phone TEXT PRIMARY KEY,
                    code_hash TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    verified INTEGER NOT NULL DEFAULT 0,
                    send_count INTEGER NOT NULL DEFAULT 1,
                    window_start TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_email, active)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_alerts_product ON alerts(product_id, active)"
            )
    finally:
        conn.close()


# ── Phone OTP Verification ───────────────────────────────────────────────────


def send_phone_otp(phone: str) -> Dict[str, Any]:
    """
    Generate a 6-digit OTP, store hashed, expire in 10 minutes.
    Rate limited to 3 sends per phone per hour.
    Returns dict with status, phone, code (for test/console logging), and expires_at.
    """
    phone_clean = phone.strip()
    if not phone_clean:
        raise ValueError("Phone number cannot be empty.")

    now = datetime.utcnow()
    conn = get_db_connection()
    try:
        with conn:
            cur = conn.execute(
                "SELECT * FROM phone_verifications WHERE phone = ?", (phone_clean,)
            )
            row = cur.fetchone()

            if row:
                window_start = datetime.fromisoformat(row["window_start"])
                # Hourly window check
                if now - window_start < timedelta(hours=1):
                    if row["send_count"] >= 3:
                        return {
                            "ok": False,
                            "error": "rate_limited",
                            "message": "Maximum 3 verification codes per hour exceeded for this phone number.",
                        }
                    send_count = row["send_count"] + 1
                    win_start_str = row["window_start"]
                else:
                    send_count = 1
                    win_start_str = now.isoformat()
            else:
                send_count = 1
                win_start_str = now.isoformat()

            # Generate 6-digit OTP
            code = f"{secrets.randbelow(1000000):06d}"
            code_hash = hashlib.sha256(code.encode()).hexdigest()
            expires_at = (now + timedelta(minutes=10)).isoformat()

            conn.execute(
                """
                INSERT OR REPLACE INTO phone_verifications
                (phone, code_hash, expires_at, verified, send_count, window_start)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (phone_clean, code_hash, expires_at, 0, send_count, win_start_str),
            )

        return {
            "ok": True,
            "phone": phone_clean,
            "code": code,
            "expires_at": expires_at,
            "message": f"Verification code sent to {phone_clean}.",
        }
    finally:
        conn.close()


def verify_phone_otp(phone: str, code: str) -> Dict[str, Any]:
    """Verify phone OTP with SHA256 hash check and expiration."""
    phone_clean = phone.strip()
    code_clean = code.strip()

    if not phone_clean or not code_clean:
        return {"ok": False, "message": "Phone number and verification code are required."}

    now = datetime.utcnow()
    conn = get_db_connection()
    try:
        cur = conn.execute("SELECT * FROM phone_verifications WHERE phone = ?", (phone_clean,))
        row = cur.fetchone()

        if not row:
            return {"ok": False, "message": "No verification request found for this phone number."}

        expires_at = datetime.fromisoformat(row["expires_at"])
        if now > expires_at:
            return {"ok": False, "message": "Verification code has expired. Please request a new one."}

        incoming_hash = hashlib.sha256(code_clean.encode()).hexdigest()
        if incoming_hash != row["code_hash"]:
            return {"ok": False, "message": "Invalid verification code."}

        with conn:
            conn.execute(
                "UPDATE phone_verifications SET verified = 1 WHERE phone = ?", (phone_clean,)
            )

        return {"ok": True, "message": "Phone number verified successfully.", "phone": phone_clean}
    finally:
        conn.close()


def is_phone_verified(phone: str) -> bool:
    """Check if a phone number has been successfully verified."""
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "SELECT verified FROM phone_verifications WHERE phone = ?", (phone.strip(),)
        )
        row = cur.fetchone()
        return bool(row and row["verified"] == 1)
    finally:
        conn.close()


# ── Alerts Management ─────────────────────────────────────────────────────────


def create_alert(
    user_email: str,
    product_id: str,
    target_price: Optional[float],
    notify_on_good_time: bool,
    channel: str,
    destination: str,
) -> Dict[str, Any]:
    """Create a new price alert record."""
    alert_id = f"alert-{secrets.token_hex(8)}"
    created_at = datetime.utcnow().isoformat()
    notify_int = 1 if notify_on_good_time else 0

    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO alerts
                (id, user_email, product_id, target_price, notify_on_good_time, channel, destination, active, last_notified_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)
                """,
                (
                    alert_id,
                    user_email.strip().lower(),
                    product_id.strip(),
                    target_price,
                    notify_int,
                    channel.strip().lower(),
                    destination.strip(),
                    created_at,
                ),
            )
        return {
            "id": alert_id,
            "user_email": user_email.strip().lower(),
            "product_id": product_id.strip(),
            "target_price": target_price,
            "notify_on_good_time": bool(notify_int),
            "channel": channel.strip().lower(),
            "destination": destination.strip(),
            "active": True,
            "last_notified_at": None,
            "created_at": created_at,
        }
    finally:
        conn.close()


def get_user_alerts(user_email: str, product_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve all active alerts for a user, optionally filtered by product_id."""
    conn = get_db_connection()
    try:
        if product_id:
            cur = conn.execute(
                """
                SELECT * FROM alerts
                WHERE user_email = ? AND product_id = ? AND active = 1
                ORDER BY created_at DESC
                """,
                (user_email.strip().lower(), product_id.strip()),
            )
        else:
            cur = conn.execute(
                """
                SELECT * FROM alerts
                WHERE user_email = ? AND active = 1
                ORDER BY created_at DESC
                """,
                (user_email.strip().lower(),),
            )

        rows = cur.fetchall()
        return [
            {
                "id": r["id"],
                "user_email": r["user_email"],
                "product_id": r["product_id"],
                "target_price": r["target_price"],
                "notify_on_good_time": bool(r["notify_on_good_time"]),
                "channel": r["channel"],
                "destination": r["destination"],
                "active": bool(r["active"]),
                "last_notified_at": r["last_notified_at"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def delete_alert(alert_id: str) -> bool:
    """Soft-delete/deactivate an alert by ID."""
    conn = get_db_connection()
    try:
        with conn:
            cur = conn.execute("UPDATE alerts SET active = 0 WHERE id = ?", (alert_id.strip(),))
            return cur.rowcount > 0
    finally:
        conn.close()


def delete_user_alert(alert_id: str, user_email: str) -> bool:
    """Soft-delete/deactivate an alert by ID, verifying user ownership."""
    conn = get_db_connection()
    try:
        with conn:
            cur = conn.execute(
                "UPDATE alerts SET active = 0 WHERE id = ? AND user_email = ? COLLATE NOCASE",
                (alert_id.strip(), user_email.strip().lower()),
            )
            return cur.rowcount > 0
    finally:
        conn.close()


def get_all_active_alerts() -> List[Dict[str, Any]]:
    """Retrieve all active alerts across all users."""
    conn = get_db_connection()
    try:
        cur = conn.execute("SELECT * FROM alerts WHERE active = 1")
        rows = cur.fetchall()
        return [
            {
                "id": r["id"],
                "user_email": r["user_email"],
                "product_id": r["product_id"],
                "target_price": r["target_price"],
                "notify_on_good_time": bool(r["notify_on_good_time"]),
                "channel": r["channel"],
                "destination": r["destination"],
                "active": bool(r["active"]),
                "last_notified_at": r["last_notified_at"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def update_last_notified(alert_id: str, notified_at: str) -> None:
    """Update last_notified_at timestamp for an alert."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "UPDATE alerts SET last_notified_at = ? WHERE id = ?",
                (notified_at, alert_id),
            )
    finally:
        conn.close()

