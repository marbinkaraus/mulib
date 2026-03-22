#!/usr/bin/env python3
"""
YouTube Music album search via ytmusicapi.
Usage: python3 ytmusic_album_search.py <query> [limit]
Outputs one JSON object per line (NDJSON).
"""
import sys
import json


def best_thumb(thumbnails):
    """Pick highest-res thumbnail URL from API list."""
    if not thumbnails:
        return None
    best = None
    best_w = 0
    for t in thumbnails:
        w = t.get("width") or 0
        if w >= best_w:
            best_w = w
            best = t.get("url")
    return best


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)

    query = sys.argv[1].strip()
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 8

    try:
        from ytmusicapi import YTMusic
    except ImportError:
        print(json.dumps({"error": "ytmusicapi not installed"}))
        sys.exit(1)

    try:
        ytm = YTMusic()
        results = ytm.search(query, filter="albums", limit=limit)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    seen = set()
    for r in results:
        bid = r.get("browseId")
        if not bid or bid in seen:
            continue
        seen.add(bid)

        artists = r.get("artists") or []
        artist_name = ", ".join(a["name"] for a in artists if a.get("name")) or None
        year = r.get("year")
        if isinstance(year, str) and year.isdigit():
            year = int(year)
        elif not isinstance(year, int):
            year = None

        tc = r.get("trackCount")
        if isinstance(tc, str):
            try:
                tc = int(tc.split()[0])
            except (ValueError, IndexError):
                tc = None

        row = {
            "browse_id": bid,
            "title": r.get("title") or "(no title)",
            "artist": artist_name,
            "year": year,
            "thumbnail_url": best_thumb(r.get("thumbnails")),
            "track_count": tc,
        }
        print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main()
