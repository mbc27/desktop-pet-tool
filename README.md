# 🐾 桌面宠物工具

基于 **Electron** 构建的跨平台（Windows/macOS）桌面悬浮宠物小工具 —— 集计时器、键盘敲击统计、趣味语录和应急「老板来了」按钮于一体，以半透明置顶悬浮窗形态常驻桌面。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![Electron](https://img.shields.io/badge/Electron-28-47848F)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 功能列表

| 功能模块 | 描述 |
|---------|---------|
| ⏱ **正计时** | 从某一时刻开始累计计时（时:分:秒） |
| ⏳ **倒计时** | 设置目标时间，实时显示剩余时间 |
| ⌨️ **键盘敲击统计** | 实时统计当日键盘敲击总次数，支持重置 |
| 💬 **趣味语录** | 随机弹出预设或自定义的趣味语录（可设置间隔） |
| 📌 **老板来了** | 一键触发 `Win+D`（macOS：`Cmd+H`），瞬间返回桌面 |
| 🎬 **视频播放器** | 内嵌 webview，支持抖音 / 快手 / B站 |
| 📝 **便签** | 快速记事，自动保存 |
| 🎚 **透明度调节** | 窗口透明度可调（50%~100%） |
| 🖱 **鼠标穿透** | 透明区域可穿透点击到桌面 |
| 📌 **自由拖动** | 鼠标拖拽悬浮窗到任意位置，置顶显示 |
| 🔁 **开机自启** | 应用随系统启动自动运行 |
| 🔄 **自动更新** | 启动后自动检查 GitHub Releases 新版本，一键升级 |
| 🗑 **无残留卸载** | 卸载时清除所有配置文件、注册表项 |

## 🖼 界面示意

```
┌──────────────────────────────┐
│  🐾 桌面宠物          —   ✕ │  ← 拖动手柄 + 窗口控制
│ ──────────────────────────── │
│  📅 2026-08-17 周一           │
│  🕐 12:34:56                  │
│  💡 "代码写累了，休息一下~"     │
│ ──────────────────────────── │
│  ⏱ 正计时:  02:35:18         │
│  ⏳ 倒计时:  01:20:45         │
│  ⌨️ 今日敲击: 1,234 次        │
│  [▶ 开始] [⏹ 停止] [↺ 重置]  │
│  [📌 老板来了！]              │
│  ████████░░░░ 透明度 75%      │
└──────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- Windows 10+ 或 macOS 12+

### 安装运行

```bash
# 克隆仓库
git clone https://github.com/mbc27/desktop-pet-tool.git
cd desktop-pet-tool

# 安装依赖
npm install

# 开发模式运行
npm start
```

### 直接下载安装包

无需 clone 源码，可直接前往 [Releases 页面](https://github.com/mbc27/desktop-pet-tool/releases) 下载 `.exe` 安装程序：

- **Windows 安装包**：[desktop-pet-tool-setup-1.0.0.exe](https://github.com/mbc27/desktop-pet-tool/releases/download/v1.0.0/desktop-pet-tool-setup-1.0.0.exe)
- 双击即可安装，安装过程会自动创建桌面快捷方式和开始菜单项

### 打包构建

```bash
# Windows 安装包（.exe，NSIS）
npm run build:win

# macOS 安装包（.dmg）
npm run build:mac
```

构建产物输出到 `build/` 目录：
- `桌面宠物工具 Setup 1.0.0.exe`（Windows）
- `桌面宠物工具-1.0.0.dmg`（macOS）

## 🏗 项目结构

```
desktop-pet-tool/
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本（安全桥接）
├── renderer.js      # 渲染进程（UI 逻辑）
├── index.html       # 主界面
├── src/
│   └── styles.css   # 样式文件
├── assets/          # 托盘图标、应用图标
├── .github/
│   └── workflows/
│       └── release.yml  # 自动构建发布工作流
└── package.json     # 项目配置 & 构建配置
```

## 🔧 核心实现技术

### 1. 透明悬浮窗
- `transparent: true`、`frame: false`、`alwaysOnTop: true`、`skipTaskbar: true`
- CSS `backdrop-filter: blur(12px)` 实现毛玻璃效果

### 2. 透明区域鼠标穿透
应用采用 **主进程轮询** 方案，避开经典死锁问题（渲染层在 ignore 模式下收不到鼠标事件，无法切回）：

- 渲染层把 `.pet-container` 的屏幕坐标矩形通过 IPC 上报主进程
- 主进程每 33ms（约 30fps）调用 `screen.getCursorScreenPoint()` 做命中测试
- 鼠标在矩形内 → `setIgnoreMouseEvents(false)`（窗口可交互）
- 鼠标在矩形外 → `setIgnoreMouseEvents(true, { forward: true })`（点击穿透到下层）

这保证顶部导航栏始终可拖动，同时透明区域可点击到桌面/下层应用。

### 3. 全局键盘敲击统计
使用 [`uiohook-napi`](https://www.npmjs.com/package/uiohook-napi) 实现跨平台全局键盘监听，原生模块加载失败时优雅降级。

### 4. 「老板来了」按钮
- **Windows**：`powershell -Command "(New-Object -ComObject Shell.Application).ToggleDesktop()"`
- **macOS**：`osascript -e 'tell application "System Events" to keystroke "h" using command down'`

同时注册为全局快捷键（默认 `Ctrl+Shift+D`）。

### 5. 内嵌视频播放器
使用 `<webview>` 标签，配合以下处理：
- 按平台设置 User-Agent（B 站用移动端 UA，抖音/快手用桌面端 UA）
- 注入 CSS 隐藏非视频元素（顶栏、侧边栏、下载条）
- 注入 JS 只为最可见的 `<video>` 取消静音，其余暂停/静音（避免切换视频时声音残留）
- 桌面端 UA 页面设置缩放因子（让快手/抖音适配面板尺寸）
- 拦截自定义协议（`bitbrowser://` 等）避免弹窗骚扰

### 6. 自动更新（GitHub Releases）
- 使用 `electron-updater` 检查 GitHub Releases 上的 `latest.yml`
- 应用启动 10 秒后自动检查更新（开发模式下跳过）
- 发现新版本 → 弹窗确认 → 下载并显示进度 → 安装重启
- 渲染层可通过 `petAPI.checkForUpdates()` 手动触发检查

## 📦 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Electron 28 |
| 语言 | HTML / CSS / 原生 JS |
| 原生键盘钩子 | uiohook-napi |
| 数据持久化 | electron-store |
| 自动更新 | electron-updater |
| 打包构建 | electron-builder（NSIS / DMG） |
| CI/CD | GitHub Actions |

## ⚙️ 配置说明

所有用户数据通过 `electron-store` 存储在 `pet-data.json`：

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

## 🎮 使用说明

- **拖动窗口**：按住顶部标题栏（🐾 桌面宠物）拖到任意位置
- **最小化**：点击 `—` 隐藏到托盘
- **退出**：点击 `✕` 隐藏到托盘（通过托盘菜单 → 退出 才会完全退出）
- **托盘菜单**：右键托盘图标，可显示/隐藏、重置键盘计数、设置开机自启、退出
- **老板键**：点击红色 📌 按钮，或按全局快捷键 `Ctrl+Shift+D`

## 🔄 发版与自动更新

本项目通过 GitHub Actions 自动构建发布。发布新版本只需 4 步：

```bash
# 1. 修改 package.json 中的 version 字段（例如改为 "1.1.0"）

# 2. 提交改动
git add -A
git commit -m "Release v1.1.0 - 新增 XX 功能"

# 3. 打 tag
git tag -a v1.1.0 -m "Release v1.1.0 - 新增 XX 功能"

# 4. 推送 main 分支和 tag
git push origin main
git push origin v1.1.0    # ← 推送 tag 自动触发 build + 发布 Release
```

3~5 分钟后：
- [Releases 页面](https://github.com/mbc27/desktop-pet-tool/releases) 会出现新版本，含 `.exe` 安装包
- 老版本应用启动 10 秒后会自动弹窗「发现新版本 vX.Y.Z」，用户点「立即更新」即可一键升级

## 📝 许可证

MIT — 详见 [LICENSE](LICENSE)。

## 🤝 致谢

- [Electron](https://www.electronjs.org/)
- [electron-builder](https://www.electron.build/)
- [uiohook-napi](https://www.npmjs.com/package/uiohook-napi)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [electron-updater](https://www.electron.build/auto-update)
