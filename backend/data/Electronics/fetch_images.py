"""Fill image_url for products by searching the web for each product name (any category).
Run on YOUR machine (needs internet):  pip install duckduckgo-search httpx
    python data/electronics/fetch_images.py --file data/electronics/electronics_products.json
Writes <input name>_with_images.json next to the input file. Products with no confident hit keep image_url=null.
Spot-check about 20 results: an image search can return a similar-looking model.
"""
import argparse, json, os, time
import httpx
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS

ap = argparse.ArgumentParser()
ap.add_argument("--file", required=True)
a = ap.parse_args()
products = json.load(open(a.file, encoding="utf-8"))
http = httpx.Client(timeout=15.0, follow_redirects=True)

def is_image(url):
    try:
        r = http.head(url)
        return r.status_code == 200 and r.headers.get("content-type", "").startswith("image/")
    except Exception:
        return False

with DDGS() as ddgs:
    for i, p in enumerate(products, 1):
        if p.get("image_url"):
            continue
        try:
            hits = ddgs.images(f'{p["title"]} product photo', max_results=8)
        except Exception as e:
            print(f"[{i}] search error: {e}"); time.sleep(3); continue
        for h in hits:
            u = h.get("image", "")
            if u.startswith("https://") and is_image(u):
                p["image_url"] = u
                break
        print(f"[{i}/{len(products)}] {p['title'][:45]:45s} -> {'OK' if p.get('image_url') else 'none'}", flush=True)
        time.sleep(1.2)

base, ext = os.path.splitext(a.file)
out = f"{base}_with_images{ext}"
json.dump(products, open(out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print("saved", out, flush=True)
