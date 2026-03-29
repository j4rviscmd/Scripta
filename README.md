<div align="center">

# Scripta

![Scripta Screenshot](public/screenshot.png)

[![Windows](https://img.shields.io/badge/Windows-Supported-0078D6?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+V2luZG93cyAxMTwvdGl0bGU+PHBhdGggZmlsbD0iIzAwQTRFRiIgZD0iTTAsMEgxMS4zNzdWMTEuMzcySDBaTTEyLjYyMywwSDI0VjExLjM3MkgxMi42MjNaTTAsMTIuNjIzSDExLjM3N1YyNEgwWm0xMi42MjMsMEgyNFYyNEgxMi42MjMiLz48L3N2Zz4=)](https://github.com/j4rviscmd/Scripta/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-Supported-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/j4rviscmd/Scripta/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/j4rviscmd/Scripta/total?style=for-the-badge&color=blue&logo=github&logoColor=white)](https://github.com/j4rviscmd/Scripta/releases)<br/>
[![Latest Release](https://img.shields.io/github/v/release/j4rviscmd/Scripta?style=for-the-badge&color=green&label=Latest&logo=github&logoColor=white)](https://github.com/j4rviscmd/Scripta/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/j4rviscmd/Scripta/main?style=for-the-badge&color=1F6FEB&label=Last%20Update&logo=git&logoColor=white)](https://github.com/j4rviscmd/Scripta/commits/main)
[![CI](https://img.shields.io/github/actions/workflow/status/j4rviscmd/Scripta/ci.yml?style=for-the-badge&label=CI&color=brightgreen&logo=githubactions&logoColor=white)](https://github.com/j4rviscmd/Scripta/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-018FF5?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)

<!-- markdownlint-disable MD001 -->
### A beautifully simple note app that works offline

No accounts, no cloud, no subscriptions. Just your notes, on your computer.

</div>

---

## Why Scripta?

Most note apps want you online, signed in, and paying. Scripta doesn't.

- **Completely offline** — Your notes never leave your computer. No accounts, no cloud, no tracking.
- **Instant and lightweight** — Opens in under a second. No loading spinners, no sync delays.
- **Distraction-free writing** — A clean, calm interface that gets out of your way.
- **100% free** — No subscriptions, no feature gates, no ads. Ever.

## Features

### Rich Editor

Write the way you want — with headings, lists, checklists, code blocks, tables, images, quotes, dividers, and more. Formatting is as simple as selecting text or typing `/` to open the command palette.

- Drag and drop images directly into your notes
- Syntax-highlighted code blocks with 30+ languages
- Highlight, bold, italic, strikethrough, and colored text
- Find and replace with regex support

### Organize Your Way

Keep your notes tidy with **groups**, **pinned notes**, and **search**.

- Create custom groups and drag notes between them
- Pin important notes to the top
- Notes are automatically sorted by date — today, yesterday, last 7 days, and more
- Search by title to find anything instantly

### Markdown Import & Export

Bring your notes in, take them out. Scripta supports Markdown import and export, so you're never locked in.

### Typewriter Mode

Stay focused with **cursor centering** — the line you're writing always stays in the center of the screen, so you never have to look down.

### Smart Links

Paste a URL and Scripta automatically fetches the page title, turning an ugly link into a readable one.

### Customizable Toolbar

Show only the formatting buttons you use. Hide the rest. Reorder them however you like.

### Themes & Fonts

Switch between **light**, **dark**, or **system** themes. Choose from **1,900+ Google Fonts** to personalize your writing experience.

### Remembers Where You Left Off

Scripta remembers which note you had open, where you were scrolled to, and where your cursor was. Just pick up where you left off.

## Keyboard Shortcuts

|       Action       |        Shortcut         |
| ------------------ | ----------------------- |
| New note           | `Ctrl/Cmd + N`          |
| Search notes       | `Ctrl/Cmd + F`          |
| Zoom in / out      | `Ctrl/Cmd + Plus/Minus` |
| Toggle sidebar     | `Ctrl/Cmd + B`          |
| Export as Markdown | `Ctrl/Cmd + Shift + E`  |

## Installation

Download the latest version from the [Releases](https://github.com/j4rviscmd/Scripta/releases/latest) page.

|         Platform          |                                                           Download                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **macOS (Apple Silicon)** | [Scripta_macOS_arm64.dmg](https://github.com/j4rviscmd/Scripta/releases/latest/download/Scripta_macOS_arm64.dmg)             |
| **macOS (Intel)**         | [Scripta_macOS_x64.dmg](https://github.com/j4rviscmd/Scripta/releases/latest/download/Scripta_macOS_x64.dmg)                 |
| **Windows**               | [Scripta_Windows_x64-setup.exe](https://github.com/j4rviscmd/Scripta/releases/latest/download/Scripta_Windows_x64-setup.exe) |

> [!NOTE]
> macOS builds are not signed. On first launch, run:
>
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Scripta.app"
> ```

## Your Data, Your Control

All your notes are stored locally on your computer. Nothing is sent to any server.

- Notes are saved in your system's standard app data folder
- Images you add are stored alongside your notes
- Export any note to Markdown at any time

> [!TIP]
> Custom storage location support is coming in a future update.

<details>
<summary>Default data locations</summary>

- **macOS**: `~/Library/Application Support/com.scripta.app/`
- **Windows**: `%APPDATA%\com.scripta.app\`

</details>

## Contributing

Issues and PRs are welcome.

## License

MIT License — see [LICENSE](./LICENSE) for details.
