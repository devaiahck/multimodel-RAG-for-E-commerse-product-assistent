"""
UrbanPick — Fetch stock photos for catalog sub-types from Pexels API.

Usage:
    export PEXELS_API_KEY="your_api_key_here"  (or set in .env / Windows environment)
    python backend/data/fetch_images.py

Collects distinct sub-types from demo_catalog.json, searches Pexels for square photos,
and writes the medium URL and photo attribution to backend/data/image_map.json.
Hotlinks Pexels CDN images directly; does not download or store image files locally.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from typing import Dict, List, Any


def get_api_key() -> str:
    key = os.environ.get("PEXELS_API_KEY", "").strip()
    if not key:
        # Check parent or backend .env if present
        env_paths = [
            os.path.join(os.path.dirname(__file__), "..", ".env"),
            os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        ]
        for env_path in env_paths:
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("PEXELS_API_KEY=") and not line.startswith("#"):
                            key = line.split("=", 1)[1].strip().strip("'\"")
                            if key:
                                return key
    return key


def fetch_photos_for_query(query: str, api_key: str) -> List[Dict[str, str]]:
    encoded_query = urllib.parse.quote(query)
    url = f"https://api.pexels.com/v1/search?query={encoded_query}&per_page=8&orientation=square"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": api_key,
            "User-Agent": "UrbanPickDemoCatalog/1.0",
        },
    )

    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                photos = data.get("photos", [])
                results = []
                for p in photos:
                    src = p.get("src", {})
                    medium_url = src.get("medium") or src.get("large") or src.get("original")
                    if medium_url:
                        results.append({
                            "url": medium_url,
                            "photographer": p.get("photographer", "Pexels Contributor"),
                            "page": p.get("url", "https://www.pexels.com"),
                        })
                return results
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 0:
                print(f"Rate limited (429) for '{query}', waiting 5 seconds before retry...")
                time.sleep(5)
                continue
            print(f"HTTP error {e.code} fetching photos for '{query}': {e.reason}")
            return []
        except Exception as e:
            print(f"Error fetching photos for '{query}': {e}")
            return []
    return []


def main():
    api_key = get_api_key()
    if not api_key:
        print("ERROR: PEXELS_API_KEY environment variable is not set.", file=sys.stderr)
        print("Please set PEXELS_API_KEY before running fetch_images.py.", file=sys.stderr)
        sys.exit(1)

    data_dir = os.path.dirname(os.path.abspath(__file__))
    catalog_path = os.path.join(data_dir, "demo_catalog.json")
    image_map_path = os.path.join(data_dir, "image_map.json")

    if not os.path.exists(catalog_path):
        print(f"ERROR: {catalog_path} not found. Run generate_demo_catalog.py first.", file=sys.stderr)
        sys.exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    # Collect distinct sub-types (text after ' / ' in category)
    subtypes = set()
    for p in products:
        cat = p.get("category", "")
        if " / " in cat:
            subtypes.add(cat.split(" / ", 1)[1].strip())
        elif cat.strip():
            subtypes.add(cat.strip())

    sorted_subtypes = sorted(list(subtypes))
    print(f"Found {len(sorted_subtypes)} unique sub-types to fetch photos for.")

    # Load existing map if present to avoid re-fetching already mapped types
    image_map: Dict[str, List[Dict[str, str]]] = {}
    if os.path.exists(image_map_path):
        try:
            with open(image_map_path, "r", encoding="utf-8") as f:
                image_map = json.load(f)
            print(f"Loaded existing image_map.json with {len(image_map)} entries.")
        except Exception:
            image_map = {}

    success_count = 0
    skipped_count = 0

    for idx, subtype in enumerate(sorted_subtypes, start=1):
        if subtype in image_map and len(image_map[subtype]) >= 3:
            print(f"[{idx}/{len(sorted_subtypes)}] '{subtype}' already in image map ({len(image_map[subtype])} photos), skipping.")
            continue

        query = f"{subtype} product"
        print(f"[{idx}/{len(sorted_subtypes)}] Fetching Pexels photos for query: '{query}'...")
        photos = fetch_photos_for_query(query, api_key)

        # Fallback query with just the subtype name if zero results
        if not photos:
            photos = fetch_photos_for_query(subtype, api_key)

        if photos:
            # Pick 5 to 8 photos
            image_map[subtype] = photos[:8]
            print(f"  -> Got {len(image_map[subtype])} photos for '{subtype}'.")
            success_count += 1
        else:
            print(f"  WARNING: No photos found for sub-type '{subtype}'.")
            skipped_count += 1

        # Be polite to the API rate limit: 1-second pause
        time.sleep(1.0)

    # Save to image_map.json
    with open(image_map_path, "w", encoding="utf-8") as f:
        json.dump(image_map, f, indent=2, ensure_ascii=False)

    print("\nFetch complete!")
    print(f"Saved image map with {len(image_map)} sub-types to {image_map_path}")
    print(f"New fetches successful: {success_count}, skipped/empty: {skipped_count}")


if __name__ == "__main__":
    main()

