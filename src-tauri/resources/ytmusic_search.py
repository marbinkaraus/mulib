#!/usr/bin/env python3
"""
YouTube Music search via ytmusicapi, with high-res square cover art from iTunes.
Usage: python3 ytmusic_search.py <query> [limit]
Outputs one JSON object per line (NDJSON).
"""
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed


def itunes_artwork(artist, album_or_title):
    """
    Fetch high-res square cover from iTunes Search API.
    Returns a 600x600 mzstatic.com URL, or None on failure.
    No auth required. Free, public API.
    """
    term = f"{artist} {album_or_title}"
    params = urllib.parse.urlencode({
        "term": term,
        "entity": "song",
        "limit": "5",
        "media": "music",
    })
    url = f"https://itunes.apple.com/search?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mulib/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        results = data.get("results") or []
        if not results:
            return None
        artist_lower = artist.lower()
        best = next(
            (r for r in results if artist_lower in (r.get("artistName") or "").lower()),
            results[0]
        )
        raw = best.get("artworkUrl100") or ""
        if not raw:
            return None
        # mzstatic URLs accept any size — replace the trailing size segment
        return raw.rsplit("/", 1)[0] + "/600x600bb.jpg"
    except Exception:
        return None


def ytimg_thumbnail(video_id):
    """Fallback: YouTube public thumbnail CDN."""
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def duration_label(seconds):
    if not seconds or seconds <= 0:
        return "—"
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)

    query = sys.argv[1].strip()
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    try:
        from ytmusicapi import YTMusic
    except ImportError:
        print(json.dumps({"error": "ytmusicapi not installed"}))
        sys.exit(1)

    try:
        ytm = YTMusic()
        results = ytm.search(query, filter="songs", limit=limit)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    # Build hit list first
    seen = set()
    hits = []
    for r in results:
        vid = r.get("videoId")
        if not vid or vid in seen:
            continue
        seen.add(vid)

        artists = r.get("artists") or []
        artist_name = ", ".join(a["name"] for a in artists if a.get("name")) or None
        album = r.get("album") or {}
        album_name = album.get("name") if isinstance(album, dict) else None
        duration_secs = r.get("duration_seconds")

        hits.append({
            "video_id": vid,
            "title": r.get("title") or "(no title)",
            "artist": artist_name,
            "album": album_name,
            "duration_label": r.get("duration") or duration_label(duration_secs),
            "duration_secs": duration_secs,
            "webpage_url": f"https://music.youtube.com/watch?v={vid}",
            "thumbnail_url": None,  # filled below
            "year": r.get("year"),
            "is_explicit": r.get("isExplicit", False),
        })

    if not hits:
        return

    # Deduplicate iTunes lookups by (artist, album) key — many songs share the same cover
    # Fetch all unique covers in parallel (thread pool, max 8 concurrent)
    cover_keys = {}  # (artist, lookup_term) -> future
    for h in hits:
        artist = h["artist"]
        if not artist:
            continue
        lookup = h["album"] or h["title"]
        key = (artist, lookup)
        cover_keys[key] = None  # placeholder

    cover_cache = {}  # key -> url or None

    def fetch(key):
        artist, lookup = key
        return key, itunes_artwork(artist, lookup)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch, k): k for k in cover_keys}
        for future in as_completed(futures):
            key, url = future.result()
            cover_cache[key] = url

    # Assign covers and emit results
    for h in hits:
        artist = h["artist"]
        if artist:
            lookup = h["album"] or h["title"]
            key = (artist, lookup)
            url = cover_cache.get(key)
            h["thumbnail_url"] = url if url else ytimg_thumbnail(h["video_id"])
        else:
            h["thumbnail_url"] = ytimg_thumbnail(h["video_id"])
        print(json.dumps(h), flush=True)


if __name__ == "__main__":
    main()
