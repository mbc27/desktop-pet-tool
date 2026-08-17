// Electron 主进程 - 桌面宠物工具
const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage, shell, screen, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// ===== 自动更新（GitHub Releases） =====
const { autoUpdater } = (() => {
    try {
        return require('electron-updater');
    } catch (e) {
        console.warn('electron-updater 加载失败，自动更新功能不可用:', e.message);
        return { autoUpdater: null };
    }
})();

// 标记是否是手动触发的检查（手动检查时即使"无更新"也提示）
let _isManualCheck = false;
// 下载进度窗口（独立 BrowserWindow）
let downloadProgressWindow = null;

// 显示下载进度窗口
function showDownloadProgressWindow() {
    if (downloadProgressWindow && !downloadProgressWindow.isDestroyed()) {
        downloadProgressWindow.show();
        downloadProgressWindow.focus();
        return;
    }
    downloadProgressWindow = new BrowserWindow({
        width: 420,
        height: 200,
        parent: mainWindow,
        modal: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        alwaysOnTop: true,
        title: '正在下载更新',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>正在下载更新</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; padding: 24px; margin: 0; background: #f7f7f9; color: #333; text-align: center; }
h2 { margin: 0 0 18px; font-size: 17px; font-weight: 600; color: #1f1f1f; }
.progress-bar { width: 100%; height: 22px; background: #e2e2e8; border-radius: 11px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.06); }
.progress-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #66BB6A); width: 0%; transition: width 0.3s ease; border-radius: 11px; }
.progress-text { margin-top: 12px; font-size: 13px; color: #555; line-height: 1.6; }
.progress-percent { font-size: 22px; font-weight: 600; color: #4CAF50; margin-bottom: 6px; }
.hint { margin-top: 12px; font-size: 11px; color: #999; }
</style>
</head>
<body>
<h2>桌面宠物工具 - 正在下载更新</h2>
<div class="progress-percent" id="percent">0%</div>
<div class="progress-bar"><div class="progress-fill" id="fill"></div></div>
<div class="progress-text" id="text">准备中...</div>
<div class="hint">下载完成后将自动弹窗提示安装</div>
<script>
function updateProgress(pct, transferred, total, bps) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    document.getElementById('fill').style.width = pct + '%';
    document.getElementById('percent').textContent = pct + '%';
    var dMB = (transferred / 1048576).toFixed(1);
    var tMB = (total / 1048576).toFixed(1);
    var sMB = (bps / 1048576).toFixed(2);
    document.getElementById('text').textContent = dMB + ' / ' + tMB + ' MB  ·  ' + sMB + ' MB/s';
}
</script>
</body>
</html>`;
    downloadProgressWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    downloadProgressWindow.on('closed', () => {
        downloadProgressWindow = null;
    });
}

// 关闭下载进度窗口
function closeDownloadProgressWindow() {
    if (downloadProgressWindow && !downloadProgressWindow.isDestroyed()) {
        try { downloadProgressWindow.close(); } catch (e) {}
    }
    downloadProgressWindow = null;
}

function setupAutoUpdater() {
    if (!autoUpdater) return;

    try {
        autoUpdater.autoDownload = false;           // 不后台静默下载，由用户确认
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.allowDowngrade = false;
        autoUpdater.allowPrerelease = false;

        autoUpdater.on('error', (err) => {
            const msg = err && err.message ? err.message : String(err);
            console.error('[AutoUpdater] error:', msg);
            closeDownloadProgressWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(-1);
            }
            try {
                dialog.showErrorBox(
                    '更新失败',
                    `更新过程出错：\n${msg}\n\n常见原因：\n1. 网络无法访问 github.com 或下载被中断\n2. 防火墙/代理拦截\n3. 仓库未发布 Release 或 .exe 损坏`
                );
            } catch (e) {}
        });

        autoUpdater.on('update-available', (info) => {
            const skipped = store.get('skippedUpdateVersion');
            const isManual = _isManualCheck;
            _isManualCheck = false;
            // 自动检查时：如果用户已跳过此版本，则不再弹窗
            if (!isManual && skipped && skipped === info.version) {
                console.log('[AutoUpdater] 用户已跳过版本', info.version, '本会话不再提醒');
                return;
            }
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                mainWindow.show();
            }
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '发现新版本',
                message: `桌面宠物工具 v${info.version} 已发布`,
                detail: `当前版本：v${app.getVersion()}\n是否现在下载并安装更新？`,
                buttons: ['立即更新', '稍后再说'],
                defaultId: 0,
                cancelId: 1
            }).then(({ response }) => {
                if (response === 0 && autoUpdater) {
                    // 用户选择立即更新：先显示下载进度窗口，再开始下载
                    showDownloadProgressWindow();
                    autoUpdater.downloadUpdate().catch((e) => {
                        closeDownloadProgressWindow();
                        dialog.showErrorBox('下载失败', '无法开始下载：' + (e && e.message ? e.message : String(e)));
                    });
                } else if (response === 1) {
                    // 用户选择"稍后再说"：记录跳过的版本号，本版本不再提醒
                    store.set('skippedUpdateVersion', info.version);
                    console.log('[AutoUpdater] 用户跳过版本', info.version, '已记录，本版本不再自动提醒');
                }
            }).catch(() => {});
        });

        autoUpdater.on('update-not-available', (info) => {
            console.log('[AutoUpdater] 当前已是最新版本', info && info.version);
            // 仅在手动检查时弹窗提示，避免每次启动都打扰
            if (_isManualCheck) {
                _isManualCheck = false;
                try {
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: '已是最新版本',
                        message: '桌面宠物工具 已是最新版本',
                        detail: `当前版本：v${app.getVersion()}`,
                        buttons: ['好的'],
                        defaultId: 0
                    }).catch(() => {});
                } catch (e) {}
            }
        });

        autoUpdater.on('download-progress', (progress) => {
            const pct = progress.percent || 0;
            const transferred = progress.transferred || 0;
            const total = progress.total || 0;
            const bps = progress.bytesPerSecond || 0;
            // 更新独立进度窗口
            if (downloadProgressWindow && !downloadProgressWindow.isDestroyed()) {
                downloadProgressWindow.webContents.executeJavaScript(
                    `updateProgress(${pct}, ${transferred}, ${total}, ${bps})`
                ).catch(() => {});
            }
            // 同时设置任务栏进度（虽然 skipTaskbar，但保留无副作用）
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(Math.round(pct) / 100);
            }
        });

        autoUpdater.on('update-downloaded', () => {
            // 下载完成：关闭进度窗口
            closeDownloadProgressWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(-1);
            }
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '更新下载完成',
                message: '新版本已下载完成',
                detail: '点击「立即安装」将退出并安装更新。',
                buttons: ['立即安装', '稍后安装'],
                defaultId: 0,
                cancelId: 1
            }).then(({ response }) => {
                if (response === 0) {
                    isQuitting = true;
                    autoUpdater.quitAndInstall(false, true);
                }
            }).catch(() => {});
        });

        // 应用启动 10 秒后自动检查一次更新（避免干扰启动流程）
        setTimeout(() => {
            if (!app.isPackaged) {
                console.log('[AutoUpdater] 开发模式下跳过自动更新检查');
                return;
            }
            try {
                _isManualCheck = false;
                autoUpdater.checkForUpdates().catch(e => {
                    console.warn('[AutoUpdater] 自动检查失败:', e.message);
                });
            } catch (e) {
                console.warn('[AutoUpdater] 检查更新失败:', e.message);
            }
        }, 10000);

        // IPC：用户手动检查更新（来自渲染层调用）
        ipcMain.handle('check-for-updates', async () => {
            if (!autoUpdater || !app.isPackaged) {
                return { ok: false, message: '当前环境不支持自动更新' };
            }
            try {
                _isManualCheck = true;
                await autoUpdater.checkForUpdates();
                return { ok: true };
            } catch (e) {
                _isManualCheck = false;
                return { ok: false, message: e.message || String(e) };
            }
        });
    } catch (e) {
        console.warn('[AutoUpdater] 初始化失败:', e.message);
    }
}

// 托盘菜单触发的"手动检查更新"
function manualCheckForUpdates() {
    if (!autoUpdater || !app.isPackaged) {
        try {
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: '不支持自动更新',
                message: '当前环境不支持自动更新',
                detail: '可能是开发模式运行（npm start），或 electron-updater 模块加载失败。\n请前往 GitHub Release 页面手动下载：\nhttps://github.com/mbc27/desktop-pet-tool/releases',
                buttons: ['打开 Release 页面', '关闭'],
                defaultId: 0
            }).then(({ response }) => {
                if (response === 0) {
                    shell.openExternal('https://github.com/mbc27/desktop-pet-tool/releases');
                }
            }).catch(() => {});
        } catch (e) {}
        return;
    }
    // 标记为手动检查，update-not-available 时会弹窗提示"已是最新版本"
    _isManualCheck = true;
    // 弹窗告知用户在检查中
    try {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '检查更新',
            message: '正在检查更新...',
            detail: `当前版本：v${app.getVersion()}\n正在连接 GitHub 检查最新版本`,
            buttons: ['好的']
        }).catch(() => {});
    } catch (e) {}
    // 触发检查
    try {
        autoUpdater.checkForUpdates().catch(e => {
            _isManualCheck = false;
            console.warn('[AutoUpdater] 手动检查失败:', e.message);
        });
    } catch (e) {
        _isManualCheck = false;
        console.warn('[AutoUpdater] 手动检查失败:', e.message);
    }
}

// ===== 单实例锁：防止任务栏出现多个实例 =====
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    app.quit();
}
app.on('second-instance', () => {
    // 第二个实例启动时，把已存在的主窗口显示出来
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }
});

// 数据持久化
const Store = require('electron-store');
const store = new Store({
    name: 'pet-data',
    defaults: {
        keyCount: {},
        quotes: [],
        countdownTarget: null,
        opacity: 0.85,
        autoQuoteInterval: 300000,
        isAutoLaunch: false,
        bossKeyShortcut: 'CommandOrControl+Shift+D',
        stickyNote: '',
        skippedUpdateVersion: null   // 用户点击"稍后再说"时记录的版本号，本版本不再提醒
    }
});

// 全局键盘监听（使用 uiohook-napi，可优雅降级）
const { uIOhook } = (() => {
    try {
        return require('uiohook-napi');
    } catch (e) {
        console.warn('uiohook-napi 加载失败，键盘统计功能不可用:', e.message);
        return { uIOhook: null };
    }
})();
let uiohookStarted = false;

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 当日键计数 key
function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getKeyCountToday() {
    const keyCountMap = store.get('keyCount') || {};
    return keyCountMap[getTodayKey()] || 0;
}

function setKeyCountToday(count) {
    const keyCountMap = store.get('keyCount') || {};
    keyCountMap[getTodayKey()] = count;
    store.set('keyCount', keyCountMap);
}

// 创建透明悬浮窗
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 280,
        height: 420,
        x: 100,
        y: 100,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        focusable: true,
        acceptFirstMouse: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            nativeWindowOpen: false
        }
    });

    // 拦截webview/外部链接：阻止自定义scheme(如bitbrowser://)弹窗，允许普通http(s)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const u = new URL(url);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                // https链接：在系统默认浏览器打开，避免在应用里弹新窗
                shell.openExternal(url);
            }
        } catch (e) {}
        // 拒绝应用内部弹窗
        return { action: 'deny' };
    });

    mainWindow.loadFile('index.html');

    // 设置初始透明度
    const opacity = store.get('opacity');
    mainWindow.setOpacity(opacity);

    // 在所有工作区可见（macOS）
    if (mainWindow.setVisibleOnAllWorkspaces) {
        mainWindow.setVisibleOnAllWorkspaces(true);
    }

    // ===== 解决点击外部无响应：使用 screen 层级（桌面小部件层级）不干扰其他窗口输入 =====
    mainWindow.setAlwaysOnTop(true, 'screen');
    // 禁止窗口成为模态或持续抢占焦点：失焦时不再提升
    mainWindow.on('focus', () => {
        mainWindow.setAlwaysOnTop(true, 'screen');
    });

    // 关闭按钮实际是最小化到托盘
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

// ===== 主进程级穿透检测：screen.getCursorScreenPoint() 轮询 =====
// 核心原理：不依赖渲染层的鼠标事件（在 ignore=true 时不可靠），
// 而是在主进程用屏幕坐标检测鼠标是否在交互区域内
let _interactiveRects = [];     // 缓存的交互区域列表（屏幕坐标）
let _lastPassthrough = null;     // 上一次的穿透状态
let _passthroughInterval = null; // 轮询定时器

function setInteractiveRects(rects) {
    _interactiveRects = rects || [];
    // 立即重新检测一次
    checkPassthrough();
}

function checkPassthrough() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (_interactiveRects.length === 0) {
        // 没有注册交互区域时，默认不穿透（保证拖动可用）
        if (_lastPassthrough !== false) {
            _lastPassthrough = false;
            try { mainWindow.setIgnoreMouseEvents(false); } catch(e) {}
        }
        return;
    }
    try {
        const cursorPos = screen.getCursorScreenPoint();
        let overInteractive = false;
        for (const r of _interactiveRects) {
            if (cursorPos.x >= r.left && cursorPos.x <= r.right &&
                cursorPos.y >= r.top && cursorPos.y <= r.bottom) {
                overInteractive = true;
                break;
            }
        }
        const shouldIgnore = !overInteractive;
        if (_lastPassthrough !== shouldIgnore) {
            _lastPassthrough = shouldIgnore;
            try {
                mainWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
            } catch(e) {}
        }
    } catch(e) {}
}

function startPassthroughPolling() {
    if (_passthroughInterval) return;
    _passthroughInterval = setInterval(checkPassthrough, 33); // ~30fps
}

function stopPassthroughPolling() {
    if (_passthroughInterval) {
        clearInterval(_passthroughInterval);
        _passthroughInterval = null;
    }
}

// 视频播放窗口
function createVideoWindow(url) {
    const videoWin = new BrowserWindow({
        width: 480,
        height: 800,
        x: null,
        y: null,
        frame: true,
        alwaysOnTop: false,
        resizable: true,
        skipTaskbar: true,
        focusable: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // 拦截视频窗口内的新弹窗
    videoWin.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const u = new URL(url);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                shell.openExternal(url);
            }
        } catch (e) {}
        return { action: 'deny' };
    });

    // 拦截 will-navigate：阻止 custom scheme(bitbrowser://) 和其他非 http(s) 跳转
    videoWin.webContents.on('will-navigate', (event, navUrl) => {
        try {
            const u = new URL(navUrl);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                event.preventDefault();
            }
        } catch (e) {
            event.preventDefault();
        }
    });

    // B站(m.bilibili)用移动端UA，其他用桌面端UA
    const isMobile = url.includes('m.bilibili');
    const ua = isMobile
        ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    videoWin.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = ua;
        callback({ requestHeaders: details.requestHeaders });
    });

    videoWin.loadURL(url);

    videoWin.webContents.on('dom-ready', () => {
        // 抖音/快手桌面页面缩小显示
        if (!isMobile) {
            videoWin.webContents.setZoomFactor(0.6);
        }
        videoWin.webContents.insertCSS(`
            header, .header, .nav-bar, .navbar, .bottom-nav, .tab-bar,
            .app-header, .search-bar, .download-bar, .guide-bar,
            .download-popup, .app-download, .red-top, .popup,
            .banner, .footer-nav, .top-bar, .search-header,
            #header, .download-tip, .open-app, .download-modal,
            .guide-download, .float-btn, .back-to-top,
            .sidebar, .side-bar, .left-nav, .right-nav,
            .login-modal, .login-popup, .register-modal,
            .app-guide, .download-guide, .qrcode, .qr-code,
            .float-app, .open-app-btn, .download-btn,
            .modal-overlay, .modal-mask, .mask,
            .recommend-switch, .top-nav, .nav-left, .nav-right,
            .footer, .footer-bar, .bottom-bar,
            .dy-side-bar, .sidebar-outer, .header-wrapper,
            .nav-menu, .search-content, .right-panel,
            .ks-header, .ks-sidebar, .ks-nav,
            .bili-header, .bili-footer, .nav-main,
            .bili-mini-header, .header-channel,
            .ad-banner, .advertisement, .ad-container,
            .feedback, .report-btn, .share-btn {
                display: none !important;
            }
            body, html {
                overflow-y: auto !important;
                overflow-x: hidden !important;
                padding-top: 0 !important;
                margin-top: 0 !important;
            }
            #app, .app, .main, .content, #root {
                padding-top: 0 !important;
                margin-top: 0 !important;
            }
            video {
                opacity: 1 !important;
                visibility: visible !important;
            }
            .xgplayer, .xgplayer-controls, .bilibili-player-video-control,
            .bpx-player-control, .player-controls, .video-controls,
            .control-bar, .play-btn, .mute-btn {
                display: block !important;
                visibility: visible !important;
                z-index: 999999 !important;
            }
        `).catch(() => {});

        // 注入JS：只对可见视频取消静音，其余静音暂停（防止抖音切换视频后旧声音残留）
        videoWin.webContents.executeJavaScript(`
            (function(){
                if (window.__petVideoInited) return;
                window.__petVideoInited = true;
                try {
                    function isVisible(el) {
                        if (!el) return false;
                        const r = el.getBoundingClientRect();
                        if (r.width === 0 || r.height === 0) return false;
                        const style = window.getComputedStyle(el);
                        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return false;
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        const vw = window.innerWidth || document.documentElement.clientWidth;
                        return (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
                    }
                    function refreshVideos() {
                        const videos = document.querySelectorAll('video');
                        videos.forEach(v => {
                            try {
                                if (isVisible(v)) {
                                    v.muted = false;
                                    if (v.volume !== undefined) v.volume = 1;
                                    try { v.play && v.play(); } catch(e){}
                                } else {
                                    v.muted = true;
                                    try { v.pause && v.pause(); } catch(e) {}
                                }
                            } catch(e) {}
                        });
                    }
                    refreshVideos();
                    const observer = new MutationObserver(() => { refreshVideos(); });
                    observer.observe(document.documentElement, { subtree: true, childList: true });
                    window.addEventListener('scroll', refreshVideos, true);
                    window.addEventListener('wheel', refreshVideos, true);
                } catch(e) {}
            })();
        `).catch(() => {});
    });

    videoWin.on('closed', () => {});
}

// 系统托盘
function createTray() {
    const iconSize = 16;
    const iconImage = nativeImage.createEmpty();
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            trayIcon = nativeImage.createEmpty();
        }
    } catch (e) {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        { label: '显示/隐藏', click: () => toggleWindow() },
        { label: '重置键盘计数', click: () => {
            setKeyCountToday(0);
            if (mainWindow) mainWindow.webContents.send('key-count-update', 0);
        } },
        { label: '检查更新...', click: () => manualCheckForUpdates() },
        { type: 'separator' },
        { label: '开机自启', type: 'checkbox', checked: store.get('isAutoLaunch'),
          click: (item) => setAutoLaunch(item.checked) },
        { type: 'separator' },
        { label: '退出', click: () => {
            isQuitting = true;
            app.quit();
        } }
    ]);

    tray.setToolTip('桌面宠物工具');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => toggleWindow());
    tray.on('double-click', () => toggleWindow());
}

// 切换窗口显示/隐藏
function toggleWindow() {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide();
    } else {
        mainWindow.show();
        mainWindow.focus();
    }
}

// 老板键 - 把桌面宠物收起到系统托盘（其他所有应用窗口保持不变）
//
// 需求语义：
//   老板来了 → 桌面上的"桌面宠物小工具"立刻消失（收到托盘），
//   桌面上的其他窗口/软件一概不动。用户通过托盘图标/托盘菜单再恢复显示。
//
// 实现：
//   - 删除 PowerShell MinimizeAll / ToggleDesktop（那会最小化其他窗口，与需求相反）
//   - 删除 macOS Cmd+Option+H（那会隐藏其他应用，与需求相反）
//   - 只做一件事：mainWindow.hide() → 本窗口隐藏，托盘图标继续保留
//   - 配合托盘菜单「显示/隐藏」、托盘左键点击 toggleWindow()，用户可随时恢复
function triggerShowDesktop() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            // 清空任何遗留的鼠标穿透状态，防止隐藏时遗留副作用
            if (mainWindow.setIgnoreMouseEvents) {
                mainWindow.setIgnoreMouseEvents(false, { forward: true });
            }
            // 清空任务栏进度条（避免隐藏后残留进度条状态）
            mainWindow.setProgressBar(-1);
            // 关闭下载进度窗口（如果存在）
            if (typeof closeDownloadProgressWindow === 'function') {
                closeDownloadProgressWindow();
            }
            // 核心：把主窗口隐藏起来（托盘图标和托盘菜单依然可用）
            mainWindow.hide();
            console.log('[BossKey] 桌面宠物已隐藏到托盘（其他应用窗口未变动）');
        } catch (e) {
            console.warn('[BossKey] 隐藏失败:', e.message);
        }
    }
}

// 开机自启
function setAutoLaunch(enable) {
    store.set('isAutoLaunch', enable);
    try {
        app.setLoginItemSettings({
            openAtLogin: enable,
            openAsHidden: true,
            path: app.getPath('exe')
        });
    } catch (e) {
        console.error('设置开机自启失败:', e);
    }
}

function getAutoLaunch() {
    try {
        return app.getLoginItemSettings().openAtLogin;
    } catch (e) {
        return store.get('isAutoLaunch');
    }
}

// 启动全局键盘监听
function startKeyboardHook() {
    if (!uIOhook) {
        console.warn('键盘监听模块未加载，键盘统计功能不可用');
        return;
    }
    try {
        uIOhook.on('keydown', (e) => {
            const count = getKeyCountToday() + 1;
            setKeyCountToday(count);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('key-count-update', count);
            }
        });
        uIOhook.start();
        uiohookStarted = true;
        console.log('键盘监听已启动');
    } catch (e) {
        console.warn('键盘监听启动失败:', e.message);
    }
}

// IPC 通道
function registerIpcHandlers() {
    // 获取键计数
    ipcMain.handle('get-key-count', () => getKeyCountToday());

    // 重置键计数
    ipcMain.handle('reset-key-count', () => {
        setKeyCountToday(0);
        if (mainWindow) mainWindow.webContents.send('key-count-update', 0);
        return 0;
    });

    // 设置透明度
    ipcMain.on('set-opacity', (event, opacity) => {
        if (mainWindow) mainWindow.setOpacity(opacity);
        store.set('opacity', opacity);
    });

    ipcMain.handle('get-opacity', () => store.get('opacity'));

    // 老板键
    ipcMain.on('boss-button-click', () => triggerShowDesktop());

    // 开机自启
    ipcMain.handle('set-auto-launch', (event, enable) => {
        setAutoLaunch(enable);
        return enable;
    });

    ipcMain.handle('get-auto-launch', () => getAutoLaunch());

    // 数据持久化 - 语录
    ipcMain.handle('get-quotes', () => store.get('quotes'));
    ipcMain.handle('set-quotes', (event, quotes) => {
        store.set('quotes', quotes);
        return true;
    });

    // 倒计时目标
    ipcMain.handle('get-countdown-target', () => store.get('countdownTarget'));
    ipcMain.handle('set-countdown-target', (event, target) => {
        store.set('countdownTarget', target);
        return true;
    });

    // 自动语录间隔
    ipcMain.handle('get-auto-quote-interval', () => store.get('autoQuoteInterval'));
    ipcMain.handle('set-auto-quote-interval', (event, interval) => {
        store.set('autoQuoteInterval', interval);
        return true;
    });

    // 便签
    ipcMain.handle('get-sticky-note', () => store.get('stickyNote'));
    ipcMain.handle('set-sticky-note', (event, note) => {
        store.set('stickyNote', note);
        return true;
    });

    // 视频窗口
    ipcMain.on('open-video-window', (event, url) => {
        createVideoWindow(url);
    });

    // 退出应用
    ipcMain.on('quit-app', () => {
        isQuitting = true;
        app.quit();
    });

    // 隐藏窗口
    ipcMain.on('hide-window', () => {
        if (mainWindow) mainWindow.hide();
    });

    // 动态调整窗口大小
    ipcMain.on('resize-window', (event, width, height) => {
        if (mainWindow) {
            mainWindow.setSize(width, height);
        }
    });

    // 鼠标穿透（主进程级）：接收渲染层上报的交互区域，主进程轮询检测
    ipcMain.on('set-interactive-rects', (event, rects) => {
        setInteractiveRects(rects);
    });

    // 兼容旧接口：直接设置穿透状态（主进程轮询优先级更高）
    ipcMain.on('set-ignore-mouse-events', (event, ignore, opts) => {
        if (mainWindow) {
            try {
                mainWindow.setIgnoreMouseEvents(!!ignore, opts || { forward: true });
            } catch (e) {}
        }
    });
}

// 应用就绪
app.whenReady().then(() => {
    createWindow();
    createTray();
    registerIpcHandlers();
    startKeyboardHook();

    // 启动主进程级穿透检测轮询
    startPassthroughPolling();

    // 初始化自动更新（只在打包后生效）
    setupAutoUpdater();

    // 注册老板键全局快捷键
    try {
        globalShortcut.register(store.get('bossKeyShortcut'), () => {
            triggerShowDesktop();
        });
    } catch (e) {
        console.warn('注册全局快捷键失败:', e.message);
    }
});

// 退出前清理
app.on('will-quit', () => {
    stopPassthroughPolling();
    globalShortcut.unregisterAll();
    if (uIOhook && uiohookStarted) {
        try { uIOhook.stop(); } catch (e) {}
    }
});

// macOS: 点击 dock 图标时重新打开窗口
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

// 防止应用退出（驻留托盘）
app.on('window-all-closed', (e) => {
    if (process.platform !== 'darwin') {
        // Windows/Linux: 不退出，驻留托盘
    }
});
