#!/usr/bin/env bash
# Download statically linked ffmpeg + ffprobe (no Homebrew paths).
# Source: https://github.com/eugeneware/ffmpeg-static/releases
#
# Usage: from repo root (mulib): ./scripts/fetch-ffmpeg-static.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES="$(cd "$SCRIPT_DIR/../src-tauri/resources" && pwd)"

TAG="b6.1.1"
BASE_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}"

case "$(uname -s)" in
  Darwin) ;;
  *)
    echo "Error: This script only supports macOS."
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64) SUFFIX="darwin-arm64" ;;
  x86_64) SUFFIX="darwin-x64" ;;
  *)
    echo "Error: Unsupported CPU: $(uname -m)"
    exit 1
    ;;
esac

echo "Fetching static ffmpeg + ffprobe (${SUFFIX}) ..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "${BASE_URL}/ffmpeg-${SUFFIX}" -o "$TMP/ffmpeg"
curl -fsSL "${BASE_URL}/ffprobe-${SUFFIX}" -o "$TMP/ffprobe"
chmod +x "$TMP/ffmpeg" "$TMP/ffprobe"

"$TMP/ffmpeg" -version | head -1
"$TMP/ffprobe" -version | head -1

mv "$TMP/ffmpeg" "$RESOURCES/ffmpeg"
mv "$TMP/ffprobe" "$RESOURCES/ffprobe"
trap - EXIT
rm -rf "$TMP"

echo "Installed:"
ls -lah "$RESOURCES/ffmpeg" "$RESOURCES/ffprobe"
