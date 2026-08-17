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

function setupAutoUpdater() {
    if (!autoUpdater) return;

    try {
        autoUpdater.autoDownload = false;           // 不后台静默下载，由用户确认
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.allowDowngrade = false;
        autoUpdater.allowPrerelease = false;

        autoUpdater.on('error', (err) => {
            console.error('[AutoUpdater] error:', err && err.message ? err.message : err);
        });

        autoUpdater.on('update-available', (info) => {
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
                    autoUpdater.downloadUpdate();
                }
            }).catch(() => {});
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[AutoUpdater] 当前已是最新版本');
        });

        autoUpdater.on('download-progress', (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                const pct = Math.round(progress.percent || 0);
                mainWindow.setProgressBar(pct / 100);
            }
        });

        autoUpdater.on('update-downloaded', () => {
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

        // 应用启动 10 秒后检查一次更新（避免干扰启动流程）
        setTimeout(() => {
            if (!app.isPackaged) {
                console.log('[AutoUpdater] 开发模式下跳过自动更新检查');
                return;
            }
            try {
                autoUpdater.checkForUpdates();
            } catch (e) {
                console.warn('[AutoUpdater] 检查更新失败:', e.message);
            }
        }, 10000);

        // IPC：用户手动检查更新
        ipcMain.handle('check-for-updates', async () => {
            if (!autoUpdater || !app.isPackaged) {
                return { ok: false, message: '当前环境不支持自动更新' };
            }
            try {
                await autoUpdater.checkForUpdates();
                return { ok: true };
            } catch (e) {
                return { ok: false, message: e.message || String(e) };
            }
        });
    } catch (e) {
        console.warn('[AutoUpdater] 初始化失败:', e.message);
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
        stickyNote: ''
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

// 老板键 - 显示桌面
function triggerShowDesktop() {
    if (process.platform === 'win32') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).ToggleDesktop()"', (err) => {
            if (err) {
                exec('powershell -NoProfile -Command "$w = New-Object -ComObject Shell.Application; $w.MinimizeAll()"');
            }
        });
    } else if (process.platform === 'darwin') {
        exec('osascript -e \'tell application "System Events" to keystroke "h" using command down\'');
    }
    if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide();
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
