"""Load any category JSON (watches, electronics, ...) into UrbanPick through the running FastAPI server.
Run from the backend folder (server must be running):
    python data/electronics/load_products.py --file data/electronics/electronics_products_with_images.json
A product's "subcategory" is merged into its category, e.g. "Electronics - Smartphones".
"""
import argparse, json, os, sys
import httpx

ap = argparse.ArgumentParser()
ap.add_argument("--file", required=True)
ap.add_argument("--base-url", default=os.environ.get("URBANPICK_BASE_URL", "http://localhost:8000"))
ap.add_argument("--api-key", default=os.environ.get("INGEST_API_KEY", ""))
a = ap.parse_args()

products = json.load(open(a.file, encoding="utf-8"))
headers = {"X-Api-Key": a.api_key} if a.api_key else {}
client = httpx.Client(timeout=120.0, base_url=a.base_url.rstrip("/"), headers=headers)

ok, failed = 0, []
for p in products:
    sub = p.pop("subcategory", "")
    top = p.get("category", "")
    p["category"] = f"{top} - {sub}" if sub and " - " not in top else top
    r = client.post("/api/v1/ingest", json=p)
    if r.status_code == 201:
        ok += 1
        print(f"[OK] {p['product_id']}")
    else:
        failed.append(p["product_id"])
        print(f"[FAIL] {p['product_id']}: {r.status_code} {r.text[:150]}")
print(f"\n{ok}/{len(products)} ingested")
sys.exit(1 if failed else 0)
