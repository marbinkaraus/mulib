#!/usr/bin/env python3
"""
Download a YouTube Music track as MP3 with iTunes cover art embedded.

Usage:
  python3 ytmusic_download.py <video_url> <output_dir> <base_filename> [cover_url] [artist] [album]

Progress is emitted as JSON lines to stdout:
  {"stage": "downloading", "percent": 42.5}
  {"stage": "converting"}
  {"stage": "cover"}
  {"stage": "saving"}
  {"stage": "done", "path": "/path/to/file.mp3"}
  {"stage": "error", "message": "..."}
"""
import sys
import json
import os
import re
import subprocess
import tempfile
import urllib.request
import shutil


def emit(obj):
    print(json.dumps(obj), flush=True)


def find_ffmpeg():
    """
    Look for ffmpeg in order:
    1. Bundled alongside this script (static build; no Homebrew paths)
    2. System PATH (dev fallback)
    yt-dlp resolves ffprobe from the same directory as this ffmpeg path.
    """
    import shutil as sh

    script_dir = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.join(script_dir, "ffmpeg")
    if os.path.isfile(bundled) and os.access(bundled, os.X_OK):
        return bundled

    return sh.which("ffmpeg") or "ffmpeg"


def download_cover(cover_url, dest_path):
    """Download cover art from iTunes to dest_path. Returns True on success."""
    if not cover_url:
        return False
    try:
        req = urllib.request.Request(cover_url, headers={"User-Agent": "mulib/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
        with open(dest_path, "wb") as f:
            f.write(data)
        return os.path.getsize(dest_path) > 0
    except Exception as e:
        emit({"stage": "warning", "message": f"Cover download failed: {e}"})
        return False


def embed_cover_and_meta(mp3_path, cover_path, ffmpeg, artist="", album=""):
    """Replace cover art and inject artist/album tags into mp3_path using ffmpeg."""
    tmp = mp3_path + ".tmp.mp3"
    try:
        cmd = [ffmpeg, "-y", "-i", mp3_path]
        if cover_path:
            cmd += ["-i", cover_path,
                    "-map", "0:a",
                    "-map", "1:v",
                    "-c:v", "mjpeg",
                    "-id3v2_version", "3",
                    "-metadata:s:v", "title=Album cover",
                    "-metadata:s:v", "comment=Cover (front)"]
        else:
            cmd += ["-map", "0:a"]
        cmd += ["-c:a", "copy"]
        if artist:
            cmd += ["-metadata", f"artist={artist}"]
        if album:
            cmd += ["-metadata", f"album={album}"]
        cmd.append(tmp)

        result = subprocess.run(cmd, capture_output=True, timeout=30)
        if result.returncode != 0:
            err = result.stderr.decode(errors="replace").strip()
            emit({"stage": "warning", "message": f"Cover embed failed: {err}"})
            if os.path.exists(tmp):
                os.remove(tmp)
            return False
        os.replace(tmp, mp3_path)
        return True
    except Exception as e:
        emit({"stage": "warning", "message": f"Cover embed error: {e}"})
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except Exception:
                pass
        return False


def main():
    if len(sys.argv) < 4:
        emit({"stage": "error", "message": "Usage: ytmusic_download.py <url> <output_dir> <base_filename> [cover_url] [artist] [album]"})
        sys.exit(1)

    video_url   = sys.argv[1]
    output_dir  = sys.argv[2]
    base_name   = sys.argv[3]          # e.g. "Rammstein - Ich will"
    cover_url   = sys.argv[4] if len(sys.argv) > 4 else ""
    artist      = sys.argv[5] if len(sys.argv) > 5 else ""
    album       = sys.argv[6] if len(sys.argv) > 6 else ""

    os.makedirs(output_dir, exist_ok=True)
    ffmpeg = find_ffmpeg()

    # Use a temp dir for all intermediate work; only move the finished mp3 to
    # output_dir at the very end. This avoids macOS sandbox restrictions that
    # prevent ffmpeg from writing conversion output directly into ~/Music.
    work_dir = tempfile.mkdtemp(prefix="mulib_dl_")

    try:
        # ── Step 1: yt-dlp download + audio conversion ────────────────────────
        emit({"stage": "finding"})

        python = sys.executable
        ytdlp_args = [
            python, "-m", "yt_dlp",
            "--no-playlist",
            "-x", "--audio-format", "mp3", "--audio-quality", "0",
            "--embed-metadata",
            "--no-embed-thumbnail",   # we handle cover + metadata ourselves via ffmpeg
            "--no-write-thumbnail",
            "--ffmpeg-location", ffmpeg,  # use bundled ffmpeg
            "-o", f"{base_name}.%(ext)s",
            "-P", work_dir,
            "--no-warnings",
            "--newline",
            "--progress-template", "download:[download] %(progress._percent_str)s of %(progress._total_bytes_str)s",
            video_url,
        ]

        proc = subprocess.Popen(
            ytdlp_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        stage = "finding"
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue

            m = re.search(r"(\d+(?:\.\d+)?)%", line)
            if m and "[download]" in line:
                pct = float(m.group(1))
                if stage != "downloading":
                    stage = "downloading"
                emit({"stage": "downloading", "percent": pct})
                continue

            lower = line.lower()
            if "extractaudio" in lower or "converting" in lower:
                stage = "converting"
                emit({"stage": "converting"})
            elif "metadata" in lower and "adding" in lower:
                emit({"stage": "saving"})
            elif "error" in lower:
                emit({"stage": "warning", "message": line})

        proc.wait()
        if proc.returncode != 0:
            emit({"stage": "error", "message": f"Download failed (exit {proc.returncode})"})
            sys.exit(1)

        mp3_path = os.path.join(work_dir, f"{base_name}.mp3")
        if not os.path.exists(mp3_path):
            emit({"stage": "error", "message": f"Output file not found: {mp3_path}"})
            sys.exit(1)

        # ── Step 2: embed iTunes cover + inject artist/album via ffmpeg ──────────
        emit({"stage": "cover"})
        cover_tmp = None
        if cover_url:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False, dir=work_dir) as tf:
                cover_tmp = tf.name
            if not download_cover(cover_url, cover_tmp):
                cover_tmp = None

        emit({"stage": "saving"})
        embed_cover_and_meta(mp3_path, cover_tmp, ffmpeg, artist=artist, album=album)
        if cover_tmp and os.path.exists(cover_tmp):
            os.remove(cover_tmp)

        # ── Step 3: move finished mp3 to the real output dir ─────────────────
        emit({"stage": "saving"})
        final_path = os.path.join(output_dir, f"{base_name}.mp3")
        shutil.move(mp3_path, final_path)

        emit({"stage": "done", "path": final_path})

    finally:
        # Clean up temp work dir (removes any leftover .webm/.webp etc.)
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
