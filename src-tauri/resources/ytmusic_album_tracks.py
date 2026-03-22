#!/usr/bin/env python3
"""
Resolve album tracks via ytmusicapi get_album.
Usage: python3 ytmusic_album_tracks.py <browse_id>
Outputs one JSON object per line (NDJSON), same shape as ytmusic_search.py hits.
"""
import sys
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed


def itunes_artwork(artist, album_or_title):
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
        return raw.rsplit("/", 1)[0] + "/600x600bb.jpg"
    except Exception:
        return None


def ytimg_thumbnail(video_id):
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def duration_label(seconds):
    if not seconds or seconds <= 0:
        return "—"
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No browse id provided"}))
        sys.exit(1)

    browse_id = sys.argv[1].strip()
    if not browse_id.startswith("MPRE"):
        print(json.dumps({"error": "Invalid album browse id"}))
        sys.exit(1)

    try:
        from ytmusicapi import YTMusic
    except ImportError:
        print(json.dumps({"error": "ytmusicapi not installed"}))
        sys.exit(1)

    try:
        ytm = YTMusic()
        album = ytm.get_album(browse_id)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    tracks = album.get("tracks") or []
    album_title = album.get("title") or ""
    album_artists = album.get("artists") or []
    default_artist = ", ".join(a["name"] for a in album_artists if a.get("name")) or None

    thumbs = album.get("thumbnails") or []
    album_thumb = None
    if thumbs:
        best_w = 0
        for t in thumbs:
            w = t.get("width") or 0
            if w >= best_w:
                best_w = w
                album_thumb = t.get("url")

    if not tracks:
        return

    hits = []
    for r in tracks:
        vid = r.get("videoId")
        if not vid:
            continue
        if r.get("isAvailable") is False:
            continue

        artists = r.get("artists") or []
        artist_name = ", ".join(a["name"] for a in artists if a.get("name")) or default_artist

        al = r.get("album")
        if isinstance(al, dict):
            album_name = al.get("name")
        else:
            album_name = al if isinstance(al, str) else album_title

        duration_secs = r.get("duration_seconds")

        hits.append({
            "video_id": vid,
            "title": r.get("title") or "(no title)",
            "artist": artist_name,
            "album": album_name,
            "duration_label": r.get("duration") or duration_label(duration_secs),
            "duration_secs": duration_secs,
            "webpage_url": f"https://music.youtube.com/watch?v={vid}",
            "thumbnail_url": None,
            "year": r.get("year"),
            "is_explicit": r.get("isExplicit", False),
        })

    cover_keys = {}
    for h in hits:
        artist = h["artist"]
        if not artist:
            continue
        lookup = h["album"] or h["title"]
        cover_keys[(artist, lookup)] = None

    cover_cache = {}

    def fetch(key):
        artist, lookup = key
        return key, itunes_artwork(artist, lookup)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch, k): k for k in cover_keys}
        for future in as_completed(futures):
            key, url = future.result()
            cover_cache[key] = url

    for h in hits:
        artist = h["artist"]
        if artist:
            lookup = h["album"] or h["title"]
            key = (artist, lookup)
            url = cover_cache.get(key)
            h["thumbnail_url"] = url if url else (album_thumb or ytimg_thumbnail(h["video_id"]))
        else:
            h["thumbnail_url"] = album_thumb or ytimg_thumbnail(h["video_id"])

    for h in hits:
        print(json.dumps(h), flush=True)


if __name__ == "__main__":
    main()
