# Third-party notices

Mulib’s own source code is released under the [MIT License](../LICENSE). This document lists major third-party software shipped with or used to build Mulib, and the license identified for each at the time of writing.

Update this file when you upgrade bundled runtimes, change direct dependencies, or regenerate lockfiles. Full transitive dependency graphs live in `src-tauri/Cargo.lock` and `pnpm-lock.yaml`; each crate or package lists its SPDX license on [crates.io](https://crates.io) or the npm registry.

---

## Embedded Python runtime

| Component | Version | License | Notes |
|-----------|---------|---------|--------|
| CPython | 3.12 | [PSF License Agreement](https://docs.python.org/3/license.html) | Full text: `src-tauri/resources/python-runtime/python/lib/python3.12/LICENSE.txt` |

The distribution under `src-tauri/resources/python-runtime/` may also include **Tcl/Tk** and other CPython components. License terms for those files appear alongside them in that tree (for example Tcl/Tk under `python/lib/tcl9.0/` and `python/lib/tk9.0/`).

---

## Python packages (`site-packages`)

Bundled wheels (versions from `*.dist-info` in the embedded environment):

| Package | Version | SPDX / license |
|---------|---------|----------------|
| [certifi](https://github.com/certifi/python-certifi) | 2026.2.25 | MPL-2.0 |
| [charset-normalizer](https://github.com/Ousret/charset_normalizer) | 3.4.6 | MIT |
| [idna](https://github.com/kjd/idna) | 3.11 | BSD-3-Clause |
| [pip](https://github.com/pypa/pip) | 26.0.1 | MIT |
| [requests](https://github.com/psf/requests) | 2.32.5 | Apache-2.0 |
| [urllib3](https://github.com/urllib3/urllib3) | 2.6.3 | MIT |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 2026.3.17 | Unlicense |
| [ytmusicapi](https://github.com/sigma67/ytmusicapi) | 1.11.5 | MIT |

Upstream license files are under each package’s `*.dist-info/licenses/` directory in `src-tauri/resources/python-runtime/python/lib/python3.12/site-packages/`.

---

## Rust crates (direct dependencies)

Versions from `src-tauri/Cargo.lock` (Mulib `0.1.0`). The Tauri ecosystem crates are dual-licensed **MIT OR Apache-2.0**; `serde` / `serde_json` / `tokio` use **MIT OR Apache-2.0** or **MIT** as published on crates.io.

| Crate | Version |
|-------|---------|
| [tauri](https://github.com/tauri-apps/tauri) | 2.10.3 |
| [tauri-build](https://github.com/tauri-apps/tauri) | 2.5.6 |
| [tauri-plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | 2.6.0 |
| [tauri-plugin-opener](https://github.com/tauri-apps/plugins-workspace) | 2.5.3 |
| [serde](https://github.com/serde-rs/serde) | 1.0.228 |
| [serde_json](https://github.com/serde-rs/json) | 1.0.149 |
| [tokio](https://github.com/tokio-rs/tokio) | 1.50.0 |

Transitive Rust dependencies (hundreds of crates) are recorded in `src-tauri/Cargo.lock`; each crate’s license is in its `Cargo.toml` on crates.io.

---

## npm packages (frontend and build)

Versions from `pnpm-lock.yaml` (root importer). Typical SPDX identifiers: **MIT** for React, Vite, TypeScript, and `@tauri-apps/*` packages (confirm on npm if you need legal certainty).

| Package | Version |
|---------|---------|
| [@tauri-apps/api](https://www.npmjs.com/package/@tauri-apps/api) | 2.10.1 |
| [@tauri-apps/cli](https://www.npmjs.com/package/@tauri-apps/cli) | 2.10.1 |
| [@tauri-apps/plugin-dialog](https://www.npmjs.com/package/@tauri-apps/plugin-dialog) | 2.6.0 |
| [@tauri-apps/plugin-opener](https://www.npmjs.com/package/@tauri-apps/plugin-opener) | 2.5.3 |
| [@types/react](https://www.npmjs.com/package/@types/react) | 19.2.14 |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom) | 19.2.3 |
| [@vitejs/plugin-react](https://www.npmjs.com/package/@vitejs/plugin-react) | 4.7.0 |
| [react](https://www.npmjs.com/package/react) | 19.2.4 |
| [react-dom](https://www.npmjs.com/package/react-dom) | 19.2.4 |
| [typescript](https://www.npmjs.com/package/typescript) | 5.8.3 |
| [vite](https://www.npmjs.com/package/vite) | 7.3.1 |

All other packages pulled in by pnpm are listed in `pnpm-lock.yaml` with resolved versions.
