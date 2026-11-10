# backend/data — Demo Catalog

> **IMPORTANT: All data in this directory is synthetic demo data.**
> Prices, ratings, specs, and availability are entirely fake and are provided only for
> frontend development and testing. They do **not** represent real market prices.
> **Stock photos are generic per product TYPE, not the exact product.**

---

## Files

| File | Description |
|---|---|
| `demo_catalog.json` | 700 generated products across 7 top-level categories (~100 each) |
| `generate_demo_catalog.py` | Script that writes `demo_catalog.json` (deterministic, seeded RNG) |
| `fetch_images.py` | Fetches stock photos from Pexels API per product sub-type to `image_map.json` |
| `image_map.json` | Mapping of sub-types to generic Pexels photo URLs and attribution info |
| `validate_catalog.py` | Validates `demo_catalog.json` against `ProductIngestSchema`; exits 1 on failure |

---

## How to fetch real photos and regenerate the catalog

Stock photos are generic per product TYPE, sourced from Pexels via their API (attribution required).

1. Set your Pexels API key:
```powershell
$env:PEXELS_API_KEY = "your_pexels_api_key_here"
```

2. Run `fetch_images.py` to populate `image_map.json`:
```powershell
backend\venv\Scripts\python.exe backend/data/fetch_images.py
```

3. Regenerate the demo catalog (reads `image_map.json` and assigns photos deterministically):
```powershell
$env:PYTHONPATH = 'backend'
backend\venv\Scripts\python.exe backend/data/generate_demo_catalog.py
```

4. Validate the catalog:
```powershell
backend\venv\Scripts\python.exe backend/data/validate_catalog.py
```

5. Reseed the backend with `--clear`:
```powershell
backend\venv\Scripts\python.exe backend/catalog_seed.py --clear
```

Expected output: `700 products`, 100 per category, 0 failures.

---

## How to seed the backend

Make sure `uvicorn` is running on port 8001:

```powershell
# Terminal 1 — start the server
cd backend
venv\Scripts\uvicorn.exe main:app --port 8001 --reload
```

Then in a second terminal (project root):

```powershell
# Seed 10 products per category (quick test)
backend\venv\Scripts\python.exe backend/catalog_seed.py --limit-per-category 10 --clear

# Seed the full 700 products
backend\venv\Scripts\python.exe backend/catalog_seed.py --clear

# With an API key (if the backend requires one)
backend\venv\Scripts\python.exe backend/catalog_seed.py --clear --api-key YOUR_KEY
```

Flags:

| Flag | Default | Description |
|---|---|---|
| `--base-url` | `http://localhost:8001` | Backend base URL |
| `--limit-per-category N` | unlimited | Ingest only the first N products per category |
| `--clear` | off | Call `DELETE /api/v1/admin/clear?confirm=true` before seeding |
| `--concurrency N` | 4 | Number of concurrent ingest requests |
| `--api-key KEY` | none | Value sent as `X-Api-Key` header |

---

## How real ingestion will work (replacing this demo data)

The `POST /api/v1/ingest` endpoint already performs upserts (insert or update by `product_id`).
The n8n automation workflow will call this endpoint with real product data scraped from stores.
Once real data is flowing, the demo catalog can be removed — just run:

```powershell
curl -X DELETE "http://localhost:8001/api/v1/admin/clear?confirm=true"
```

and then let n8n seed live products.

---

## Category format

Every product's `category` field follows `"<Top-level> / <Sub-type>"`, e.g. `"Electronics / Headphones"`.
The browse endpoint (`GET /api/v1/products?category=electronics`) uses a case-insensitive substring match,
so querying `electronics` matches all Electronics sub-types.

