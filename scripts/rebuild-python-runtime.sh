#!/usr/bin/env bash
# Rebuild the embedded Python runtime using python-build-standalone (relocatable;
# no dependency on Homebrew Cellar paths). Then install yt-dlp + ytmusicapi.
#
# Usage: from repo root (mulib): ./scripts/rebuild-python-runtime.sh
#
# Bump PBS_TAG / CPYTHON_VER when you move to a newer standalone release.
# See: https://github.com/astral-sh/python-build-standalone/releases

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_TAURI="$APP_ROOT/src-tauri"
RESOURCES="$SRC_TAURI/resources"
RUNTIME_DIR="$RESOURCES/python-runtime"

# Release tag on astral-sh/python-build-standalone and matching CPython version string.
PBS_TAG="20260320"
CPYTHON_VER="3.12.13"

case "$(uname -s)" in
  Darwin) ;;
  *)
    echo "Error: This script only supports macOS (python-build-standalone darwin builds)."
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64) PBS_ARCH="aarch64-apple-darwin" ;;
  x86_64) PBS_ARCH="x86_64-apple-darwin" ;;
  *)
    echo "Error: Unsupported CPU architecture: $(uname -m)"
    exit 1
    ;;
esac

ASSET="cpython-${CPYTHON_VER}+${PBS_TAG}-${PBS_ARCH}-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${ASSET}"

echo "Removing old runtime at $RUNTIME_DIR"
rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"

TMP_TAR="$(mktemp -t mulib-python.XXXXXX.tar.gz)"
cleanup() { rm -f "$TMP_TAR"; }
trap cleanup EXIT

echo "Downloading $ASSET ..."
curl -fsSL "$URL" -o "$TMP_TAR"

echo "Extracting standalone Python into $RUNTIME_DIR ..."
tar -xzf "$TMP_TAR" -C "$RUNTIME_DIR"
# Archive contains a top-level "python/" directory with bin/, lib/, etc.

PY="$RUNTIME_DIR/python/bin/python3"
if [[ ! -x "$PY" ]]; then
  echo "Error: Expected executable at $PY"
  exit 1
fi

echo "Using bundled interpreter: $($PY --version)"
echo "Installing yt-dlp + ytmusicapi ..."
"$PY" -m pip install --upgrade pip
"$PY" -m pip install yt-dlp ytmusicapi

echo "Verifying..."
"$PY" -m yt_dlp --version
"$PY" -c "from ytmusicapi import YTMusic; print('ytmusicapi ok')"

echo "Done. Rebuild the Tauri app. Users can clear stale app data with:"
echo "  rm -rf ~/Library/Application\\ Support/com.marbin.mulib/runtime"
