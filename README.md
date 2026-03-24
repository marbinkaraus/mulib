<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Mulib" width="120" height="120" />

# Build your personal music library.

**Search for songs, artists or albums and download them to your local library. You have full control over your music.**

[![GitHub Release](https://img.shields.io/github/v/release/marbinkaraus/mulib?label=Release&logo=github&style=for-the-badge&labelColor=211912&color=f8f2eb)](https://github.com/marbinkaraus/mulib/releases/latest)
[![GitHub Stars](https://img.shields.io/github/stars/marbinkaraus/mulib?label=Stars&style=for-the-badge&labelColor=211912&color=f8f2eb)](https://github.com/marbinkaraus/mulib/stargazers)
[![Issues](https://img.shields.io/github/issues/marbinkaraus/mulib?label=Issues&logo=github&style=for-the-badge&labelColor=211912&color=f8f2eb)](https://github.com/marbinkaraus/mulib/issues)

---

[Releases](https://github.com/marbinkaraus/mulib/releases) · [News](#news) · [Quick start](#quick-start) · [Gatekeeper help](#gatekeeper-help) · [Demo](#demo) · [FAQ](#faq) · [Contributing](#contributing) · [Acknowledgements](#acknowledgements) · [License](#license)

---

Mulib is **free** and built for **Mac**. Get the app from [**Releases**](https://github.com/marbinkaraus/mulib/releases) — pick the download that matches your Mac (**Apple Silicon** or **Intel**) when both are listed.

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

> [!IMPORTANT]
> **Use of downloaded content:** Mulib is free software from this repository. How you use downloaded material must follow the **rules of the services and content you access** — you’re responsible for complying with those terms and with the law where you live.

<details>
<summary><strong>What does Mulib do?</strong></summary>

It helps you **find music** and **download it to your Mac** so you can build a **local library** you control.

</details>

<details>
<summary><strong>Do I need a subscription?</strong></summary>

Mulib is **free software** from this repository. There is no paid subscription for the app itself. Your obligations around content and services are described in the note above.

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

## License

Mulib’s **source code** is licensed under the [MIT License](LICENSE). Bundled third-party components (for example Python, **yt-dlp**, **ytmusicapi**, and other dependencies) remain under their respective licenses — see **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** for a maintained list and pointers to upstream license text.

---

<div align="center">

**Your library, your Mac, your rules.**

<br />

Made for listening on your terms.

</div>
