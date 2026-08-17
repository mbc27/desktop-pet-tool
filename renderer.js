// renderer.js - 渲染进程逻辑
const api = window.petAPI;

// ===== 自动调整窗口大小 =====
function autoResizeWindow() {
    requestAnimationFrame(() => {
        const container = document.querySelector('.pet-container');
        if (!container) return;
        // 用 getBoundingClientRect（实际渲染高度，display:none 不计入），更准确
        const rect = container.getBoundingClientRect();
        // +2 仅保留极小余量，避免窗口底部出现透明条挡住下层点击
        const height = Math.min(Math.ceil(rect.height) + 2, 760);
        api.resizeWindow(280, height);
        // 窗口大小变化后立即上报交互区域到主进程
        setTimeout(reportInteractiveRects, 50);
    });
}

// ===== 上报交互区域到主进程（主进程级穿透检测） =====
// 主进程用 screen.getCursorScreenPoint() 轮询检测鼠标是否在交互区域内
// 完全避免了渲染层 mousemove 在 ignore=true 时不可靠的问题
const _uiContainer = document.querySelector('.pet-container');

function reportInteractiveRects() {
    if (!_uiContainer) return;
    const rect = _uiContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const screenLeft = window.screenX + rect.left * dpr;
    const screenTop = window.screenY + rect.top * dpr;
    const screenRight = window.screenX + rect.right * dpr;
    const screenBottom = window.screenY + rect.bottom * dpr;

    api.setInteractiveRects([{
        left: screenLeft,
        top: screenTop,
        right: screenRight,
        bottom: screenBottom
    }]);
}

// ===== 收起/展开工具函数 =====
function collapseSection(name) {
    if (name === 'basic') {
        basicBody.style.display = 'none';
        btnBasicToggle.textContent = '展开';
    } else if (name === 'sticky') {
        stickyBody.style.display = 'none';
        btnStickyToggle.textContent = '展开';
    } else if (name === 'video') {
        videoBody.style.display = 'none';
        btnVideoToggle.textContent = '展开';
    }
}

function expandSection(name) {
    // 互斥：展开一个时收起其他两个
    if (name !== 'basic') collapseSection('basic');
    if (name !== 'sticky') collapseSection('sticky');
    if (name !== 'video') collapseSection('video');
    // 展开目标
    if (name === 'basic') {
        basicBody.style.display = 'flex';
        btnBasicToggle.textContent = '收起';
    } else if (name === 'sticky') {
        stickyBody.style.display = 'flex';
        btnStickyToggle.textContent = '收起';
    } else if (name === 'video') {
        videoBody.style.display = 'flex';
        btnVideoToggle.textContent = '收起';
    }
    autoResizeWindow();
}

// ===== 默认语录库 =====
const DEFAULT_QUOTES = [
    "✨ 代码写累了，休息一下~",
    "🚀 今天已经敲了 {count} 次键盘！",
    "💡 保持专注，你是最棒的！",
    "☕ 该喝咖啡了~",
    "🎯 目标就在前方，继续前进！",
    "🐱 喵~ 主人加油！",
    "🌟 你的努力终将被看见！",
    "🎵 写代码也是一种艺术~",
    "🍀 今天运气不错哦~",
    "💪 坚持就是胜利！"
];

// ===== 实时时钟 =====
const clockDate = document.getElementById('clock-date');
const clockTime = document.getElementById('clock-time');

function updateClock() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    clockDate.textContent = `${year}-${month}-${day} ${weekdays[now.getDay()]}`;
    clockTime.textContent = `${hours}:${minutes}:${seconds}`;
}

updateClock();
setInterval(updateClock, 1000);

// ===== 正计时 =====
let timerStartTime = null;
let timerInterval = null;
let isTimerRunning = false;
const timerDisplay = document.getElementById('timer-display');
const btnTimerStart = document.getElementById('btn-timer-start');
const btnTimerStop = document.getElementById('btn-timer-stop');
const btnTimerReset = document.getElementById('btn-timer-reset');

function formatTime(ms) {
    const hours = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function updateTimerButtons() {
    btnTimerStart.disabled = isTimerRunning;
    btnTimerStop.disabled = !isTimerRunning;
}

function startTimer() {
    if (isTimerRunning) return;
    isTimerRunning = true;
    timerStartTime = Date.now();
    timerInterval = setInterval(() => {
        timerDisplay.textContent = formatTime(Date.now() - timerStartTime);
    }, 1000);
    updateTimerButtons();
}

function stopTimer() {
    isTimerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateTimerButtons();
}

function resetTimer() {
    stopTimer();
    timerDisplay.textContent = '00:00:00';
    updateTimerButtons();
}

btnTimerStart.addEventListener('click', startTimer);
btnTimerStop.addEventListener('click', stopTimer);
btnTimerReset.addEventListener('click', resetTimer);
updateTimerButtons();

// ===== 倒计时 =====
let countdownTarget = null;
let countdownInterval = null;
const countdownDisplay = document.getElementById('countdown-display');
const cdHoursInput = document.getElementById('cd-hours');
const cdMinutesInput = document.getElementById('cd-minutes');
const cdSecondsInput = document.getElementById('cd-seconds');
const btnSetCountdown = document.getElementById('btn-set-countdown');
const btnClearCountdown = document.getElementById('btn-clear-countdown');

function setCountdown(hours, minutes, seconds) {
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    if (totalSeconds <= 0) {
        showQuote('❌ 请设置有效的倒计时时间');
        return;
    }
    if (countdownInterval) clearInterval(countdownInterval);
    countdownTarget = Date.now() + totalSeconds * 1000;
    api.setCountdownTarget(countdownTarget);

    btnSetCountdown.disabled = true;
    btnSetCountdown.textContent = '倒计时中...';

    countdownInterval = setInterval(() => {
        const remaining = countdownTarget - Date.now();
        if (remaining <= 0) {
            countdownDisplay.textContent = '00:00:00';
            clearInterval(countdownInterval);
            countdownInterval = null;
            countdownTarget = null;
            api.setCountdownTarget(null);
            btnSetCountdown.disabled = false;
            btnSetCountdown.textContent = '开始倒计时';
            showQuote('⏰ 倒计时结束！该休息啦~');
            return;
        }
        countdownDisplay.textContent = formatTime(remaining);
    }, 1000);
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    countdownTarget = null;
    countdownDisplay.textContent = '--:--:--';
    api.setCountdownTarget(null);
    btnSetCountdown.disabled = false;
    btnSetCountdown.textContent = '开始倒计时';
}

btnSetCountdown.addEventListener('click', () => {
    const h = parseInt(cdHoursInput.value, 10) || 0;
    const m = parseInt(cdMinutesInput.value, 10) || 0;
    const s = parseInt(cdSecondsInput.value, 10) || 0;
    if (h === 0 && m === 0 && s === 0) {
        showQuote('❌ 请设置有效的倒计时时间');
        return;
    }
    setCountdown(h, m, s);
    const parts = [];
    if (h) parts.push(`${h}小时`);
    if (m) parts.push(`${m}分`);
    if (s) parts.push(`${s}秒`);
    showQuote(`✅ 倒计时已设为 ${parts.join('')}`);
});

btnClearCountdown.addEventListener('click', clearCountdown);

api.getCountdownTarget().then(target => {
    if (target && target > Date.now()) {
        countdownTarget = target;
        btnSetCountdown.disabled = true;
        btnSetCountdown.textContent = '倒计时中...';
        countdownInterval = setInterval(() => {
            const remaining = countdownTarget - Date.now();
            if (remaining <= 0) {
                countdownDisplay.textContent = '00:00:00';
                clearInterval(countdownInterval);
                countdownInterval = null;
                countdownTarget = null;
                api.setCountdownTarget(null);
                btnSetCountdown.disabled = false;
                btnSetCountdown.textContent = '开始倒计时';
                return;
            }
            countdownDisplay.textContent = formatTime(remaining);
        }, 1000);
    }
});

// ===== 键盘计数 =====
const keyCountDisplay = document.getElementById('key-count-display');
let currentKeyCount = 0;

function updateKeyCountDisplay(count) {
    currentKeyCount = count;
    keyCountDisplay.textContent = `${count.toLocaleString()} 次`;
}

api.getKeyCount().then(count => updateKeyCountDisplay(count));
api.onKeyCountUpdate((count) => updateKeyCountDisplay(count));

document.getElementById('btn-key-reset').addEventListener('click', async () => {
    const c = await api.resetKeyCount();
    updateKeyCountDisplay(c);
});

// ===== 趣味语录 =====
const quoteDisplay = document.getElementById('quote-display');
let quoteInterval = null;
let quoteHideTimer = null;

async function getQuotes() {
    const custom = await api.getQuotes();
    return (custom && custom.length) ? custom : DEFAULT_QUOTES;
}

function getCurrentKeyCount() {
    return currentKeyCount;
}

async function showQuote(text) {
    let quote = text;
    if (!quote) {
        const quotes = await getQuotes();
        quote = quotes[Math.floor(Math.random() * quotes.length)];
    }
    quote = quote.replace('{count}', getCurrentKeyCount());
    quoteDisplay.textContent = quote;
    quoteDisplay.classList.add('show');

    if (quoteHideTimer) clearTimeout(quoteHideTimer);
    quoteHideTimer = setTimeout(() => {
        quoteDisplay.classList.remove('show');
    }, 6000);
}

async function startAutoQuote(intervalMs) {
    if (quoteInterval) clearInterval(quoteInterval);
    setTimeout(showQuote, 3000);
    quoteInterval = setInterval(showQuote, intervalMs);
}

document.getElementById('btn-show-quote').addEventListener('click', () => showQuote());

// ===== 透明度 =====
const opacitySlider = document.getElementById('opacity-slider');
const opacityLabel = document.getElementById('opacity-label');

opacitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    opacityLabel.textContent = Math.round(val * 100) + '%';
    api.setOpacity(val);
});

api.getOpacity().then(opacity => {
    opacitySlider.value = opacity;
    opacityLabel.textContent = Math.round(opacity * 100) + '%';
});

// ===== 语录间隔 =====
const quoteIntervalSlider = document.getElementById('quote-interval-slider');
const quoteIntervalLabel = document.getElementById('quote-interval-label');

quoteIntervalSlider.addEventListener('input', async (e) => {
    const minutes = parseInt(e.target.value, 10);
    quoteIntervalLabel.textContent = minutes;
    await api.setAutoQuoteInterval(minutes * 60 * 1000);
    startAutoQuote(minutes * 60 * 1000);
});

(async () => {
    const intervalMs = await api.getAutoQuoteInterval();
    const minutes = Math.round(intervalMs / 60000);
    quoteIntervalSlider.value = minutes;
    quoteIntervalLabel.textContent = minutes;
    startAutoQuote(intervalMs);
})();

// ===== 老板键 =====
document.getElementById('btn-boss').addEventListener('click', () => {
    const btn = document.getElementById('btn-boss');
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 600);
    api.triggerBossKey();
});

// ===== 开机自启 =====
const autoLaunchCheckbox = document.getElementById('auto-launch-checkbox');
api.getAutoLaunch().then(enabled => {
    autoLaunchCheckbox.checked = !!enabled;
});
autoLaunchCheckbox.addEventListener('change', (e) => {
    api.setAutoLaunch(e.target.checked);
});

// ===== 窗口控制 =====
document.getElementById('btn-hide').addEventListener('click', () => {
    api.hideWindow();
});

document.getElementById('btn-quit').addEventListener('click', () => {
    api.quitApp();
});

// ===== 基础功能收起/展开 =====
const btnBasicToggle = document.getElementById('btn-basic-toggle');
const basicBody = document.getElementById('basic-body');

btnBasicToggle.addEventListener('click', () => {
    if (basicBody.style.display === 'none') {
        expandSection('basic');
    } else {
        collapseSection('basic');
        autoResizeWindow();
    }
});

// ===== 便签功能 =====
const stickyNote = document.getElementById('sticky-note');
const stickySaveStatus = document.getElementById('sticky-save-status');
const btnStickyToggle = document.getElementById('btn-sticky-toggle');
const stickyBody = document.getElementById('sticky-body');
const btnStickyClear = document.getElementById('btn-sticky-clear');

api.getStickyNote().then(note => {
    if (note) stickyNote.value = note;
});

let stickySaveTimer = null;
stickyNote.addEventListener('input', () => {
    stickySaveStatus.textContent = '正在保存...';
    stickySaveStatus.style.color = 'rgba(255, 200, 100, 0.8)';
    if (stickySaveTimer) clearTimeout(stickySaveTimer);
    stickySaveTimer = setTimeout(() => {
        api.setStickyNote(stickyNote.value);
        stickySaveStatus.textContent = '已自动保存';
        stickySaveStatus.style.color = 'rgba(255, 200, 100, 0.6)';
    }, 500);
});

btnStickyToggle.addEventListener('click', () => {
    if (stickyBody.style.display === 'none') {
        expandSection('sticky');
    } else {
        collapseSection('sticky');
        autoResizeWindow();
    }
});

btnStickyClear.addEventListener('click', () => {
    if (confirm('确定要清空便签吗？')) {
        stickyNote.value = '';
        api.setStickyNote('');
        stickySaveStatus.textContent = '已清空';
        setTimeout(() => {
            stickySaveStatus.textContent = '已自动保存';
        }, 1500);
    }
});

// ===== 视频播放器 =====
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const btnVideoToggle = document.getElementById('btn-video-toggle');
const videoBody = document.getElementById('video-body');
const videoWebview = document.getElementById('video-webview');
const btnVideoReload = document.getElementById('btn-video-reload');
const btnVideoNewWin = document.getElementById('btn-video-new-win');
const btnVideoClose = document.getElementById('btn-video-close');

let currentVideoUrl = '';
let currentPlatform = '';
let currentZoom = 1;

btnVideoToggle.addEventListener('click', () => {
    if (videoBody.style.display === 'none') {
        expandSection('video');
    } else {
        collapseSection('video');
        autoResizeWindow();
    }
});

function loadVideoUrl(url, platformName, zoom) {
    if (!url) return;
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    currentVideoUrl = targetUrl;
    currentPlatform = platformName || '';
    currentZoom = zoom || 1;

    // B站用移动端UA，抖音/快手用桌面端UA
    const ua = (platformName === 'B站') ? MOBILE_UA : DESKTOP_UA;
    try {
        videoWebview.setUserAgent(ua);
    } catch (e) {}

    videoWebview.src = targetUrl;
}

document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        const name = btn.dataset.name;
        const zoom = parseFloat(btn.dataset.zoom) || 1;
        loadVideoUrl(url, name, zoom);
        showQuote(`🎬 已打开${name}视频流`);
    });
});

btnVideoReload.addEventListener('click', () => {
    if (currentVideoUrl) {
        videoWebview.reload();
    }
});

btnVideoNewWin.addEventListener('click', () => {
    const url = currentVideoUrl || videoWebview.src;
    if (url && url !== 'about:blank') {
        api.openVideoWindow(url);
    } else {
        showQuote('❌ 请先打开一个视频页面');
    }
});

btnVideoClose.addEventListener('click', () => {
    videoWebview.src = 'about:blank';
    currentVideoUrl = '';
    currentPlatform = '';
});

// 拦截webview内的will-navigate：阻止bitbrowser://等自定义scheme弹窗
videoWebview.addEventListener('will-navigate', (e) => {
    try {
        const url = e.url;
        if (!url) return;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
            // 自定义协议（bitbrowser://、kuaishou:// 等）阻止跳转
            e.preventDefault();
        }
    } catch (err) {}
});

// 拦截 webview 内新窗口请求
videoWebview.addEventListener('new-window', (e) => {
    try {
        e.preventDefault();
    } catch (err) {}
});

// 设置UA + zoom
videoWebview.addEventListener('did-attach', () => {
    // zoom在dom-ready中设置，因为需要等页面加载
});

// 注入CSS隐藏页面的非视频UI元素 + 设置zoom
videoWebview.addEventListener('dom-ready', () => {
    try {
        // 设置页面缩放（抖音/快手桌面页面缩小显示）
        if (currentZoom && currentZoom !== 1) {
            videoWebview.setZoomFactor(currentZoom);
        } else {
            videoWebview.setZoomFactor(1);
        }
    } catch (e) {}

    try {
        videoWebview.insertCSS(`
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
            .xgplayer, .xg-controls, .xgplayer-controls,
            .bilibili-player-video-control, .bpx-player-control,
            .player-controls, .video-control, .video-controls,
            .control-bar, .control-bar-mask,
            .play-btn, .mute-btn, .volume-slider,
            .play-icon, .pause-icon, .unmute-btn {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                z-index: 999999 !important;
            }
        `);
    } catch (e) {}

    // 视频声音控制：只让"活跃视频"（可见面积最大）播放发声，其余全部静音暂停
    // 使用 cleanup 模式：每次 dom-ready 注入前先清理上一次的 observer/interval，避免重复
    try {
        videoWebview.executeJavaScript(`
            (function(){
                // 清理上一次注入的实例（SPA 切换页面/重新 dom-ready 时）
                if (window.__petVideoCleanup) {
                    try { window.__petVideoCleanup(); } catch(e) {}
                }
                try {
                    // 计算视频可见比例（0~1）
                    function getVisibleRatio(v) {
                        const r = v.getBoundingClientRect();
                        if (r.width === 0 || r.height === 0) return 0;
                        const style = window.getComputedStyle(v);
                        if (style.display === 'none' || style.visibility === 'hidden' ||
                            parseFloat(style.opacity || '1') === 0) return 0;
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        const vw = window.innerWidth || document.documentElement.clientWidth;
                        const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
                        const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
                        return (visW * visH) / (r.width * r.height);
                    }

                    // 防抖：避免 MutationObserver 高频触发
                    let _refreshTimer = null;
                    function refreshVideos() {
                        if (_refreshTimer) return; // 已排队，跳过
                        _refreshTimer = setTimeout(() => {
                            _refreshTimer = null;
                            doRefresh();
                        }, 80);
                    }

                    function doRefresh() {
                        const videos = document.querySelectorAll('video');
                        if (videos.length === 0) return;
                        // 找可见面积最大的视频作为"活跃视频"（>50% 可见才算）
                        let activeVideo = null;
                        let maxRatio = 0.5;
                        videos.forEach(v => {
                            const ratio = getVisibleRatio(v);
                            if (ratio > maxRatio) {
                                maxRatio = ratio;
                                activeVideo = v;
                            }
                        });
                        // 只播放活跃视频，其余全部静音暂停（解决切换时声音残留）
                        videos.forEach(v => {
                            try {
                                if (v === activeVideo) {
                                    v.muted = false;
                                    if (v.volume !== undefined) v.volume = 1;
                                    if (v.paused) {
                                        const p = v.play && v.play();
                                        if (p && typeof p.catch === 'function') p.catch(()=>{});
                                    }
                                } else {
                                    v.muted = true;
                                    try { v.pause && v.pause(); } catch(e) {}
                                }
                            } catch(e) {}
                        });
                    }

                    // 给新出现的 video 元素绑定 play/playing 事件（切换视频时触发刷新）
                    function attachListeners() {
                        document.querySelectorAll('video').forEach(v => {
                            if (!v.__petBound) {
                                v.__petBound = true;
                                v.addEventListener('play', refreshVideos);
                                v.addEventListener('playing', refreshVideos);
                                v.addEventListener('volumechange', refreshVideos);
                            }
                        });
                    }

                    doRefresh();
                    attachListeners();

                    // DOM 变化时刷新 + 给新 video 绑定事件
                    const observer = new MutationObserver(() => {
                        refreshVideos();
                        attachListeners();
                    });
                    observer.observe(document.documentElement, { subtree: true, childList: true });

                    // 兜底定时器：每秒检查一次（防止 observer 漏掉某些变化）
                    const interval = setInterval(doRefresh, 1000);

                    // 滚动/滚轮切换视频时立即刷新
                    window.addEventListener('scroll', refreshVideos, true);
                    window.addEventListener('wheel', refreshVideos, true);

                    // 保存清理函数
                    window.__petVideoCleanup = function() {
                        try { if (observer) observer.disconnect(); } catch(e) {}
                        try { clearInterval(interval); } catch(e) {}
                        try { window.removeEventListener('scroll', refreshVideos, true); } catch(e) {}
                        try { window.removeEventListener('wheel', refreshVideos, true); } catch(e) {}
                        try {
                            document.querySelectorAll('video').forEach(v => {
                                v.muted = true;
                                try { v.pause(); } catch(e) {}
                            });
                        } catch(e) {}
                    };
                } catch(e) {}
            })();
        `);
    } catch (e) {}
});

// 页面完全加载后：不再需要重置标志（cleanup 模式自动处理）
videoWebview.addEventListener('did-stop-loading', () => {
    if (!currentVideoUrl || currentVideoUrl === 'about:blank') return;
});

videoWebview.addEventListener('did-navigate', (e) => {
    if (e.url && e.url !== 'about:blank') {
        currentVideoUrl = e.url;
    }
});

videoWebview.addEventListener('did-navigate-in-page', (e) => {
    if (e.url && e.url !== 'about:blank') {
        currentVideoUrl = e.url;
    }
});

videoWebview.addEventListener('did-start-loading', () => {
    btnVideoReload.style.opacity = '0.5';
});

videoWebview.addEventListener('did-stop-loading', () => {
    btnVideoReload.style.opacity = '1';
});

// 阻止右键菜单
document.addEventListener('contextmenu', e => e.preventDefault());

// 页面加载完成后初始调整窗口大小并上报交互区域
window.addEventListener('load', () => {
    setTimeout(() => {
        autoResizeWindow();
        // 额外延迟确保布局完全稳定后再上报
        setTimeout(reportInteractiveRects, 200);
    }, 100);
});

// 窗口移动时也重新上报（拖动后位置改变）
window.addEventListener('resize', reportInteractiveRects);
// 窗口位置变化时重新上报
setInterval(reportInteractiveRects, 500);
