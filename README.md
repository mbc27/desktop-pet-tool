# 🐾 Desktop Pet Tool

A cross-platform (Windows/macOS) desktop floating pet widget built with **Electron** — integrates timer, keyboard counter, fun quotes, and a panic "boss is coming" button into a translucent always-on-top floating window.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![Electron](https://img.shields.io/badge/Electron-28-47848F)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

| Module | Description |
|--------|-------------|
| ⏱ **Stopwatch** | Counts up from a start point (HH:MM:SS) |
| ⏳ **Countdown** | Set a target time and watch it tick down |
| ⌨️ **Keystroke Counter** | Tracks total keypresses today, with reset |
| 💬 **Fun Quotes** | Random motivational quotes (custom interval, customizable list) |
| 📌 **Boss Key** | One-click `Win+D` (macOS: `Cmd+H`) — instantly show desktop |
| 🎬 **Video Player** | Embedded webview for Douyin / Kuaishou / Bilibili |
| 📝 **Sticky Note** | Quick note with auto-save |
| 🎚 **Opacity Control** | Adjustable window transparency |
| 🖱 **Click-Through** | Transparent regions pass clicks through to desktop |
| 📌 **Drag & Pin** | Drag the window anywhere; always-on-top |
| 🔁 **Auto Launch** | Start with the system |
| 🗑 **Clean Uninstall** | Removes all config & registry entries |

## 🖼 Screenshot

```
┌──────────────────────────────┐
│  🐾 Desktop Pet        —   ✕ │  ← drag handle + window controls
│ ──────────────────────────── │
│  📅 2026-08-17 Mon           │
│  🕐 12:34:56                  │
│  💡 "Take a break, you're awesome!" │
│ ──────────────────────────── │
│  ⏱ Stopwatch:  02:35:18      │
│  ⏳ Countdown:  01:20:45      │
│  ⌨️ Today: 1,234 keys        │
│  [▶ Start] [⏹ Stop] [↺ Reset]│
│  [📌 Boss is coming!]        │
│  ████████░░░░ Opacity 75%     │
└──────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- Windows 10+ or macOS 12+

### Install & Run

```bash
# Clone
git clone https://github.com/<your-username>/desktop-pet-tool.git
cd desktop-pet-tool

# Install dependencies
npm install

# Run in dev mode
npm start
```

### Build Installers

```bash
# Windows installer (.exe, NSIS)
npm run build:win

# macOS installer (.dmg)
npm run build:mac
```

Output goes to `build/`:
- `桌面宠物工具 Setup 1.0.0.exe` (Windows)
- `桌面宠物工具-1.0.0.dmg` (macOS)

## 🏗 Architecture

```
desktop-pet-tool/
├── main.js          # Electron main process
├── preload.js       # Context-isolated bridge
├── renderer.js      # UI logic
├── index.html       # Main window markup
├── src/
│   └── styles.css   # Styles
├── assets/          # Tray icon, app icon
└── package.json     # Config & build settings
```

### Core Techniques

#### 1. Transparent Floating Window
- `transparent: true`, `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`
- CSS `backdrop-filter: blur(12px)` for the glass effect

#### 2. Click-Through on Transparent Regions
The app uses a **main-process polling** approach to avoid the classic chicken-and-egg problem where the renderer can't toggle `setIgnoreMouseEvents` back when it's in ignore mode:

- Renderer reports the `.pet-container` bounding rect (in screen coordinates) to main via IPC
- Main process polls `screen.getCursorScreenPoint()` at ~30fps
- If the cursor is inside the rect → `setIgnoreMouseEvents(false)` (interactive)
- If outside → `setIgnoreMouseEvents(true, { forward: true })` (click-through)

This guarantees the drag handle is always draggable while transparent areas pass clicks to the desktop.

#### 3. Global Keystroke Counter
Uses [`uiohook-napi`](https://www.npmjs.com/package/uiohook-napi) for cross-platform global key listening, with graceful fallback if native module loading fails.

#### 4. Boss Key
- **Windows**: `powershell -Command "(New-Object -ComObject Shell.Application).ToggleDesktop()"`
- **macOS**: `osascript -e 'tell application "System Events" to keystroke "h" using command down'`

Also registered as a global shortcut (`Ctrl+Shift+D` by default).

#### 5. Embedded Video Player
Uses `<webview>` tag with:
- Per-platform User-Agent (Bilibili gets mobile UA, Douyin/Kuaishou get desktop UA)
- Injected CSS to hide non-video UI (headers, sidebars, download bars)
- Injected JS to unmute only the most-visible `<video>` and pause/mute the rest (prevents audio bleed when switching videos)
- Zoom factor for desktop UA pages (so Kuaishou/Douyin fit in the panel)
- Custom-scheme blocking (`bitbrowser://`, etc.) to prevent popup spam

## 📦 Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Electron 28 |
| Language | HTML / CSS / vanilla JS |
| Native key hook | uiohook-napi |
| Storage | electron-store |
| Builder | electron-builder (NSIS / DMG) |

## ⚙️ Configuration

All user data is stored via `electron-store` in `pet-data.json`:

```json
{
  "keyCount": { "2026-08-17": 1234 },
  "quotes": [],
  "countdownTarget": null,
  "opacity": 0.85,
  "autoQuoteInterval": 300000,
  "isAutoLaunch": false,
  "bossKeyShortcut": "CommandOrControl+Shift+D",
  "stickyNote": ""
}
```

## 🎮 Usage

- **Drag**: Grab the title bar (🐾 Desktop Pet) and drag anywhere
- **Minimize**: Click `—` to hide to tray
- **Quit**: Click `✕` to hide to tray (use tray menu → Quit to fully exit)
- **Tray**: Right-click tray icon for context menu (show/hide, reset counter, auto-launch, quit)
- **Boss Key**: Click the red 📌 button or press `Ctrl+Shift+D`

## 📝 License

MIT — see [LICENSE](LICENSE).

## 🤝 Acknowledgements

- [Electron](https://www.electronjs.org/)
- [electron-builder](https://www.electron.build/)
- [uiohook-napi](https://www.npmjs.com/package/uiohook-napi)
- [electron-store](https://github.com/sindresorhus/electron-store)
