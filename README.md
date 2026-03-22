# Music downloader UI (Tauri + React + TypeScript)

A desktop app to search YouTube Music and download audio via an embedded `yt-dlp` runtime.

## Embedded runtime (Python + yt-dlp)

The embedded runtime is built with **Python 3.12 or 3.11** and installed into `src-tauri/resources/python-runtime`.
To rebuild it:

```bash
# From this directory (mulib)
./scripts/rebuild-python-runtime.sh
```

Install Python 3.12 if needed: `brew install python@3.12`.

---

This template uses Tauri, React and TypeScript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
