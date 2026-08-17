// preload.js - 安全桥接主进程与渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
    // 键盘计数
    getKeyCount: () => ipcRenderer.invoke('get-key-count'),
    resetKeyCount: () => ipcRenderer.invoke('reset-key-count'),
    onKeyCountUpdate: (callback) => {
        ipcRenderer.on('key-count-update', (event, count) => callback(count));
    },

    // 透明度
    setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),
    getOpacity: () => ipcRenderer.invoke('get-opacity'),

    // 老板键
    triggerBossKey: () => ipcRenderer.send('boss-button-click'),

    // 开机自启
    setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),
    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),

    // 语录
    getQuotes: () => ipcRenderer.invoke('get-quotes'),
    setQuotes: (quotes) => ipcRenderer.invoke('set-quotes', quotes),

    // 倒计时
    getCountdownTarget: () => ipcRenderer.invoke('get-countdown-target'),
    setCountdownTarget: (target) => ipcRenderer.invoke('set-countdown-target', target),

    // 自动语录间隔
    getAutoQuoteInterval: () => ipcRenderer.invoke('get-auto-quote-interval'),
    setAutoQuoteInterval: (interval) => ipcRenderer.invoke('set-auto-quote-interval', interval),

    // 便签
    getStickyNote: () => ipcRenderer.invoke('get-sticky-note'),
    setStickyNote: (note) => ipcRenderer.invoke('set-sticky-note', note),

    // 窗口控制
    quitApp: () => ipcRenderer.send('quit-app'),
    hideWindow: () => ipcRenderer.send('hide-window'),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),
    setIgnoreMouseEvents: (ignore, opts) => ipcRenderer.send('set-ignore-mouse-events', ignore, opts),

    // 鼠标穿透（主进程级）：上报交互区域到主进程做屏幕坐标检测
    setInteractiveRects: (rects) => ipcRenderer.send('set-interactive-rects', rects),

    // 视频窗口
    openVideoWindow: (url) => ipcRenderer.send('open-video-window', url)
});
