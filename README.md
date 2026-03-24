<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Mulib" width="120" height="120" />

# Build your personal music library with Mulib.

**Search for songs, artists or albums and download them to your local library. You have full control over your music.**

[![GitHub Release](https://img.shields.io/github/v/release/marbinkaraus/mulib?label=Release&logo=github&style=for-the-badge&labelColor=211912&color=f8f2eb)](https://github.com/marbinkaraus/mulib/releases/latest)
[![GitHub Stars](https://img.shields.io/github/stars/marbinkaraus/mulib?label=Stars&style=for-the-badge&labelColor=211912&color=f8f2eb)](https://github.com/marbinkaraus/mulib/stargazers)
[![Issues](https://img.shields.io/github/issues/marbinkaraus/mulib?label=Issues&logo=github&style=for-the-badge&labelColor=211912&color=f8f2eb)](https://github.com/marbinkaraus/mulib/issues)

---

[Releases](https://github.com/marbinkaraus/mulib/releases) · [News](#news) · [Quick start](#quick-start) · [Gatekeeper help](#gatekeeper-help) · [Demo](#demo) · [FAQ](#faq) · [Contributing](#contributing) · [Acknowledgements](#acknowledgements) · [Legal](#legal) · [License](#license)

---

Mulib is **free** and built for **Mac**. Get the app from [**Releases**](https://github.com/marbinkaraus/mulib/releases) — pick the download that matches your Mac (**Apple Silicon** or **Intel**) when both are listed.

**What it is:** an **educational / test** project—a hands-on example of how **local music library software** could work (search, library UI, files on disk), not a commercial music service. See **[DISCLAIMER.md](DISCLAIMER.md)** for how that fits with lawful use.

</div>

---

## News

See what’s new in each version on the [**Releases**](https://github.com/marbinkaraus/mulib/releases) page — that’s where we post **what changed** and **download links** for the latest build.

---

## Quick start

1. Open [**Releases**](https://github.com/marbinkaraus/mulib/releases) and download Mulib for your Mac.
2. Open the disk image or zip, then drag **Mulib** into your **Applications** folder (or run it from where you unpacked it).
3. Open Mulib from **Applications** and start searching — your music is saved where you choose in the app.

> [!TIP]
> If your Mac says the app **can’t be opened** or **is from an unidentified developer**, that’s common for apps outside the Mac App Store. Jump to [**Gatekeeper help**](#gatekeeper-help) below.

---

## Gatekeeper help

Apple may show a security message the first time you open Mulib. **You can still use the app** if you downloaded it from this project’s **Releases** page and you trust it.

**Easiest fix — Open from Finder**

1. In **Finder**, go to **Applications** (or the folder where Mulib lives).
2. **Control-click** (or right-click) **Mulib**.
3. Choose **Open**, then confirm.

**From System Settings**

1. Try opening Mulib once (it may be blocked).
2. Open **System Settings** → **Privacy & Security**.
3. Find the message about Mulib and click **Open Anyway** (wording can vary by macOS version).

**Still stuck?** If you’re comfortable with a one-line fix and you **trust** this app, you can remove the download “quarantine” flag in **Terminal** (change the path if Mulib isn’t in Applications):

```bash
xattr -dr com.apple.quarantine "/Applications/Mulib.app"
```

This clears the `com.apple.quarantine` extended attribute from `Mulib.app`. Adjust the quoted path if your app lives somewhere else.

---

## Demo

<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="Mulib" width="220" />

*Screen recording or screenshots coming soon — add images or a short clip here when you have them.*

</div>

---

## FAQ

> [!CAUTION]
> **Music and downloads:** Mulib is shared for **testing and learning** how local music software can work; it does **not** give you permission to infringe copyright or break the law. **You are solely responsible** for what you download and whether that use is legal where you live and under the platforms’ rules. The maintainers **do not** encourage piracy and **are not liable** for your choices. Read the full **[disclaimer](DISCLAIMER.md)** before using the app.

<details>
<summary><strong>Is this app “for real” use or just testing?</strong></summary>

It’s built as an **educational and technical demo**: a **testbed** for ideas you’d see in **real** music apps (local library, search, downloads)—useful for **experimenting** and understanding how such software could work. It is **not** a licensed commercial streaming product. **Lawful use** (including what you may download) is still **your** responsibility; see **[DISCLAIMER.md](DISCLAIMER.md)**.

</details>

<details>
<summary><strong>Is downloading music with Mulib legal?</strong></summary>

**It depends on what you download, where you live, and what rights you have.** Downloading copyrighted tracks without permission from the rightsholder (or without another valid legal basis) **may be illegal** in many places and can **violate service terms**. This project **does not** provide legal advice. If you are unsure, **do not download** until you know you are allowed to. Details: **[DISCLAIMER.md](DISCLAIMER.md)**.

</details>

<details>
<summary><strong>What does Mulib do?</strong></summary>

It helps you **find music** and **download it to your Mac** so you can build a **local library** you control—the kind of flow a **real** desktop music app might implement. The project is aimed at **learning and testing** that architecture; see **[DISCLAIMER.md](DISCLAIMER.md)** for how to use it responsibly.

</details>

<details>
<summary><strong>Do I need a subscription?</strong></summary>

Mulib is **free software** from this repository. There is no paid subscription for the app itself. Your obligations around content, copyright, and lawful use are in **[DISCLAIMER.md](DISCLAIMER.md)** and the caution note above.

</details>

<details>
<summary><strong>Which Macs work?</strong></summary>

Mulib is built for **macOS**. Use the **Releases** page to pick the right download for **Apple Silicon** or **Intel** when both are offered.

</details>

<details>
<summary><strong>Something’s broken or I have an idea</strong></summary>

Open an [**Issue**](https://github.com/marbinkaraus/mulib/issues) on GitHub. For **security-sensitive** problems, please use [**Security advisories**](https://github.com/marbinkaraus/mulib/security) instead of a public issue.

</details>

---

## Contributing

I’m glad you’re interested. **Ideas, feedback, and bug reports** help a lot — start with [**Issues**](https://github.com/marbinkaraus/mulib/issues). If you want to **change code or docs**, open an issue first for bigger changes so we can align before you spend time on a pull request.

---

## Acknowledgements

Mulib stands on great open tools and libraries, including [**Tauri**](https://tauri.app/), [**yt-dlp**](https://github.com/yt-dlp/yt-dlp), [**ytmusicapi**](https://github.com/sigma67/ytmusicapi), and [**python-build-standalone**](https://github.com/astral-sh/python-build-standalone). Thank you to everyone who builds and maintains them.

---

## Legal

> [!NOTE]
> This section summarizes how the project is offered; it is **not** legal advice.

- **[Disclaimer](DISCLAIMER.md)** — **Purpose** (educational / testing demo of local music software), **music and downloads** (sole user responsibility; no permission to infringe copyright; maintainers not liable), no warranty, no affiliation with YouTube/Google. Full text also covers the [MIT License](LICENSE).
- **[Third-party notices](THIRD_PARTY_NOTICES.md)** — Licenses for bundled dependencies (Python, yt-dlp, ytmusicapi, etc.).
- **[Security](SECURITY.md)** — How to report a **security vulnerability** privately ([GitHub Security](https://github.com/marbinkaraus/mulib/security)).

---

## License

Mulib’s **source code** is licensed under the [MIT License](LICENSE). Bundled third-party components (for example Python, **yt-dlp**, **ytmusicapi**, and other dependencies) remain under their respective licenses — see **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** for a maintained list and pointers to upstream license text.

---

<div align="center">

**Your library, your Mac, your rules.**

<br />

Made for listening on your terms.

</div>
