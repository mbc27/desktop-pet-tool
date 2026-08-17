# 桌面宠物工具 — GitHub 部署与自动更新操作手册

> 本手册收录：项目上传 GitHub、通过 GitHub Actions 自动打包构建并发布 Release、以及应用内自动更新的完整操作流程、故障排查和常见问题。

---

## 📑 目录

- [一、项目结构与核心文件](#一项目结构与核心文件)
- [二、首次部署：代码上传 GitHub](#二首次部署代码上传-github)
- [三、CI/CD：GitHub Actions 自动构建与发布](#三cicdgithub-actions-自动构建与发布)
- [四、打包构建：本地与 CI 环境](#四打包构建本地与-ci-环境)
- [五、自动更新：electron-updater 工作原理](#五自动更新electron-updater-工作原理)
- [六、发布新版本：标准 4 步流程](#六发布新版本标准-4-步流程)
- [七、常见故障排查](#七常见故障排查)
- [八、常用命令速查表](#八常用命令速查表)
- [九、关键链接汇总](#九关键链接汇总)

---

## 一、项目结构与核心文件

```
桌面宠物工具/
├── main.js                      # Electron 主进程（窗口、托盘、自动更新、键盘钩子等）
├── preload.js                   # 安全桥接（暴露 petAPI.* 方法到渲染层）
├── renderer.js                  # 渲染进程（UI 逻辑、窗口调整、交互区域上报）
├── index.html                   # 主界面 DOM
├── src/styles.css               # 样式（毛玻璃、拖动手柄、透明背景等）
├── assets/                      # 应用图标、托盘图标
│   ├── icon.png
│   └── tray-icon.png
├── generate-icon.js             # 图标生成脚本
├── package.json                 # ⭐ 版本号、依赖、打包、publish 配置
├── package-lock.json            # 依赖锁定（CI 必须用 npm ci）
├── README.md                    # 中文说明文档
├── .gitignore                   # 忽略 node_modules/、build/ 等
│
└── .github/
    └── workflows/
        └── release.yml          # ⭐ GitHub Actions 工作流（打 tag 自动构建发布）
```

**最常改动的 3 个文件**：

| 文件 | 改什么 | 什么时候改 |
|------|--------|----------|
| [package.json](file:///d:/Trae-AI/Project/桌面宠物工具/package.json) | `version` 字段、依赖、`build.*` 配置 | 每次发版必须改 version；加功能时加依赖 |
| [.github/workflows/release.yml](file:///d:/Trae-AI/Project/桌面宠物工具/.github/workflows/release.yml) | 构建平台、步骤、上传方式 | 需要改构建流程时才改 |
| [main.js](file:///d:/Trae-AI/Project/桌面宠物工具/main.js#L16-L104) | 自动更新行为（弹窗时机、进度条） | 要改 UX 时 |

---

## 二、首次部署：代码上传 GitHub

### 2.1 准备工作

```powershell
# 1. 检查 git 是否已配置
git config --global user.name     # 输出用户名
git config --global user.email    # 输出邮箱

# 2. 如果没有配置
git config --global user.name "你的用户名"
git config --global user.email "你的邮箱"

# 3. 检查 git 可用
git --version    # 需要 ≥ 2.x
```

### 2.2 创建本地 git 仓库（首次）

```powershell
cd d:\Trae-AI\Project\桌面宠物工具

# 初始化（默认分支 main）
git init -b main

# ⚠️ Windows 大小写敏感问题：在 README.md / readme.md 混用前关掉
git config core.ignorecase false

# 编写 .gitignore（必须包含以下条目）
#   node_modules/
#   build/
#   dist/
#   .eb-cache/
#   *.exe
#   node.exe（如果存在于错误目录）
#   测试脚本 test-uiohook.js 等

# 暂存所有文件
git add -A

# 查看将提交的文件（确保没有 node_modules / build 等大目录）
git status --short
```

### 2.3 首次提交

```powershell
git commit -m "Initial commit: 桌面宠物工具

- 正计时、倒计时
- 全局键盘敲击统计
- 趣味语录
- 老板键（Win+D）
- 内嵌视频播放器
- 便签
- 透明度调节、鼠标穿透、开机自启
- 主进程级穿透检测（screen.getCursorScreenPoint 轮询）
- electron-updater 自动更新
- GitHub Actions 自动构建 Release"
```

### 2.4 在 GitHub 网页创建空仓库

1. 打开 https://github.com/new
2. **Repository name**：`desktop-pet-tool`（或你喜欢的名字）
3. **Description**：`桌面悬浮宠物工具 - 集计时器、键盘统计、语录、老板键、视频播放器、便签于一体的 Electron 应用`
4. **Visibility**：Public / Private 自选
5. ⚠️ **3 个勾都不要选**：
   - ❌ Add a README file
   - ❌ Add .gitignore
   - ❌ Choose a license
6. 点击 **Create repository**

### 2.5 关联远程并推送

```powershell
cd d:\Trae-AI\Project\桌面宠物工具

# 添加远程 origin
git remote add origin https://github.com/<你的GitHub用户名>/desktop-pet-tool.git

# 验证
git remote -v
# 输出示例：
# origin  https://github.com/mbc27/desktop-pet-tool.git (fetch)
# origin  https://github.com/mbc27/desktop-pet-tool.git (push)

# 首次推送 main 分支（-u 建立追踪关系，之后直接 git push 即可）
git push -u origin main
```

首次推送 Windows 会弹出 **Git Credential Manager** 窗口，用你的 GitHub 账号登录授权，凭据会被缓存。

---

## 三、CI/CD：GitHub Actions 自动构建与发布

### 3.1 工作流文件位置

[release.yml](file:///d:/Trae-AI/Project/桌面宠物工具/.github/workflows/release.yml) —— **只要仓库里有这个文件，并且推一个 `v*` 开头的 tag，就会自动构建并发布 Release。**

### 3.2 工作流原理（逐步拆解）

```
触发条件：push 了以 v 开头的 tag（如 v1.0.0、v1.2.3）
┌─────────────────────────────────────────────────┐
│ Job: Build Windows Installer @ windows-latest    │
│  ┌─────────────────────────────────────────────┐ │
│  │ 1. actions/checkout@v4                      │ │  拉取代码
│  ├─────────────────────────────────────────────┤ │
│  │ 2. actions/setup-node@v4                    │ │  Node.js 20 + 缓存 package-lock.json
│  ├─────────────────────────────────────────────┤ │
│  │ 3. npm ci                                   │ │  严格按 package-lock 安装依赖
│  ├─────────────────────────────────────────────┤ │
│  │ 4. npm run build:win                        │ │  electron-builder --win 打包
│  │    环境变量 GH_TOKEN = ${{ secrets.GITHUB_  │ │  ⚠️ 必须用 GH_TOKEN！不是 GITHUB_TOKEN
│  │                    TOKEN }}                 │ │
│  ├─────────────────────────────────────────────┤ │
│  │ 5. pwsh: Get-ChildItem build -Recurse       │ │  调试：列出构建产物
│  ├─────────────────────────────────────────────┤ │
│  │ 6. softprops/action-gh-release@v2           │ │  ⭐ 双保险：强制上传到 Release
│  │    files: build/*.exe, *.blockmap,          │ │  - desktop-pet-tool-setup-*.exe
│  │           latest*.yml                       │ │  - .blockmap（增量包）
│  │                                              │ │  - latest.yml（更新清单）
│  ├─────────────────────────────────────────────┤ │
│  │ 7. actions/upload-artifact@v4 (fallback)    │ │  额外上传 artifact（失败时也能拿到）
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 3.3 为什么用两个上传机制（双保险）

| 机制 | 优点 | 缺点 |
|------|------|------|
| **electron-builder 自带 publish** | 自动生成 `latest.yml`，字段齐全，供 electron-updater 解析 | 对环境变量名**敏感**，必须用 `GH_TOKEN`，错名会静默失败 |
| **softprops/action-gh-release** | 按 glob 模式扫文件上传，绝对不丢，与 build 过程解耦 | 不会自动修正 `latest.yml` 的细节 |

**结论**：两者一起用——electron-builder 生成规范文件，action-gh-release 兜底确保 `.exe` 一定会出现在 Release 的 Assets 列表。

### 3.4 ⚠️ 常见踩坑 1：环境变量名

| ❌ 错误（.exe 不上传） | ✅ 正确 |
|---|---|
| `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` | `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` |

**原因**：electron-builder 的 GitHub publish provider 读取的是 `GH_TOKEN`（或 `GH_TOKEN_` 前缀、`GITHUB_ACCESS_TOKEN`），不读标准的 `GITHUB_TOKEN`。

### 3.5 ⚠️ 常见踩坑 2：tag 删除再重建

- **删除同名远程 tag 再重新打 tag**：GitHub **可能不会**为同一个 tag 名重新触发 Actions（因为 run_id 基于 tag 时间戳等条件）
- **建议**：
  - 每次发版用递增的版本号（v1.0.0 → v1.0.1 → v1.1.0），永远不重建老 tag
  - 若真的要重跑，去 Actions 页面点击 **Re-run all jobs**，或使用 `workflow_dispatch` 手动触发

### 3.6 手动触发（可选扩展）

如果要支持在 Actions 页面手动点按钮触发 build，在 `release.yml` 顶部加：

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:      # ← 加这一行，Actions 页面会出现 "Run workflow" 按钮
```

---

## 四、打包构建：本地与 CI 环境

### 4.1 本地打包（调试用）

```powershell
cd d:\Trae-AI\Project\桌面宠物工具

# 先确保依赖安装完成
npm install

# 构建 Windows 安装包（输出到 build/）
npm run build:win

# 构建完成后查看
Get-ChildItem build | Select-Object Name, Length
# 输出中应该有：
#   desktop-pet-tool-setup-1.0.0.exe
#   desktop-pet-tool-setup-1.0.0.exe.blockmap
#   latest.yml
```

### 4.2 本地构建后**手动发布** Release（不用 Actions）

若 CI 不可用，也可本地上传：

```powershell
# 1. 用 --publish always 本地上传到 GitHub Release
#    需要 GH_TOKEN 环境变量
$env:GH_TOKEN = "ghp_你的PersonalAccessToken"
npm run build:release
```

### 4.3 CI 构建（推荐）

无需本地 Node 环境，**推送 tag 即可**。详细流程见第六章。

### 4.4 electron-builder 关键配置（package.json）

```json
{
  "build": {
    "appId": "com.desktoppet.tool",
    "productName": "桌面宠物工具",
    "directories": { "output": "build" },
    "publish": {
      "provider": "github",
      "owner": "mbc27",                // ⭐ 改成你的 GitHub 用户名
      "repo": "desktop-pet-tool",       // ⭐ 改成你的仓库名
      "private": false
    },
    "win": {
      "target": ["nsis"],
      "icon": "assets/icon.png"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "deleteAppDataOnUninstall": true // ⭐ 卸载时清空配置
    }
  }
}
```

⚠️ `publish.owner` 和 `publish.repo` **必须和实际仓库匹配**，否则 electron-updater 检查更新会 404。

---

## 五、自动更新：electron-updater 工作原理

### 5.1 技术栈

| 组件 | 作用 | 版本 |
|------|------|------|
| `electron-updater` | 应用内检查更新、下载、安装 | ^6.1.8 |
| GitHub Releases | 存放新版本 .exe + latest.yml | — |
| `latest.yml` | 更新清单（版本号、URL、SHA512 校验） | 由 electron-builder 生成 |

### 5.2 关键代码位置

- 主进程：[main.js:6-104](file:///d:/Trae-AI/Project/桌面宠物工具/main.js#L6-L104) `setupAutoUpdater()`
- preload：[preload.js:51-52](file:///d:/Trae-AI/Project/桌面宠物工具/preload.js#L51-L52) `checkForUpdates` API
- 触发点：[main.js:652-653](file:///d:/Trae-AI/Project/桌面宠物工具/main.js#L652-L653) `app.whenReady()` 里调用

### 5.3 自动更新流程图

```
用户打开桌面宠物工具（已打包 .exe）
│
├─ 10 秒后 → autoUpdater.checkForUpdates()
│   （开发模式 npm start 会跳过，用 app.isPackaged 判断）
│
├─ 请求 https://github.com/.../releases/latest/download/latest.yml
│
├─ 比较版本号：
│   ├─ latest.yml 中的 version == 本地 app.getVersion()  →  "已是最新版本"，无弹窗
│   └─ latest.yml 中的 version  > 本地版本               →  ↓ 弹出对话框
│
├─ 对话框：「桌面宠物工具 vX.Y.Z 已发布，是否现在下载并安装更新？」
│   ├─ 点「稍后再说」 → 啥也不做，下次启动再问
│   └─ 点「立即更新」 →  autoUpdater.downloadUpdate()
│
├─ 下载中：
│   ├─ 监听 download-progress
│   ├─ 任务栏图标显示进度条 mainWindow.setProgressBar(pct/100)
│
├─ 下载完成 update-downloaded
│   ├─ 进度条重置
│   ├─ 对话框「新版本已下载完成，立即安装 / 稍后安装」
│   ├─ 立即安装 →  isQuitting = true; autoUpdater.quitAndInstall(false, true)
│                  （退出应用 → 启动安装程序 → 自动覆盖安装）
│   └─ 稍后安装 →  下次退出应用时自动安装（autoInstallOnAppQuit = true）
```

### 5.4 latest.yml 格式（供排查）

```yaml
version: 1.0.0
files:
  - url: desktop-pet-tool-setup-1.0.0.exe
    sha512: xxxxx...
    size: 77290936
path: desktop-pet-tool-setup-1.0.0.exe
sha512: xxxxx...
releaseDate: '2026-08-17T13:22:41.000Z'
```

### 5.5 开发模式下调试自动更新

`app.isPackaged` 在 `npm start` 时为 `false`，所以会打印「开发模式下跳过自动更新检查」。

要调试更新逻辑，可以把检查临时注释掉：

```javascript
// setupAutoUpdater 里的 setTimeout 内：
// if (!app.isPackaged) { ... }  ← 临时注释这行
```

但不建议长期修改。

---

## 六、发布新版本：标准 4 步流程

### 流程图示

```
┌──────────────┐
│ Step 1       │  改 package.json → version
└──────┬───────┘
       ▼
┌──────────────┐
│ Step 2       │  git add -A && git commit -m "Release vX.Y.Z ..."
└──────┬───────┘
       ▼
┌──────────────┐
│ Step 3       │  git tag -a vX.Y.Z -m "Release vX.Y.Z ..."
└──────┬───────┘
       ▼
┌──────────────┐
│ Step 4       │  git push origin main
│              │  git push origin vX.Y.Z  ← 触发 Actions
└──────┬───────┘
       ▼
┌──────────────┐
│ 等待 3~10 分钟 │  Actions 构建 Windows 安装包
└──────┬───────┘
       ▼
   ✅ Release vX.Y.Z 发布成功
   → 用户打开应用自动弹窗升级
   → Release 页面下载新 .exe
```

### 具体命令（可直接复制）

**示例：从 v1.0.0 升到 v1.1.0**

```powershell
cd d:\Trae-AI\Project\桌面宠物工具

# ===== Step 1: 改版本号 =====
# 手动打开 package.json，把第 3 行改成：
#   "version": "1.1.0",

# ===== Step 2: 提交 =====
git add -A
git status --short          # 确认只改了 package.json 和你实际改动的文件
git commit -m "Release v1.1.0 - 新增 XX 功能

Changelog:
- 新增 / 修复 XXX 功能
- 优化 YYY 性能
- 修复 ZZZ 问题"

# ===== Step 3: 打 tag（必须带前缀 v，版本号要与 package.json 完全一致） =====
git tag -a v1.1.0 -m "Release v1.1.0 - 新增 XX 功能

Changelog:
- 新增 / 修复 XXX 功能
- 优化 YYY 性能
- 修复 ZZZ 问题"

# 查看 tag
git tag -l

# ===== Step 4: 推送 =====
git push origin main           # 先推代码
git push origin v1.1.0         # ⭐ 推 tag！这一行触发 Actions 构建 + 发布
```

### 版本号建议（语义化 SemVer）

```
主版本号.次版本号.修订号
  └─ 不兼容改动    └─ 向下兼容新功能 └─ 向下兼容 bug 修复

示例：
  1.0.0 → 1.0.1   （修 bug）
  1.0.1 → 1.1.0   （加新功能，保留旧接口）
  1.1.0 → 2.0.0   （破坏性改动，如配置格式变化）
```

### ⚠️ 发布后验证

推送 tag 后，立即打开以下链接确认：

| 检查项目 | 链接 | 期望状态 |
|---------|------|---------|
| Actions 构建进度 | https://github.com/mbc27/desktop-pet-tool/actions | 有绿色 ✅ 的 "Release Build" run 正在运行或已完成 |
| Release 列表 | https://github.com/mbc27/desktop-pet-tool/releases | vX.Y.Z 出现，Assets 里有 3 个文件：`.exe`、`.exe.blockmap`、`latest.yml` |
| 可下载的 .exe | Releases → Assets 里的第一个链接 | 点进去能下载 70~80MB 的安装包 |

---

## 七、常见故障排查

### ❌ 问题 1：Release 里只有源码 zip/tar.gz，没有 .exe

**现象**：Releases 页面只有 `Source code (zip)` 和 `Source code (tar.gz)` 两个文件。

**原因按概率从高到低**：

| 序号 | 原因 | 解决 |
|------|------|------|
| 1 | 环境变量写错（`GITHUB_TOKEN` 而非 `GH_TOKEN`） | 改 release.yml：`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`，重新打 tag |
| 2 | Actions 运行失败了 | 去 Actions 页面点进 run → 找红叉的 step → 看日志 |
| 3 | electron-builder 因为 rcedit / nsis-resources 网络超时下载失败 | 多等几秒重试；或用缓存参考历史命令 |
| 4 | `package.json` 的 `publish.owner/repo` 与实际仓库不符 | 修正为真实的 owner/repo |
| 5 | 目录里没有 `.github/workflows/release.yml` | 加入并推送 |

**修复**：改完代码后，重新提交并打新 tag（或在 Actions 点 Re-run）。

---

### ❌ 问题 2：打 tag 后 Actions 不触发

**原因**：
- 用了"删除 tag → 重建同名 tag"的模式，GitHub 对同一 tag 的短时间内重复创建可能不重新 run
- workflow 文件里 `on.push.tags` 的表达式写错（比如没加引号）

**解决**：
```powershell
# 打一个新的、从来没存在过的 tag（推荐）
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

或打开 Actions 页面 → Release Build → **Run workflow**（需要 workflow_dispatch 已开启）。

---

### ❌ 问题 3：自动更新弹窗不出现

**现象**：明明发了新版本，老版本用户打开应用却没提示更新。

**排查步骤**：

```
1) 是否是打包后的应用（.exe 安装的）？
   → npm start（开发模式）不会触发，setupAutoUpdater 用 app.isPackaged 跳过了
   → 必须双击安装后的 exe 启动

2) 等够 10 秒了吗？
   → 启动 10 秒后才 checkForUpdates()，避免干扰启动
   → 或者通过渲染层 IPC 手动触发：petAPI.checkForUpdates()

3) latest.yml 能被访问吗？
   → 直接访问：
      https://github.com/<owner>/<repo>/releases/latest/download/latest.yml
   → 必须能下载到 yaml 文本，且 version 高于本地
   → 如果是 404，说明 package.json 的 publish.owner/repo 写错了

4) latest.yml 里的 version 确实 > 本地 app.getVersion()？
   → 本地 1.0.0，server 1.0.0 → 不会弹
   → 本地 1.0.0，server 1.0.1 → 会弹

5) 网络是否允许访问 GitHub？
   → 有防火墙、公司网络、代理可能导致请求被挡
```

---

### ❌ 问题 4：push 时 `Connection was reset`

**原因**：网络抖动。

**解决**：
```powershell
Start-Sleep -Seconds 3
git push origin main
```
重试 2~3 次一般就过了。如果长期不稳定，考虑配置 SSH 代理或改用 HTTPS + 凭据管理器。

---

### ❌ 问题 5：`warning: LF will be replaced by CRLF`

**原因**：Git 默认换行符自动转换，不影响功能。

**解决**（可选）：
```powershell
# 提交时全部自动转 LF，检出时保留平台换行
git config --global core.autocrlf true
```

---

### ❌ 问题 6：npm install 失败（uiohook-napi 预编译二进制下载慢）

**原因**：uiohook-napi 有 native 模块，国内网络下载 GitHub Release 上的 prebuilt 慢。

**解决**：
```powershell
# 用国内镜像（可选）
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
```

---

## 八、常用命令速查表

### Git 基础

| 命令 | 作用 |
|------|------|
| `git status --short` | 查看改动 |
| `git add -A` | 暂存所有 |
| `git commit -m "xxx"` | 提交 |
| `git log --oneline -5` | 最近 5 条提交 |
| `git push origin main` | 推 main 分支 |
| `git tag -l` | 列所有 tag |
| `git tag -d v1.0.0` | 删本地 tag |
| `git push origin :refs/tags/v1.0.0` | 删远程 tag |

### 发版 4 步（复制粘贴用）

```powershell
# 1. 手动改 package.json → "version": "X.Y.Z"
git add -A
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

### 构建

| 命令 | 作用 |
|------|------|
| `npm start` | 开发模式运行 |
| `npm run build:win` | 本地打 Windows 安装包（不发布） |
| `npm run build:release` | 本地打包并上传 Release（需要 GH_TOKEN） |
| `npm run build:mac` | 本地打 macOS DMG（必须在 macOS 上跑） |

### 验证构建产物

```powershell
# Windows
Get-ChildItem build | Select-Object Name, Length

# 期望的 3 个关键文件：
# desktop-pet-tool-setup-X.Y.Z.exe       ~73 MB
# desktop-pet-tool-setup-X.Y.Z.exe.blockmap  ~80 KB
# latest.yml                              ~几百字节
```

---

## 九、关键链接汇总

| 项目 | 链接 |
|------|------|
| 代码仓库（main 分支） | https://github.com/mbc27/desktop-pet-tool |
| Actions 构建列表 | https://github.com/mbc27/desktop-pet-tool/actions |
| Release 发布列表 | https://github.com/mbc27/desktop-pet-tool/releases |
| v1.0.0 Release 页面 | https://github.com/mbc27/desktop-pet-tool/releases/tag/v1.0.0 |
| v1.0.0 安装包（直链） | https://github.com/mbc27/desktop-pet-tool/releases/download/v1.0.0/desktop-pet-tool-setup-1.0.0.exe |
| latest.yml（更新清单） | https://github.com/mbc27/desktop-pet-tool/releases/latest/download/latest.yml |
| 创建新的 GitHub Token | https://github.com/settings/tokens（选 repo 权限） |
| Actions Run 历史 API | https://api.github.com/repos/mbc27/desktop-pet-tool/actions/runs?per_page=5 |
| latest Release API | https://api.github.com/repos/mbc27/desktop-pet-tool/releases/latest |

---

## 十、附录：核心配置清单（发版前 Review 用）

### ✅ 必查项目（每次发版前过一遍）

- [ ] `package.json` → `version` 已递增
- [ ] `package.json` → `build.publish.owner` 是正确的 GitHub 用户名
- [ ] `package.json` → `build.publish.repo` 是正确的仓库名
- [ ] `.github/workflows/release.yml` → 存在于 `.github/workflows/` 下
- [ ] `release.yml` → `env.GH_TOKEN = ${{ secrets.GITHUB_TOKEN }}`（变量名是 GH_TOKEN）
- [ ] `release.yml` → 有 `softprops/action-gh-release@v2` 兜底上传 `.exe`
- [ ] `.gitignore` → 包含 `node_modules/`、`build/`、`.eb-cache/`
- [ ] `package-lock.json` 已提交（Actions 用 `npm ci`，必须有它）
- [ ] Tag 名带 `v` 前缀（如 `v1.1.0`），版本号与 `package.json` 完全一致
- [ ] 推送了 `git push origin vX.Y.Z`（tag 也要推！只推 main 不触发）

把以上 10 条过一遍，99% 的发版问题都能提前规避。

---

> 📌 **本手册版本**：v1.0
> 📅 **生成日期**：2026-08-17
> 💡 **建议**：把本文件保存到项目根目录，命名为 `DEPLOY-HANDBOOK.md`，方便随时查阅。
