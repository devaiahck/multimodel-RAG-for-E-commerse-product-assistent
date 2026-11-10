"""Download working images for electronics products into backend/static/images/electronics/<product_id>.jpg.
Validate files are real images and >= 3 KB.
Update electronics_products_with_images.json with local URLs:
http://localhost:8001/static/images/electronics/<product_id>.jpg.
Products with no image keep image_url=None.
"""
import io
import json
import os
import sys
import httpx
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JSON_PATH = os.path.join(BASE_DIR, "data", "electronics", "electronics_products_with_images.json")
STATIC_IMG_DIR = os.path.join(BASE_DIR, "static", "images", "electronics")

def main():
    if not os.path.exists(JSON_PATH):
        print(f"File not found: {JSON_PATH}")
        sys.exit(1)

    os.makedirs(STATIC_IMG_DIR, exist_ok=True)
    products = json.load(open(JSON_PATH, encoding="utf-8"))
    client = httpx.Client(timeout=15.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})

    downloaded = 0
    skipped = 0

    print(f"Processing images for {len(products)} products...")

    for i, p in enumerate(products, 1):
        pid = p["product_id"]
        remote_url = p.get("image_url")
        target_path = os.path.join(STATIC_IMG_DIR, f"{pid}.jpg")
        local_url = f"http://localhost:8001/static/images/electronics/{pid}.jpg"

        if not remote_url or not remote_url.startswith("http"):
            p["image_url"] = None
            skipped += 1
            continue

        # If already downloaded and valid
        if os.path.exists(target_path) and os.path.getsize(target_path) >= 3072:
            try:
                with Image.open(target_path) as test_img:
                    test_img.verify()
                p["image_url"] = local_url
                downloaded += 1
                continue
            except Exception:
                pass

        try:
            resp = client.get(remote_url)
            if resp.status_code != 200:
                print(f"[{i}] {pid}: HTTP {resp.status_code}")
                p["image_url"] = None
                skipped += 1
                continue

            content = resp.content
            if len(content) < 3072:  # Under 3 KB
                print(f"[{i}] {pid}: File too small ({len(content)} bytes)")
                p["image_url"] = None
                skipped += 1
                continue

            # Verify it's a real image
            img = Image.open(io.BytesIO(content))
            img.verify()

            # Re-open and convert to RGB for standard JPEG storage
            img = Image.open(io.BytesIO(content)).convert("RGB")
            img.save(target_path, "JPEG", quality=85)

            p["image_url"] = local_url
            downloaded += 1
            print(f"[{i}/{len(products)}] Downloaded: {pid} ({len(content) // 1024} KB)")

        except Exception as e:
            print(f"[{i}] {pid}: Failed ({e})")
            if os.path.exists(target_path):
                try: os.remove(target_path)
                except Exception: pass
            p["image_url"] = None
            skipped += 1

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Successfully downloaded/verified: {downloaded}, Skipped (no image / < 3KB / invalid): {skipped}")

if __name__ == "__main__":
    main()

