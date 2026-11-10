"""
UrbanPick — Multi-Category Catalog Seed Script.

Ingests products from backend/data/demo_catalog.json into ChromaDB via
POST /api/v1/ingest.

Usage:
    python backend/catalog_seed.py [OPTIONS]

Options:
    --base-url            Base URL of the FastAPI server (default: http://localhost:8001)
    --api-key             X-Api-Key for protected ingestion/clear
    --limit-per-category  Max products to ingest per top-level category (e.g. 10)
    --clear               Clear the catalog before seeding (DELETE /api/v1/admin/clear?confirm=true)
    --concurrency         Number of concurrent ingestion requests (default: 4)
"""

import argparse
import concurrent.futures
import json
import os
import sys
from typing import List, Dict, Any, Tuple
import httpx


SMOKE_QUERIES = [
    ("running shoes", None, "Shoes"),
    ("moisturizer under 500", 500.0, "Beauty"),
    ("analog watch", None, "Watches"),
    ("wireless earbuds", None, "Electronics"),
    ("pure cotton shirt", None, "Clothing"),
    ("stainless steel cookware", None, "Home"),
    ("yoga mat", None, "Sports"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed the UrbanPick ChromaDB catalog with multi-category demo products.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("URBANPICK_BASE_URL", "http://localhost:8001"),
        help="Base URL of running FastAPI backend server.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("INGEST_API_KEY", ""),
        help="X-Api-Key header value for protected endpoints.",
    )
    parser.add_argument(
        "--limit-per-category",
        type=int,
        default=None,
        help="Limit number of products to ingest per top-level category.",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear the existing catalog before seeding.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=4,
        help="Number of concurrent worker threads for ingestion.",
    )
    return parser.parse_args()


def load_demo_catalog(data_path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(data_path):
        raise FileNotFoundError(
            f"Demo catalog file not found at: {data_path}\n"
            f"Generate it first by running: python backend/data/generate_demo_catalog.py"
        )
    with open(data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def clear_catalog(client: httpx.Client) -> bool:
    print("\n=== Clearing existing catalog ===")
    try:
        resp = client.delete("/api/v1/admin/clear?confirm=true")
        if resp.status_code == 200:
            print("  [OK] Product catalog cleared successfully.")
            return True
        else:
            print(f"  [ERROR] Failed to clear catalog: {resp.status_code} — {resp.text}")
            return False
    except Exception as exc:
        print(f"  [ERROR] Exception while clearing catalog: {exc}")
        return False


def ingest_single_product(
    client: httpx.Client, product: Dict[str, Any]
) -> Tuple[bool, str, str]:
    pid = product.get("product_id", "unknown")
    try:
        resp = client.post("/api/v1/ingest", json=product)
        if resp.status_code == 201:
            data = resp.json()
            msg = (
                f"[OK] {pid!r:32s} | dim={data.get('vector_dimension')} | "
                f"type={data.get('embedding_type')} | total={data.get('indexed_products_total')}"
            )
            return True, pid, msg
        else:
            msg = f"[FAIL] {pid}: {resp.status_code} — {resp.text}"
            return False, pid, msg
    except Exception as exc:
        msg = f"[ERROR] {pid}: {exc}"
        return False, pid, msg


def run_smoke_tests(client: httpx.Client):
    print("\n=== Multi-Category Retrieval Smoke Tests ===")
    all_passed = True
    for query, max_price, category in SMOKE_QUERIES:
        payload = {"text_prompt": query, "top_k": "3"}
        if max_price:
            payload["max_price"] = str(max_price)
        if category:
            payload["category"] = category

        try:
            resp = client.post("/api/v1/search", data=payload)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("recommended_products", [])
                print(f"\n  Query: {query!r:30s} (category={category}, max_price={max_price}) → {len(results)} hit(s)")
                for r in results:
                    score = r.get("similarity_score", 0.0)
                    price = r.get("current_price", 0.0)
                    title = r.get("title", "")[:45]
                    brand = r.get("brand", "")
                    print(f"    • [{brand}] {title} (₹{price}, score={score})")
            else:
                print(f"\n  [FAIL] {query!r}: {resp.status_code} — {resp.text}")
                all_passed = False
        except Exception as exc:
            print(f"\n  [ERROR] {query!r}: {exc}")
            all_passed = False

    return all_passed


def main():
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    headers = {"X-Api-Key": args.api_key} if args.api_key else {}

    print("=" * 60)
    print("UrbanPick Catalog Seeder")
    print(f"Target URL:    {base_url}")
    print(f"Concurrency:   {args.concurrency}")
    print(f"Limit/cat:     {args.limit_per_category or 'All'}")
    print("=" * 60)

    # Resolve demo catalog path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    catalog_path = os.path.join(script_dir, "data", "demo_catalog.json")

    products = load_demo_catalog(catalog_path)
    print(f"Loaded {len(products)} products from {catalog_path}")

    # Group by top-level category
    products_by_cat: Dict[str, List[Dict[str, Any]]] = {}
    for p in products:
        top_cat = p.get("category", "").split(" / ")[0].strip() or "Other"
        products_by_cat.setdefault(top_cat, []).append(p)

    # Apply limit per category if requested
    items_to_ingest: List[Tuple[str, Dict[str, Any]]] = []
    for cat_name, cat_items in products_by_cat.items():
        if args.limit_per_category and args.limit_per_category > 0:
            selected = cat_items[: args.limit_per_category]
        else:
            selected = cat_items
        for item in selected:
            items_to_ingest.append((cat_name, item))

    print(f"Prepared {len(items_to_ingest)} products across {len(products_by_cat)} categories for ingestion.")

    with httpx.Client(timeout=120.0, base_url=base_url, headers=headers) as client:
        # Check backend reachability
        try:
            health = client.get("/api/v1/health")
            if health.status_code != 200:
                print(f"[WARN] Health check returned status {health.status_code}")
        except Exception as exc:
            print(f"[ERROR] Could not connect to backend at {base_url}: {exc}")
            sys.exit(1)

        # Clear catalog if requested
        if args.clear:
            if not clear_catalog(client):
                print("[ERROR] Aborting seeding because --clear failed.")
                sys.exit(1)

        # Ingest category by category
        success_count = 0
        failure_count = 0
        failures: List[str] = []

        # Group items to ingest by category for clean progress reporting
        categorized_ingest: Dict[str, List[Dict[str, Any]]] = {}
        for cat_name, item in items_to_ingest:
            categorized_ingest.setdefault(cat_name, []).append(item)

        print("\n=== Ingestion in progress ===")
        for cat_name, cat_items in categorized_ingest.items():
            print(f"\n--- Category: {cat_name} ({len(cat_items)} products) ---")
            with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
                futures = [
                    executor.submit(ingest_single_product, client, item)
                    for item in cat_items
                ]
                for future in concurrent.futures.as_completed(futures):
                    ok, pid, msg = future.result()
                    print(f"  {msg}")
                    if ok:
                        success_count += 1
                    else:
                        failure_count += 1
                        failures.append(pid)

        # Smoke tests
        smoke_ok = run_smoke_tests(client)

        # Final Summary
        print("\n" + "=" * 60)
        print("SEEDING SUMMARY")
        print(f"Total Attempted: {len(items_to_ingest)}")
        print(f"Successful:      {success_count}")
        print(f"Failed:          {failure_count}")
        print("=" * 60)

        if failure_count > 0 or not smoke_ok:
            if failures:
                print(f"Failed product IDs: {failures}")
            if not smoke_ok:
                print("Smoke tests had failures.")
            sys.exit(1)

        print("\n✓ Seeding and smoke tests completed successfully!")


if __name__ == "__main__":
    main()
