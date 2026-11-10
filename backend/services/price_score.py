"""
Price Buy Confidence Scoring Service.

NOTE: This logic mirrors frontend/src/lib/priceInsight.ts (computeBuyScore).
Keep both files strictly in sync when updating scoring formulas or weights.

Formula:
- position = (max - current) / (max - min), clamped to 0..1 (if max == min use 0.5)
- nearLowBonus = 15 if current <= min * 1.03, else 0
- avgPenalty = 15 if current > average, else 0
- trendPenalty = 10 if avg(last 14 days) is > 3% higher than avg(14 days before that), else 0
- score = clamp(round(position * 70 + 15 + nearLowBonus - avgPenalty - trendPenalty), 0, 100)
- Labels:
  - 70-100: "Good time to buy" (verdict: "buy_now")
  - 40-69: "Fair price, okay to buy" (verdict: "neutral")
  - 0-39: "Better to wait" (verdict: "wait")
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional


def compute_buy_score(
    history: Optional[List[Dict[str, Any]]],
    current_price: float,
    range_days: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Computes Buy Confidence Score (0-100) using deterministic market rules.
    Mirrors frontend/src/lib/priceInsight.ts -> computeBuyScore.
    """
    if not history:
        return {
            "score": 50,
            "verdict": "neutral",
            "label": "Fair price, okay to buy",
            "position": 0.5,
            "near_low_bonus": 0,
            "avg_penalty": 0,
            "trend_penalty": 0,
            "stats": {
                "min": current_price,
                "max": current_price,
                "avg": current_price,
                "lowest_date": "",
                "highest_date": "",
                "all_time_low": current_price,
                "all_time_low_date": "",
                "count": 0,
            },
        }

    # Sort history chronologically by date
    def parse_dt(d_str: str) -> datetime:
        try:
            return datetime.strptime(d_str[:10], "%Y-%m-%d")
        except Exception:
            return datetime.min

    sorted_hist = sorted(history, key=lambda x: parse_dt(str(x.get("date", ""))))
    last_dt = parse_dt(str(sorted_hist[-1].get("date", "")))

    # All-time low
    all_time_low = float(sorted_hist[0].get("price", current_price))
    all_time_low_date = str(sorted_hist[0].get("date", ""))
    for p in sorted_hist:
        try:
            price_val = float(p.get("price", current_price))
            if price_val < all_time_low:
                all_time_low = price_val
                all_time_low_date = str(p.get("date", ""))
        except (ValueError, TypeError):
            continue

    # Window slice by range_days
    if range_days and range_days > 0 and last_dt != datetime.min:
        cutoff = last_dt - timedelta(days=range_days)
        window = [p for p in sorted_hist if parse_dt(str(p.get("date", ""))) >= cutoff]
        if not window:
            window = sorted_hist
    else:
        window = sorted_hist

    prices = []
    lowest_date = ""
    highest_date = ""
    min_price = float("inf")
    max_price = float("-inf")

    for p in window:
        try:
            val = float(p.get("price", current_price))
            prices.append(val)
            if val < min_price:
                min_price = val
                lowest_date = str(p.get("date", ""))
            if val > max_price:
                max_price = val
                highest_date = str(p.get("date", ""))
        except (ValueError, TypeError):
            continue

    if not prices:
        min_price = current_price
        max_price = current_price
        avg_price = current_price
    else:
        avg_price = sum(prices) / len(prices)

    # Position: 0..1 (1 = at lowest price)
    if max_price == min_price:
        position = 0.5
    else:
        position = (max_price - current_price) / (max_price - min_price)
        position = max(0.0, min(1.0, position))

    near_low_bonus = 15 if current_price <= min_price * 1.03 else 0
    avg_penalty = 15 if current_price > avg_price else 0

    # Trend: last 14 days vs 14 days before that (using all history)
    trend_penalty = 0
    if last_dt != datetime.min:
        t14_cutoff = last_dt - timedelta(days=14)
        t28_cutoff = last_dt - timedelta(days=28)

        last_14 = [
            float(p.get("price", 0))
            for p in sorted_hist
            if parse_dt(str(p.get("date", ""))) >= t14_cutoff
        ]
        prev_14 = [
            float(p.get("price", 0))
            for p in sorted_hist
            if t28_cutoff <= parse_dt(str(p.get("date", ""))) < t14_cutoff
        ]

        if last_14 and prev_14:
            avg_last = sum(last_14) / len(last_14)
            avg_prev = sum(prev_14) / len(prev_14)
            if avg_prev > 0 and (avg_last - avg_prev) / avg_prev > 0.03:
                trend_penalty = 10

    raw_score = round(position * 70 + 15 + near_low_bonus - avg_penalty - trend_penalty)
    score = max(0, min(100, raw_score))

    if score >= 70:
        verdict = "buy_now"
        label = "Good time to buy"
    elif score >= 40:
        verdict = "neutral"
        label = "Fair price, okay to buy"
    else:
        verdict = "wait"
        label = "Better to wait"

    return {
        "score": score,
        "verdict": verdict,
        "label": label,
        "position": position,
        "near_low_bonus": near_low_bonus,
        "avg_penalty": avg_penalty,
        "trend_penalty": trend_penalty,
        "stats": {
            "min": min_price,
            "max": max_price,
            "avg": avg_price,
            "lowest_date": lowest_date,
            "highest_date": highest_date,
            "all_time_low": all_time_low,
            "all_time_low_date": all_time_low_date,
            "count": len(window),
        },
    }


def compute_real_discount(
    history: Optional[List[Dict[str, Any]]],
    current_price: float,
    mrp: Optional[float] = None,
    window_days: int = 90,
) -> Dict[str, Any]:
    """
    Compares claimed MRP discount against real recent median price.
    NOTE: Mirrors frontend/src/lib/priceInsight.ts (computeRealDiscount).
    Keep both files strictly in sync when updating discount logic or verdicts.

    Returns:
        {
            "claimed_pct": float,
            "real_pct": float,
            "typical_price": float,
            "gap": float,
            "verdict": "genuine" | "inflated" | "slightly_inflated" | "none"
        }
    """
    def round1(val: float) -> float:
        return round(val, 1)

    def calc_median(nums: List[float]) -> float:
        if not nums:
            return 0.0
        s = sorted(nums)
        n = len(s)
        if n % 2 == 1:
            return s[n // 2]
        return (s[n // 2 - 1] + s[n // 2]) / 2.0

    if not history or not mrp or mrp <= 0 or current_price <= 0:
        claimed_pct = round1(((mrp - current_price) / mrp) * 100) if (mrp and mrp > 0 and current_price > 0) else 0.0
        return {
            "claimed_pct": claimed_pct,
            "real_pct": 0.0,
            "typical_price": round1(current_price) if current_price > 0 else 0.0,
            "gap": 0.0,
            "verdict": "none",
        }

    def parse_dt(d_str: str) -> datetime:
        try:
            return datetime.strptime(str(d_str)[:10], "%Y-%m-%d")
        except Exception:
            return datetime.min

    sorted_hist = sorted(history, key=lambda x: parse_dt(str(x.get("date", ""))))
    last_dt = parse_dt(str(sorted_hist[-1].get("date", "")))

    if window_days > 0 and last_dt != datetime.min:
        cutoff = last_dt - timedelta(days=window_days)
        window = [p for p in sorted_hist if parse_dt(str(p.get("date", ""))) >= cutoff]
        if not window:
            window = sorted_hist
    else:
        window = sorted_hist

    prices = [
        float(p.get("price", current_price))
        for p in window
        if p.get("price") is not None
    ]
    typical_price = calc_median(prices) if prices else current_price

    claimed_pct = round1(((mrp - current_price) / mrp) * 100)
    real_pct = round1(((typical_price - current_price) / typical_price) * 100) if typical_price > 0 else 0.0
    gap = round1(claimed_pct - real_pct)

    if claimed_pct < 10:
        verdict = "none"
    elif claimed_pct >= 25 and real_pct < claimed_pct * 0.4:
        verdict = "inflated"
    elif claimed_pct >= 10 and real_pct >= claimed_pct * 0.6:
        verdict = "genuine"
    elif gap >= 15:
        verdict = "slightly_inflated"
    else:
        verdict = "none"

    return {
        "claimed_pct": claimed_pct,
        "real_pct": real_pct,
        "typical_price": round1(typical_price),
        "gap": gap,
        "verdict": verdict,
    }


