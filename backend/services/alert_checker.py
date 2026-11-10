"""
Background price alert checker service.
Periodically scans active alerts, queries current prices and price histories from ChromaDB,
evaluates buy score (via price_score.py) and target price thresholds, and dispatches notifications
via the configured provider (respecting a 24-hour rate limit per alert).
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Optional

from config import settings
from services.alerts_db import get_all_active_alerts, update_last_notified
from services.notifications import get_notification_provider
from services.price_score import compute_buy_score

logger = logging.getLogger("alert_checker")


def _parse_utc_iso(dt_str: str) -> datetime:
    """Parse an ISO timestamp, ensuring it is timezone-aware UTC."""
    try:
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


async def run_alert_check(retriever: Any) -> int:
    """
    Execute one full alert evaluation pass.
    Returns the number of notifications successfully sent.
    """
    if retriever is None:
        logger.warning("run_alert_check invoked without retriever instance.")
        return 0

    active_alerts = get_all_active_alerts()
    if not active_alerts:
        logger.info("No active alerts found to check.")
        return 0

    now = datetime.now(timezone.utc)
    sent_count = 0

    # Cache product metadata in this pass to avoid querying ChromaDB repeatedly for the same product
    product_cache: dict[str, Optional[dict[str, Any]]] = {}

    for alert in active_alerts:
        alert_id = alert["id"]
        product_id = alert["product_id"]

        # 1. 24-hour notification rate limit check
        last_notified = alert.get("last_notified_at")
        if last_notified:
            last_dt = _parse_utc_iso(last_notified)
            if (now - last_dt).total_seconds() < 24 * 3600:
                logger.info(
                    f"Alert {alert_id} for product {product_id} was notified at {last_notified} "
                    f"(within 24 hours). Skipping."
                )
                continue

        # 2. Fetch product metadata
        if product_id not in product_cache:
            try:
                res = retriever.collection.get(ids=[product_id])
                if res.get("ids"):
                    product_cache[product_id] = res["metadatas"][0]
                else:
                    product_cache[product_id] = None
            except Exception as e:
                logger.error(f"Error fetching product {product_id} from ChromaDB: {e}")
                product_cache[product_id] = None

        meta = product_cache.get(product_id)
        if not meta:
            logger.warning(f"Product {product_id} not found in ChromaDB. Skipping alert {alert_id}.")
            continue

        try:
            current_price = float(meta.get("current_price", 0))
        except (ValueError, TypeError):
            logger.warning(f"Invalid current_price for product {product_id}")
            continue

        raw_history = meta.get("price_history", "[]")
        if isinstance(raw_history, str):
            try:
                price_history = json.loads(raw_history)
            except Exception:
                price_history = []
        elif isinstance(raw_history, list):
            price_history = raw_history
        else:
            price_history = []

        title = meta.get("title", "Product")

        # 3. Compute buy score
        score_info = compute_buy_score(price_history, current_price, range_days=30)
        score = score_info.get("score", 50)

        # 4. Evaluate trigger conditions
        target_price = alert.get("target_price")
        is_target_hit = False
        if target_price is not None:
            try:
                is_target_hit = current_price <= float(target_price)
            except (ValueError, TypeError):
                is_target_hit = False

        notify_on_good_time = bool(alert.get("notify_on_good_time"))
        is_good_time = notify_on_good_time and (score >= 70)

        if not (is_target_hit or is_good_time):
            continue

        # 5. Build trigger message
        reasons = []
        if is_target_hit and target_price is not None:
            reasons.append(f"Price dropped to ₹{current_price:g} (target: ₹{float(target_price):g})")
        if is_good_time:
            reasons.append(f"Buy Score is {score}/100 (Good time to buy)")

        reason_str = " and ".join(reasons)
        product_link = f"{settings.FRONTEND_BASE_URL}/products/{product_id}"
        message = (
            f"🔔 Price Alert: {title}\n"
            f"{reason_str}!\n"
            f"Current Price: ₹{current_price:g}\n"
            f"View deal: {product_link}\n"
            f"Manage alerts at {product_link}"
        )

        # 6. Dispatch notification
        provider = get_notification_provider()
        destination = alert.get("destination", alert.get("user_email"))
        success = await provider.send(destination, message)

        if success:
            update_last_notified(alert_id, now.isoformat())
            sent_count += 1
            logger.info(
                f"Successfully sent price alert {alert_id} for {product_id} to {destination}."
            )
        else:
            logger.error(
                f"Failed to dispatch alert {alert_id} for {product_id} to {destination}."
            )

    return sent_count


async def alert_checker_loop(retriever: Any, interval_seconds: int = 15 * 60) -> None:
    """Background polling loop running every interval_seconds (default 15 minutes)."""
    logger.info(f"Starting alert checker loop (interval={interval_seconds}s)...")
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await run_alert_check(retriever)
        except asyncio.CancelledError:
            logger.info("Alert checker loop cancelled.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in alert_checker_loop: {e}", exc_info=True)
