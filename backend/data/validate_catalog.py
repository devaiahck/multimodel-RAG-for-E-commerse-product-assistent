"""
Validate backend/data/demo_catalog.json against ProductIngestSchema.

IMPORTANT: This script intentionally imports ONLY schemas.py.
Do NOT import main.py, encoder, or retriever — they load ML models.

Usage:
    cd <project-root>
    $env:PYTHONPATH = 'backend'
    python backend/data/validate_catalog.py
"""

import json
import sys
import os
from collections import defaultdict

# Allow running from project root with PYTHONPATH=backend, or from backend/ directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from schemas import ProductIngestSchema
except ImportError as e:
    print(f"ERROR: Could not import schemas.py — {e}")
    print("Make sure PYTHONPATH includes the backend/ directory.")
    sys.exit(2)

try:
    from pydantic import ValidationError
except ImportError as e:
    print(f"ERROR: pydantic not available — {e}")
    sys.exit(2)


def main() -> None:
    catalog_path = os.path.join(os.path.dirname(__file__), "demo_catalog.json")
    if not os.path.exists(catalog_path):
        print(f"ERROR: {catalog_path} not found. Run generate_demo_catalog.py first.")
        sys.exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    print(f"Loaded {len(products)} products from demo_catalog.json\n")

    counts_per_category: dict[str, int] = defaultdict(int)
    failures: list[dict] = []
    short_history: int = 0
    unique_ids: set[str] = set()
    duplicate_ids: list[str] = []

    for i, raw in enumerate(products):
        pid = raw.get("product_id", f"<index {i}>")

        # Check for duplicate IDs
        if pid in unique_ids:
            duplicate_ids.append(pid)
        unique_ids.add(pid)

        # Track short price history
        ph = raw.get("price_history", [])
        if isinstance(ph, list) and len(ph) <= 4:
            short_history += 1

        # Validate with schema
        try:
            ProductIngestSchema.model_validate(raw)
            top_level = raw.get("category", "Unknown").split(" / ")[0]
            counts_per_category[top_level] += 1
        except ValidationError as exc:
            failures.append({"product_id": pid, "errors": exc.errors()})

    # ── Report ──────────────────────────────────────────────────────────────
    print("Products per top-level category:")
    fixed_order = ["Clothing", "Shoes", "Watches", "Electronics", "Home", "Beauty", "Sports"]
    for cat in fixed_order:
        count = counts_per_category.get(cat, 0)
        print(f"  {cat:15s} {count:4d}")
    for cat in sorted(counts_per_category):
        if cat not in fixed_order:
            print(f"  {cat:15s} {counts_per_category[cat]:4d}")

    total_valid = sum(counts_per_category.values())
    print(f"\nTotal valid   : {total_valid}")
    print(f"Total failures: {len(failures)}")
    print(f"Short history : {short_history}  ({short_history/len(products)*100:.1f}% of {len(products)})")
    print(f"Duplicate IDs : {len(duplicate_ids)}")

    if duplicate_ids:
        print("\nDuplicate product_ids:")
        for d in duplicate_ids:
            print(f"  {d}")

    if failures:
        print("\nValidation failures (first 20 shown):")
        for fail in failures[:20]:
            print(f"\n  product_id: {fail['product_id']}")
            for err in fail["errors"]:
                print(f"    field={err['loc']}  msg={err['msg']}")
        sys.exit(1)
    else:
        print("\nOK: All products pass ProductIngestSchema validation.")
        sys.exit(0)


if __name__ == "__main__":
    main()
