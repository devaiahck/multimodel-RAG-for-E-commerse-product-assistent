"""
Personalized Product Recommendation Service.

Uses ChromaDB product embeddings, user activity stream, saved items,
purchase history, and user preferences to generate personalized product recommendations.
"""

from collections import defaultdict
from datetime import datetime, timezone
import json
import logging
from typing import List, Dict, Any, Optional

import numpy as np

from services.price_score import compute_buy_score
from services.users_db import (
    get_activity,
    get_saved_items,
    get_cart_items,
    get_history,
    get_preferences,
)

logger = logging.getLogger("urbanpick.recommender")


def _parse_iso_ts(ts_val: Any) -> datetime:
    """Parse ISO timestamp string to UTC datetime."""
    if not ts_val:
        return datetime.now(timezone.utc)
    if isinstance(ts_val, datetime):
        return ts_val.astimezone(timezone.utc) if ts_val.tzinfo else ts_val.replace(tzinfo=timezone.utc)
    ts_str = str(ts_val).strip()
    try:
        if ts_str.endswith("Z"):
            ts_str = ts_str[:-1] + "+00:00"
        dt = datetime.fromisoformat(ts_str)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def get_recommendations(
    user_id: str,
    limit: int = 12,
    collection=None,
    encoder=None,
) -> Dict[str, Any]:
    """
    Generate personalized recommendations for a logged-in user.

    Returns:
        {"items": List[Dict[str, Any]], "state": "ok" | "not_enough_activity" | "paused"}
    """
    # 1. Privacy / Pause Check
    prefs = get_preferences(user_id)
    if prefs.get("personalization_paused"):
        return {"items": [], "state": "paused"}

    # Initialize collection & encoder if not supplied
    if collection is None:
        from rag.retriever import get_retriever
        collection = get_retriever().collection

    now = datetime.now(timezone.utc)

    # 2. Collect Signals from the last 90 days
    # Weights: view=1, search=1, save=2.5, add_to_cart=3, saved_items=2.5, history=3
    # Time decay: weight * 0.5 ** (age_days / 14)
    raw_activity = get_activity(user_id)
    raw_saved = get_saved_items(user_id)
    raw_history = get_history(user_id)

    product_signals: List[Dict[str, Any]] = []
    search_signals: List[Dict[str, Any]] = []

    # Map of (type, product_id, approx_ts_minute) to avoid double counting if an event
    # was recorded in both activity and saved_items/history.
    seen_events = set()

    # Process activity table
    for act in raw_activity:
        act_type = str(act.get("type", "")).strip().lower()
        ts_dt = _parse_iso_ts(act.get("ts"))
        age_days = (now - ts_dt).total_seconds() / 86400.0
        if age_days < 0:
            age_days = 0.0
        if age_days > 90.0:
            continue

        decay = 0.5 ** (age_days / 14.0)
        pid = str(act.get("product_id") or "").strip()

        if act_type in ("add_to_cart", "cart_add"):
            if pid:
                base_w = 3.0
                product_signals.append({
                    "product_id": pid,
                    "interaction_type": "add_to_cart",
                    "weight": base_w * decay,
                    "ts": ts_dt,
                    "price": float(act.get("price") or 0.0),
                })
                seen_events.add(("save_or_cart", pid, ts_dt.strftime("%Y-%m-%d %H:%M")))
        elif act_type in ("save", "saved_add"):
            if pid:
                base_w = 2.5
                product_signals.append({
                    "product_id": pid,
                    "interaction_type": "save",
                    "weight": base_w * decay,
                    "ts": ts_dt,
                    "price": float(act.get("price") or 0.0),
                })
                seen_events.add(("save", pid, ts_dt.strftime("%Y-%m-%d %H:%M")))
        elif act_type == "view":
            if pid:
                base_w = 1.0
                product_signals.append({
                    "product_id": pid,
                    "interaction_type": "view",
                    "weight": base_w * decay,
                    "ts": ts_dt,
                    "price": float(act.get("price") or 0.0),
                })
        elif act_type == "search":
            query_text = str(act.get("query") or "").strip()
            if query_text:
                base_w = 1.0
                search_signals.append({
                    "query": query_text,
                    "weight": base_w * decay,
                    "ts": ts_dt,
                })

    # Process saved_items table
    for s in raw_saved:
        pid = str(s.get("product_id") or "").strip()
        if not pid:
            continue
        ts_dt = _parse_iso_ts(s.get("created_at"))
        key = ("save", pid, ts_dt.strftime("%Y-%m-%d %H:%M"))
        if key in seen_events:
            continue
        age_days = (now - ts_dt).total_seconds() / 86400.0
        if age_days < 0:
            age_days = 0.0
        if age_days > 90.0:
            continue
        decay = 0.5 ** (age_days / 14.0)
        product_signals.append({
            "product_id": pid,
            "interaction_type": "save",
            "weight": 2.5 * decay,
            "ts": ts_dt,
            "price": 0.0,
        })
        seen_events.add(key)

    # Process history table (purchases)
    for h in raw_history:
        pid = str(h.get("product_id") or "").strip()
        if not pid:
            continue
        ts_dt = _parse_iso_ts(h.get("ts"))
        key = ("history", pid, ts_dt.strftime("%Y-%m-%d %H:%M"))
        if key in seen_events:
            continue
        age_days = (now - ts_dt).total_seconds() / 86400.0
        if age_days < 0:
            age_days = 0.0
        if age_days > 90.0:
            continue
        decay = 0.5 ** (age_days / 14.0)
        product_signals.append({
            "product_id": pid,
            "interaction_type": "history",
            "weight": 3.0 * decay,
            "ts": ts_dt,
            "price": 0.0,
        })
        seen_events.add(key)

    total_candidate_signals = len(product_signals) + len(search_signals)
    if total_candidate_signals < 3:
        return {"items": [], "state": "not_enough_activity"}

    # 3. Fetch product Chroma embeddings for product signals
    unique_pids = list({s["product_id"] for s in product_signals})
    chroma_prods = {}
    if unique_pids:
        try:
            got = collection.get(ids=unique_pids, include=["embeddings", "metadatas"])
            got_ids = got.get("ids", [])
            got_embs = got.get("embeddings", [])
            got_metas = got.get("metadatas", [])
            for i, gid in enumerate(got_ids):
                emb = got_embs[i] if i < len(got_embs) else None
                meta = got_metas[i] if i < len(got_metas) else {}
                if emb is not None:
                    chroma_prods[gid] = {
                        "embedding": np.array(emb, dtype=np.float32),
                        "metadata": meta or {},
                    }
        except Exception as e:
            logger.warning("Error fetching product embeddings: %s", e)

    # Filter product signals to only those found in Chroma
    valid_prod_signals = [s for s in product_signals if s["product_id"] in chroma_prods]

    # Encode search signals if encoder is available
    valid_search_signals = []
    if search_signals:
        if encoder is None:
            try:
                from main import _require_encoder
                encoder = _require_encoder()
            except Exception:
                encoder = None

        if encoder is not None:
            for s in search_signals:
                try:
                    q_emb = encoder.encode_text(s["query"])
                    if q_emb is not None:
                        s["embedding"] = np.array(q_emb, dtype=np.float32)
                        valid_search_signals.append(s)
                except Exception as e:
                    logger.warning("Error encoding search query '%s': %s", s["query"], e)

    total_usable_signals = len(valid_prod_signals) + len(valid_search_signals)
    if total_usable_signals < 3:
        return {"items": [], "state": "not_enough_activity"}

    # 4. Compute Interest Vector
    # Weighted mean of stored Chroma embeddings + query text embeddings, normalized.
    sample_emb = (
        valid_prod_signals[0]["product_id"]
        and chroma_prods[valid_prod_signals[0]["product_id"]]["embedding"]
        if valid_prod_signals
        else valid_search_signals[0]["embedding"]
    )
    dim = len(sample_emb)
    interest_vec = np.zeros(dim, dtype=np.float32)
    sum_weights = 0.0

    for s in valid_prod_signals:
        w = s["weight"]
        emb = chroma_prods[s["product_id"]]["embedding"]
        interest_vec += w * emb
        sum_weights += w

    for s in valid_search_signals:
        w = s["weight"]
        emb = s["embedding"]
        interest_vec += w * emb
        sum_weights += w

    if sum_weights > 0:
        interest_vec = interest_vec / sum_weights

    vec_norm = float(np.linalg.norm(interest_vec))
    if vec_norm > 1e-9:
        interest_vec = interest_vec / vec_norm
    else:
        return {"items": [], "state": "not_enough_activity"}

    # 5. Excluded products: Cart, Saved, History
    cart_items = get_cart_items(user_id)
    saved_items = get_saved_items(user_id)
    history_items = get_history(user_id)

    excluded_ids = set()
    for it in cart_items:
        excluded_ids.add(str(it.get("product_id", "")).strip())
    for it in saved_items:
        excluded_ids.add(str(it.get("product_id", "")).strip())
    for it in history_items:
        excluded_ids.add(str(it.get("product_id", "")).strip())

    # Interacted products list for reason building & median price calculation
    interacted_products: Dict[str, Dict[str, Any]] = {}
    interacted_prices: List[float] = []

    # Priority of interaction type: add_to_cart > save > history > view
    prio = {"add_to_cart": 4, "save": 3, "history": 2, "view": 1}

    for s in valid_prod_signals:
        pid = s["product_id"]
        info = chroma_prods[pid]
        meta = info["metadata"]
        price = float(meta.get("current_price", 0.0) or s.get("price") or 0.0)
        if price > 0:
            interacted_prices.append(price)

        itype = s["interaction_type"]
        if pid not in interacted_products or prio.get(itype, 0) > prio.get(interacted_products[pid]["interaction_type"], 0):
            interacted_products[pid] = {
                "product_id": pid,
                "title": str(meta.get("title") or pid),
                "interaction_type": itype,
                "embedding": info["embedding"],
                "price": price,
            }

    median_interacted_price: Optional[float] = None
    if interacted_prices:
        median_interacted_price = float(np.median(interacted_prices))

    # 6. Query Chroma for top 60 candidates
    total_in_db = collection.count()
    if total_in_db == 0:
        return {"items": [], "state": "ok"}

    fetch_k = min(60, total_in_db)
    query_res = collection.query(
        query_embeddings=[interest_vec.tolist()],
        n_results=fetch_k,
        include=["embeddings", "metadatas", "documents", "distances"],
    )

    ids = query_res.get("ids", [[]])[0]
    distances = query_res.get("distances", [[]])[0]
    embeddings = query_res.get("embeddings", [[]])[0]
    metadatas = query_res.get("metadatas", [[]])[0]

    budget_min = prefs.get("budget_min")
    budget_max = prefs.get("budget_max")
    fav_cats = [str(c).strip().casefold() for c in prefs.get("favorite_categories", []) if c]

    candidates = []

    for idx, cand_id in enumerate(ids):
        # Exclude products in cart, saved, or purchase history
        if cand_id in excluded_ids:
            continue

        meta = metadatas[idx] if idx < len(metadatas) and metadatas[idx] else {}
        price = float(meta.get("current_price", 0.0) or 0.0)

        # Budget filters
        if budget_min is not None and price < budget_min:
            continue
        if budget_max is not None and price > budget_max:
            continue

        dist = distances[idx] if idx < len(distances) else 1.0
        similarity = max(0.0, min(1.0, 1.0 - dist))

        # Price history & buy score
        price_hist = meta.get("price_history", "[]")
        if isinstance(price_hist, str):
            try:
                price_hist = json.loads(price_hist)
            except Exception:
                price_hist = []
        buy_score_dict = compute_buy_score(price_hist, price)
        buy_score = float(buy_score_dict.get("score", 50))

        rating = float(meta.get("rating", 0.0) or 0.0)

        # Favorite categories boost (+0.05)
        cat_str = str(meta.get("category", "")).casefold()
        cat_boost = 0.05 if any(fc in cat_str or cat_str in fc for fc in fav_cats) else 0.0

        # Price bonus (+0.1 if between 0.5x and 2x median price of interacted products)
        price_bonus = 0.0
        if median_interacted_price is not None and median_interacted_price > 0:
            if 0.5 * median_interacted_price <= price <= 2.0 * median_interacted_price:
                price_bonus = 0.1

        # Re-rank formula:
        # score = 0.6*similarity + 0.25*(buy_score/100) + 0.15*(rating/5) + cat_boost + price_bonus
        score = (
            0.6 * similarity
            + 0.25 * (buy_score / 100.0)
            + 0.15 * (rating / 5.0)
            + cat_boost
            + price_bonus
        )

        cand_emb = np.array(embeddings[idx], dtype=np.float32) if idx < len(embeddings) and embeddings[idx] is not None else None

        # Build one-line Reason from data
        # Find user's interacted product with highest embedding similarity to this item
        best_ref = None
        best_sim = -1.0
        if cand_emb is not None and interacted_products:
            cand_norm = np.linalg.norm(cand_emb)
            if cand_norm > 1e-9:
                cand_u = cand_emb / cand_norm
                for ref_p in interacted_products.values():
                    r_emb = ref_p["embedding"]
                    r_norm = np.linalg.norm(r_emb)
                    if r_norm > 1e-9:
                        sim = float(np.dot(cand_u, r_emb / r_norm))
                        if sim > best_sim:
                            best_sim = sim
                            best_ref = ref_p

        reason = ""
        if best_ref:
            ref_title = best_ref["title"]
            itype = best_ref["interaction_type"]
            if itype == "add_to_cart":
                reason = f"Because you added {ref_title} to your cart"
            elif itype == "save":
                reason = f"Because you saved {ref_title}"
            elif itype == "history":
                reason = f"Because you bought {ref_title}"
            else:
                reason = f"Because you viewed {ref_title}"
        elif valid_search_signals:
            reason = f"Because you searched for {valid_search_signals[0]['query']}"
        else:
            reason = "Recommended for you"

        # Complex fields serialization
        store_avail = meta.get("store_availability", [])
        if isinstance(store_avail, str):
            try:
                store_avail = json.loads(store_avail)
            except Exception:
                store_avail = []

        brand = str(meta.get("brand", "")).strip() or "UrbanPick"

        candidates.append({
            "id": cand_id,
            "product_id": cand_id,
            "title": str(meta.get("title", cand_id)),
            "brand": brand,
            "category": str(meta.get("category", "")),
            "price": price,
            "current_price": price,
            "original_price": float(meta.get("original_price", price) or price),
            "originalPrice": float(meta.get("original_price", price) or price),
            "discount": float(meta.get("discount", 0.0) or 0.0),
            "discountPercentage": float(meta.get("discount", 0.0) or 0.0),
            "rating": rating,
            "image_url": str(meta.get("image_url", "")),
            "imageUrl": str(meta.get("image_url", "")),
            "store": str(meta.get("store", "")),
            "store_availability": store_avail,
            "price_history": price_hist,
            "buy_score": int(buy_score),
            "score": round(score, 4),
            "similarity": round(similarity, 4),
            "reason": reason,
        })

    # Sort descending by score
    candidates.sort(key=lambda c: c["score"], reverse=True)

    # Keep at most 3 products per brand
    brand_counts: Dict[str, int] = defaultdict(int)
    final_items: List[Dict[str, Any]] = []

    for c in candidates:
        b_key = c["brand"].casefold()
        if brand_counts[b_key] < 3:
            brand_counts[b_key] += 1
            final_items.append(c)
            if len(final_items) >= limit:
                break

    return {"items": final_items, "state": "ok"}


def get_saved_insights(user_id: str, collection=None) -> List[Dict[str, Any]]:
    """
    Compute price insights for each saved product for the given user.

    Returns:
        [
            {
                "product_id": str,
                "buy_score": int,
                "verdict": "good_time" | "wait" | "fair",
                "current_price": float,
                "lowest_price_in_history": float,
            },
            ...
        ]
    """
    if collection is None:
        from rag.retriever import get_retriever
        collection = get_retriever().collection

    saved = get_saved_items(user_id)
    if not saved:
        return []

    pids = [s["product_id"] for s in saved if s.get("product_id")]
    if not pids:
        return []

    meta_map = {}
    try:
        got = collection.get(ids=pids, include=["metadatas"])
        got_ids = got.get("ids", [])
        got_metas = got.get("metadatas", [])
        for i, gid in enumerate(got_ids):
            meta_map[gid] = got_metas[i] if i < len(got_metas) else {}
    except Exception as e:
        logger.warning("Error fetching saved metadata from Chroma: %s", e)

    insights = []
    for s in saved:
        pid = s["product_id"]
        meta = meta_map.get(pid, {})
        current_price = float(meta.get("current_price", 0.0) or 0.0)

        price_hist = meta.get("price_history", "[]")
        if isinstance(price_hist, str):
            try:
                price_hist = json.loads(price_hist)
            except Exception:
                price_hist = []

        score_dict = compute_buy_score(price_hist, current_price)
        score = int(score_dict.get("score", 50))

        if score >= 70:
            verdict = "good_time"
        elif score < 40:
            verdict = "wait"
        else:
            verdict = "fair"

        lowest_price = float(score_dict.get("stats", {}).get("all_time_low", current_price) or current_price)

        insights.append({
            "product_id": pid,
            "buy_score": score,
            "verdict": verdict,
            "current_price": current_price,
            "lowest_price_in_history": lowest_price,
        })

    return insights

