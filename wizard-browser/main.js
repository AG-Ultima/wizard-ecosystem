// main.js — Wizard Browser main process (v11, Linux-first)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, Menu, MenuItem, ipcMain, session, shell, safeStorage, clipboard, dialog, nativeTheme, net, webContents, components } = require('electron');   // `components` only exists in castlabs Electron (Widevine)

const { createBlocker } = require('./lib/adblock');
const { createStore } = require('./lib/store');
const { createVault } = require('./lib/vault');
const { matchShortcut } = require('./lib/shortcuts');
const { isHttpUrl, urlsFromArgv, isSafeExternal, flagsFromArgv } = require('./lib/urls');
const { createCookieSync } = require('./lib/cookie-sync');

const API_BASE = process.env.WIZARD_API || 'https://arnav0928.pythonanywhere.com';
const IS_LINUX = process.platform === 'linux';
const IS_WIN = process.platform === 'win32';
if (IS_WIN) app.setAppUserModelId('dev.wizardecosystem.browser');   // groups taskbar icon, jump list and notifications
const SAFE_MODE = !!process.env.WIZBROWSER_SAFE;

// ─── Linux tuning ───
// Native Wayland on Wayland sessions (X11 otherwise), Wayland client-side decorations, GPU raster,
// smooth scrolling, overlay scrollbars. WIZBROWSER_SAFE=1 skips all of it if a driver misbehaves.
if (IS_LINUX && !SAFE_MODE) {
    app.commandLine.appendSwitch('ozone-platform-hint', process.env.WIZBROWSER_X11 ? 'x11' : 'auto');
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations,OverlayScrollbar,VaapiVideoDecoder');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-smooth-scrolling');
    app.commandLine.appendSwitch('disable-features', 'MediaRouter');
    try { app.setDesktopName('wizard-browser.desktop'); } catch (e) { /* older Electron */ }
    // Plasma 6 (Garuda Dr460nized) keeps secrets in KWallet 6; Chromium only picks kwallet5 by default.
    if ((process.env.XDG_CURRENT_DESKTOP || '').includes('KDE') && process.env.KDE_SESSION_VERSION === '6') app.commandLine.appendSwitch('password-store', 'kwallet6');
}
// AppImage on systems without unprivileged user namespaces cannot start the sandbox: WIZBROWSER_NOSANDBOX=1 as a last resort.
if (IS_LINUX && process.env.WIZBROWSER_NOSANDBOX) app.commandLine.appendSwitch('no-sandbox');
app.setName('Wizard Browser');

let win = null;
let store, vault, blocker;
const hostReady = { value: false };
const pendingUrls = [];
const blockedByWc = new Map();     // webContents id -> count
let blockedTotal = 0;
const downloads = new Map();       // id -> { item, info }
const permWaiters = new Map();     // id -> resolve
let permSeq = 0, dlSeq = 0;
const configuredSessions = new WeakSet();
const knownSessions = [];
const pendingActions = [];
const partitionOf = new WeakMap();
let extensions = null;
let cookieSync = null;

const DEFAULT_SETTINGS = {
    theme: 'grimoire', adblock: true, gpc: true, nativeFrame: false, winOverlay: true, winMaterial: 'none', homepage: '', searchEngine: 'wizard',
    askDownload: false, shareLogin: true, restoreSession: true, showBookmarksBar: true, tabLayout: 'top', sleepMinutes: 20, wallpaper: true, customTheme: null
};
const settings = () => Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));

// ─── Single instance, links from other apps ───
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
    app.on('second-instance', (e, argv, cwd) => {
        if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
        deliverUrls(urlsFromArgv(argv, cwd));
        deliverFlags(flagsFromArgv(argv));
    });
}
app.on('open-url', (e, url) => { e.preventDefault(); deliverUrls([url]); });   // macOS

function deliverFlags(f) {
    const acts = []; if (f.newTab) acts.push('new-tab'); if (f.private) acts.push('new-private-tab');
    if (!acts.length) return;
    if (win && hostReady.value) acts.forEach(a => win.webContents.send('shortcut', a)); else pendingActions.push(...acts);
}
function deliverUrls(urls) {
    if (!urls.length) return;
    if (win && hostReady.value) win.webContents.send('open-urls', urls);
    else pendingUrls.push(...urls);
}

// ─── Chrome-like user agent (Google and others block "Electron/…") ───
function cleanUA(ua) { return ua.replace(/\sElectron\/\S+/, '').replace(/\swizard-browser\/\S+/i, '').replace(/\sWizard Browser\/\S+/i, ''); }

function allowedPartition(p) { return /^persist:ws-[a-z0-9_-]{1,40}$/i.test(p || '') || /^private-[a-z0-9]{1,24}$/i.test(p || '') || p === 'persist:panels'; }
const persistent = p => /^persist:/.test(p || '');
const canBack = c => (c.navigationHistory ? c.navigationHistory.canGoBack() : c.canGoBack());
const canFwd = c => (c.navigationHistory ? c.navigationHistory.canGoForward() : c.canGoForward());
const goBack = c => (c.navigationHistory ? c.navigationHistory.goBack() : c.goBack());
const goFwd = c => (c.navigationHistory ? c.navigationHistory.goForward() : c.goForward());

// ─── Per-session hardening: ad blocking, headers, permissions, downloads ───
function configureSession(ses) {
    if (configuredSessions.has(ses)) return;
    configuredSessions.add(ses);
    ses.setUserAgent(cleanUA(ses.getUserAgent()));
    knownSessions.push(ses);
    if (extensions && persistent(partitionOf.get(ses))) extensions.loadAllInto(ses);
    if (cookieSync && persistent(partitionOf.get(ses)) && partitionOf.get(ses) !== 'persist:default') cookieSync.attach(ses, partitionOf.get(ses));

    ses.webRequest.onBeforeRequest((details, cb) => {
        if (settings().adblock && blocker.shouldBlock({ url: details.url, resourceType: details.resourceType, firstPartyUrl: details.referrer || (details.webContents && details.webContents.getURL && details.webContents.getURL()) })) {
            blockedTotal++;
            if (details.webContentsId) blockedByWc.set(details.webContentsId, (blockedByWc.get(details.webContentsId) || 0) + 1);
            if (win && !win.isDestroyed()) win.webContents.send('blocked-count', { id: details.webContentsId, count: blockedByWc.get(details.webContentsId) || 0, total: blockedTotal });
            return cb({ cancel: true });
        }
        cb({});
    });
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
        const h = details.requestHeaders;
        if (settings().gpc) { h['Sec-GPC'] = '1'; h['DNT'] = '1'; }
        cb({ requestHeaders: h });
    });

    const AUTO = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management', 'sensors']);
    const ASK = new Set(['media', 'geolocation', 'notifications', 'midi', 'clipboard-read', 'display-capture', 'mediaKeySystem']);
    const decide = (wc, permission, url, details) => new Promise(resolve => {
        if (AUTO.has(permission)) return resolve(true);
        if (permission === 'mediaKeySystem') return resolve(settings().drm !== false);   // DRM playback (Netflix and friends): one switch in Settings, no per-site prompt
        if (!ASK.has(permission) || !win || win.isDestroyed()) return resolve(false);
        let origin = ''; try { origin = new URL(url || (wc && wc.getURL())).origin; } catch (e) { return resolve(false); }
        const key = origin + '|' + permission + (permission === 'media' && details && details.mediaTypes ? ':' + details.mediaTypes.slice().sort().join('+') : '');
        const remembered = store.get('permissions', {});
        if (key in remembered) return resolve(remembered[key]);
        const id = ++permSeq;
        permWaiters.set(id, ans => {
            if (ans.remember) { const m = store.get('permissions', {}); m[key] = !!ans.allow; store.set('permissions', m); }
            resolve(!!ans.allow);
        });
        win.webContents.send('permission-request', { id, origin, permission, mediaTypes: details && details.mediaTypes });
        setTimeout(() => { if (permWaiters.has(id)) { permWaiters.delete(id); resolve(false); } }, 60000);
    });
    ses.setPermissionRequestHandler((wc, permission, cb, details) => { decide(wc, permission, details && details.requestingUrl, details).then(cb); });
    ses.setPermissionCheckHandler((wc, permission, origin) => AUTO.has(permission) || (permission === 'mediaKeySystem' && settings().drm !== false) || (store.get('permissions', {})[origin + '|' + permission] === true));

    ses.on('will-download', (event, item, wc) => {
        const id = ++dlSeq;
        const dir = app.getPath('downloads');
        let name = item.getFilename().replace(/[\\/\0]/g, '_') || 'download';
        let target = path.join(dir, name);
        const ext = path.extname(name), base = path.basename(name, ext);
        for (let n = 1; fs.existsSync(target); n++) target = path.join(dir, `${base} (${n})${ext}`);
        if (settings().askDownload) { const r = dialog.showSaveDialogSync(win, { defaultPath: target }); if (!r) { item.cancel(); return; } target = r; }
        item.setSavePath(target);
        const info = { id, name: path.basename(target), path: target, url: item.getURL(), total: item.getTotalBytes(), received: 0, state: 'progressing', started: Date.now() };
        downloads.set(id, { item, info });
        const push = () => {
            if (win && !win.isDestroyed()) win.webContents.send('download-update', Object.assign({}, info));
            if (win && !win.isDestroyed() && process.platform !== 'linux') taskbarProgress();   // taskbar button fills while downloading
        };
        item.on('updated', (e, state) => { info.received = item.getReceivedBytes(); info.total = item.getTotalBytes(); info.state = item.isPaused() ? 'paused' : (state === 'interrupted' ? 'interrupted' : 'progressing'); push(); });
        item.once('done', (e, state) => { info.state = state; info.received = item.getReceivedBytes(); push(); if (state === 'completed') recordDownload(info); });
        push();
    });
}

function taskbarProgress() {
    if (!win || win.isDestroyed()) return;
    const act = [...downloads.values()].filter(d => d.info.state === 'progressing' || d.info.state === 'paused');
    if (!act.length) { win.setProgressBar(-1); return; }
    const total = act.reduce((a, d) => a + (d.info.total || 0), 0), got = act.reduce((a, d) => a + (d.info.received || 0), 0);
    win.setProgressBar(total > 0 ? Math.min(1, got / total) : 2, { mode: total > 0 ? (act.every(d => d.info.state === 'paused') ? 'paused' : 'normal') : 'indeterminate' });
}
// Jump list (right-click the taskbar icon) and Windows-only polish.
function winIntegration() {
    try {
        app.setUserTasks([
            { program: process.execPath, arguments: '--new-tab', iconPath: process.execPath, iconIndex: 0, title: 'New tab', description: 'Open a new tab' },
            { program: process.execPath, arguments: '--private', iconPath: process.execPath, iconIndex: 0, title: 'New private tab', description: 'Open a private tab that leaves nothing behind' }
        ]);
    } catch (e) {}
    win.on('focus', () => { try { win.flashFrame(false); } catch (e) {} });
}
function recordDownload(info) {
    const list = store.get('downloads', []);
    list.unshift({ name: info.name, path: info.path, url: info.url, size: info.received, date: Date.now() });
    store.set('downloads', list.slice(0, 200));
}

// Every web-contents created by the app (including each <webview>) gets the same treatment.
app.on('web-contents-created', (e, contents) => {
    const type = contents.getType();
    if (type === 'webview') {
        const host = contents.hostWebContents;
        const send = (ch, p) => { if (host && !host.isDestroyed()) host.send(ch, p); };
        contents.setWindowOpenHandler(({ url, disposition, features }) => {
            if (!isHttpUrl(url) && url !== 'about:blank') return { action: 'deny' };
            // Real popups (auth windows, payment) keep window.opener so they can message back.
            if (disposition === 'new-window' && features && /width=|height=/.test(features)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } } };
            send('open-tab', { url, background: disposition === 'background-tab', from: contents.id });
            return { action: 'deny' };
        });
        contents.on('before-input-event', (ev, input) => {
            const action = matchShortcut(input);
            if (action) { ev.preventDefault(); send('shortcut', action); }
        });
        contents.on('context-menu', (ev, params) => showContextMenu(contents, params, send));
        // Pages that set a "leave site?" prompt (e.g. after a recording) silently block Back/navigation in a
        // <webview> unless something answers. Ask like Chrome does.
        contents.on('will-prevent-unload', ev => {
            const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Leave', 'Stay'], defaultId: 1, cancelId: 1, title: 'Leave site?', message: 'Leave this site?', detail: 'Changes you made may not be saved.', noLink: true });
            if (choice === 0) ev.preventDefault();
        });
        contents.on('will-navigate', (ev, url) => { if (!isHttpUrl(url) && !/^(file|about|view-source|blob|data|wiz):/i.test(url)) { ev.preventDefault(); if (isSafeExternal(url)) shell.openExternal(url); } });
        contents.on('destroyed', () => blockedByWc.delete(contents.id));
        contents.on('did-start-navigation', (ev, url, inPlace, isMain) => { if (isMain && !inPlace) { blockedByWc.set(contents.id, 0); send('blocked-count', { id: contents.id, count: 0, total: blockedTotal }); } });
    } else if (type === 'window') {
        contents.on('will-navigate', (ev, url) => { if (!isHttpUrl(url)) ev.preventDefault(); });
    }
});

function showContextMenu(contents, p, send) {
    const m = new Menu();
    const add = (label, click, enabled = true) => m.append(new MenuItem({ label, click, enabled }));
    const sep = () => m.append(new MenuItem({ type: 'separator' }));
    if (p.linkURL) {
        add('Open link in new tab', () => send('open-tab', { url: p.linkURL, background: true }));
        add('Open link in private tab', () => send('open-tab', { url: p.linkURL, priv: true }));
        add('Copy link address', () => clipboard.writeText(p.linkURL));
        sep();
    }
    if (p.srcURL && p.mediaType === 'image') {
        add('Open image in new tab', () => send('open-tab', { url: p.srcURL, background: true }));
        add('Copy image', () => contents.copyImageAt(p.x, p.y));
        add('Copy image address', () => clipboard.writeText(p.srcURL));
        add('Save image as…', () => contents.downloadURL(p.srcURL));
        sep();
    }
    if (p.isEditable) {
        for (const s of (p.dictionarySuggestion ? [p.dictionarySuggestion] : [])) add(s, () => contents.replaceMisspelling(s));
        if (p.misspelledWord) sep();
        add('Cut', () => contents.cut(), p.editFlags.canCut);
        add('Copy', () => contents.copy(), p.editFlags.canCopy);
        add('Paste', () => contents.paste(), p.editFlags.canPaste);
        add('Select all', () => contents.selectAll());
        sep();
    } else if (p.selectionText) {
        const sel = p.selectionText.trim();
        add('Copy', () => contents.copy());
        add(`Search the web for “${sel.length > 28 ? sel.slice(0, 28) + '…' : sel}”`, () => send('search-selection', sel));
        add('Ask Wizard AI about this', () => send('ask-selection', sel));
        add('Save to Wizard Notes', () => send('clip-selection', sel));
        sep();
    }
    if (!p.linkURL && !p.selectionText && !p.isEditable) {
        add('Back', () => goBack(contents), canBack(contents));
        add('Forward', () => goFwd(contents), canFwd(contents));
        add('Reload', () => contents.reload());
        sep();
        add('Save page as…', () => contents.downloadURL(contents.getURL()), isHttpUrl(contents.getURL()));
        add('Print…', () => contents.print());
        sep();
    }
    add('Inspect element', () => { contents.inspectElement(p.x, p.y); if (contents.isDevToolsOpened()) contents.devToolsWebContents.focus(); });
    m.popup({ window: win });
}

// ─── Window ───
function createWindow() {
    const s = settings();
    const state = store.get('window', { width: 1360, height: 860 });
    const frameless = !s.nativeFrame;
    // Windows 11: keep our tab strip, but let Windows draw the caption buttons. That gives Snap Layouts
    // on the maximize button, native hover/press states and correct DPI. Not used with the system title bar.
    const overlay = IS_WIN && frameless && s.winOverlay !== false;
    const material = IS_WIN && /^(mica|acrylic|tabbed)$/.test(s.winMaterial || '') ? s.winMaterial : null;
    win = new BrowserWindow({
        width: state.width, height: state.height, x: state.x, y: state.y,
        minWidth: 640, minHeight: 420,
        show: false, frame: !frameless || overlay,
        ...(overlay ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#e8f0ff', height: 40 } } : {}),
        ...(material ? { backgroundMaterial: material } : {}),
        backgroundColor: material ? '#00000000' : (s.theme === 'oled' ? '#000000' : '#0b0a14'),
        title: 'Wizard Browser',
        icon: path.join(__dirname, 'icons', 'icon-512.png'),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false, sandbox: true,
            webviewTag: true, spellcheck: true
        }
    });
    Menu.setApplicationMenu(null);
    if (state.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    if (IS_WIN) winIntegration();
    win.loadFile(path.join(__dirname, 'index.html'));

    const saveBounds = () => {
        if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
        const maximized = win.isMaximized();
        const b = maximized ? (store.get('window', {})) : win.getBounds();
        store.set('window', Object.assign({}, b, { maximized }));
    };
    win.on('resize', saveBounds); win.on('move', saveBounds); win.on('maximize', saveBounds); win.on('unmaximize', saveBounds);
    const state2 = () => { if (!win.isDestroyed()) win.webContents.send('window-state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() }); };
    ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur'].forEach(e => win.on(e, state2));

    win.webContents.on('before-input-event', (ev, input) => {
        const action = matchShortcut(input);
        if (action) { ev.preventDefault(); win.webContents.send('shortcut', action); }
    });
    win.webContents.setWindowOpenHandler(({ url }) => { if (isSafeExternal(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', ev => ev.preventDefault());
    win.webContents.on('will-attach-webview', (ev, webPreferences, params) => {
        // The page cannot choose its own privileges: preload, isolation and partition are forced here.
        if (!allowedPartition(params.partition)) { ev.preventDefault(); return; }
        delete webPreferences.preloadURL;
        webPreferences.preload = path.join(__dirname, 'webview-preload.js');
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        webPreferences.allowRunningInsecureContent = false;
        webPreferences.enableBlinkFeatures = '';
        { const ses = session.fromPartition(params.partition); partitionOf.set(ses, params.partition); configureSession(ses); }
        // Block non-http(s) initial sources (file:// is allowed only via an explicit user action).
        if (params.src && !/^(https?:|file:|about:|wiz:)/i.test(params.src)) params.src = 'about:blank';
    });
    win.on('closed', () => { win = null; hostReady.value = false; });
}

// ─── IPC ───
const fromHost = e => win && e.sender === win.webContents;
function handle(channel, fn) { ipcMain.handle(channel, (e, ...a) => { if (!fromHost(e)) throw new Error('forbidden'); return fn(...a); }); }

// Small whitelisted key-value stores for the UI
const KEYS = new Set(['settings', 'bookmarks', 'history', 'workspaces', 'session', 'sitesettings', 'panels', 'groups', 'recentlyClosed', 'customTheme']);
handle('store:get', (key, fallback) => { if (!KEYS.has(key)) throw new Error('bad key'); return key === 'settings' ? settings() : store.get(key, fallback); });
handle('store:set', (key, value) => {
    if (!KEYS.has(key)) throw new Error('bad key');
    if (key === 'settings') { value = Object.assign({}, store.get('settings', {}), value); }
    store.set(key, value);
    if (key === 'settings' && value) applyNativeSettings(value);
    return true;
});
function applyNativeSettings(s) { if (s && typeof s.theme === 'string') nativeTheme.themeSource = s.theme === 'light' ? 'light' : 'dark'; }

handle('app:info', () => ({
    version: app.getVersion(), platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome,
    wayland: IS_LINUX && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY),
    vault: vault.storage(), blockerSize: blocker.size, apiBase: API_BASE, home: os.homedir(),
    overlay: IS_WIN && !settings().nativeFrame && settings().winOverlay !== false, isDefault: app.isDefaultProtocolClient('https'), downloads: app.getPath('downloads'), safeMode: SAFE_MODE
}));
handle('app:ready', () => { hostReady.value = true; const u = pendingUrls.splice(0); setTimeout(() => pendingActions.splice(0).forEach(a => win && !win.isDestroyed() && win.webContents.send('shortcut', a)), 400); applyNativeSettings(settings()); return u; });
handle('app:setDefault', () => {
    if (IS_LINUX && process.env.APPIMAGE) return require('./lib/linux-integration').integrate({ app, appImage: process.env.APPIMAGE, resources: process.resourcesPath, appDir: __dirname, makeDefault: true }).default;
    const a = app.setAsDefaultProtocolClient('http'); const b = app.setAsDefaultProtocolClient('https');
    // Windows 10/11 won't let an app pick itself: open the Default apps page with Wizard Browser registered.
    if (IS_WIN && !app.isDefaultProtocolClient('https')) shell.openExternal('ms-settings:defaultapps').catch(() => {});
    return a && b && app.isDefaultProtocolClient('https');
});
handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
handle('app:openExternal', url => { if (isSafeExternal(url)) return shell.openExternal(url); return false; });
handle('app:showItem', p => { if (typeof p === 'string' && path.isAbsolute(p)) shell.showItemInFolder(p); });
handle('app:openPath', p => { if (typeof p === 'string' && path.isAbsolute(p)) return shell.openPath(p); });
handle('app:blockedTotal', () => blockedTotal);

// Back-button history list
const viewContents = id => { const wc = webContents.fromId(id); return wc && !wc.isDestroyed() && wc.getType() === 'webview' && wc.hostWebContents === win.webContents ? wc : null; };
handle('nav:entries', id => {
    const wc = viewContents(id); if (!wc) return null;
    const h = wc.navigationHistory; if (!h || !h.getAllEntries) return null;
    return { index: h.getActiveIndex(), entries: h.getAllEntries().map(e => ({ url: e.url, title: e.title })) };
});
handle('nav:goto', (id, i) => { const wc = viewContents(id); if (!wc || !Number.isInteger(i)) return false; wc.navigationHistory.goToIndex(i); return true; });

handle('win:minimize', () => win.minimize());
handle('win:maximize', () => { win.isMaximized() ? win.unmaximize() : win.maximize(); });
handle('win:close', () => win.close());
handle('win:fullscreen', v => win.setFullScreen(typeof v === 'boolean' ? v : !win.isFullScreen()));
handle('win:overlay', (color, symbol) => {
    if (!IS_WIN || !win || win.isDestroyed() || !win.setTitleBarOverlay) return false;
    const ok = v => typeof v === 'string' && /^(#[0-9a-f]{6,8}|rgba?\([\d\s,.%]+\))$/i.test(v);
    try { win.setTitleBarOverlay({ color: ok(color) ? color : '#00000000', symbolColor: ok(symbol) ? symbol : '#e8f0ff', height: 40 }); return true; } catch (e) { return false; }
});
handle('win:material', m => {
    if (!IS_WIN || !win || win.isDestroyed() || !win.setBackgroundMaterial) return false;
    try { win.setBackgroundMaterial(/^(mica|acrylic|tabbed)$/.test(m) ? m : 'none'); return true; } catch (e) { return false; }
});
handle('win:login', v => {
    if (!IS_WIN && process.platform !== 'darwin') return false;
    if (typeof v === 'boolean') app.setLoginItemSettings({ openAtLogin: v, args: ['--background-start'] });
    return app.getLoginItemSettings().openAtLogin;
});
handle('win:defaultApps', () => IS_WIN ? shell.openExternal('ms-settings:defaultapps') : false);
handle('win:state', () => ({ maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() }));

handle('perm:answer', (id, ans) => { const w = permWaiters.get(id); if (w) { permWaiters.delete(id); w(ans || {}); } });
handle('perm:forget', () => { store.set('permissions', {}); });

handle('dl:list', () => ({ active: [...downloads.values()].map(d => d.info), history: store.get('downloads', []) }));
handle('dl:cancel', id => { const d = downloads.get(id); if (d) d.item.cancel(); });
handle('dl:pause', id => { const d = downloads.get(id); if (d) d.item.isPaused() ? d.item.resume() : d.item.pause(); });
handle('dl:clear', () => { store.set('downloads', []); for (const [id, d] of downloads) if (d.info.state !== 'progressing') downloads.delete(id); });

// Vault
handle('vault:list', () => vault.list());
handle('vault:forHost', h => vault.forHost(h));
handle('vault:save', e => vault.save(e));
handle('vault:remove', id => vault.remove(id));
handle('vault:clear', () => vault.clear());
handle('vault:never', h => vault.addNever(h));
handle('vault:isNever', h => vault.isNever(h));
handle('vault:reveal', id => vault.reveal(id));
handle('vault:fill', (wcId, entryId) => {
    const wc = webContents.fromId(wcId);
    const e = vault.reveal(entryId);
    if (!wc || !e || wc.getType() !== 'webview') return false;
    let host = ''; try { host = new URL(wc.getURL()).hostname.toLowerCase().replace(/^www\./, ''); } catch (x) { return false; }
    if (host !== e.host) return false;        // only ever fill on the site it was saved for
    wc.send('wb:fill', { username: e.username, password: e.password });
    return true;
});
handle('vault:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import passwords (CSV)', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return -1;
    return vault.importCsv(fs.readFileSync(r.filePaths[0], 'utf8'));
});
handle('vault:export', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Export passwords (CSV, plain text!)', defaultPath: path.join(app.getPath('documents'), 'wizard-browser-passwords.csv') });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, vault.exportCsv(), { mode: 0o600 });
    return true;
});
// Bookmarks import (Netscape HTML as exported by Vivaldi/Chrome/Firefox)
handle('bookmarks:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import bookmarks (HTML)', filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return require('./lib/bookmarks').parseNetscape(fs.readFileSync(r.filePaths[0], 'utf8'));
});

// Clear browsing data
handle('data:clear', async (what, partitions) => {
    const parts = (partitions || []).filter(allowedPartition);
    for (const p of parts) {
        const ses = session.fromPartition(p);
        if (what.cache) await ses.clearCache();
        const storages = [];
        if (what.cookies) storages.push('cookies');
        if (what.site) storages.push('localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'filesystem');
        if (storages.length) await ses.clearStorageData({ storages });
    }
    return true;
});

// Wizard backend: requests run here (no CORS, shared cookie jar), and only to the Wizard API.
const apiSession = () => session.fromPartition('persist:wizard-account');
handle('api', async (method, apiPath, body) => {
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/api/') || apiPath.includes('..')) throw new Error('bad path');
    method = String(method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('bad method');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await apiSession().fetch(API_BASE + apiPath, {
            method, credentials: 'include', signal: ctrl.signal,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        let data = null; try { data = await res.json(); } catch (e) { /* not json */ }
        return { status: res.status, ok: res.ok, data };
    } catch (e) { console.error('[api]', method, apiPath, e && e.message); return { status: 0, ok: false, data: null, error: e.name === 'AbortError' ? 'timed out after 20s' : String((e && e.cause && e.cause.message) || (e && e.message) || e) }; }
    finally { clearTimeout(t); }
});


// Extensions & themes from the Chrome Web Store
handle('ext:list', () => extensions.list());
handle('ext:install', async idOrUrl => extensions.install(idOrUrl, { sessions: knownSessions.filter(s => persistent(partitionOf.get(s))) }));
handle('ext:toggle', (id, on) => extensions.setEnabled(id, on, knownSessions));
handle('ext:remove', id => extensions.remove(id, knownSessions));
handle('ext:popup', (id, partition) => extensions.openPopup(id, partition, win, session));

// Wallpaper for the new-tab page (copied into the app's data folder, returned as a data URL)
const wallpaperFile = () => path.join(app.getPath('userData'), 'wizard-browser', 'wallpaper.bin');
function readWallpaper() { try { const b = fs.readFileSync(wallpaperFile()); const t = fs.readFileSync(wallpaperFile() + '.type', 'utf8'); return `data:${t};base64,${b.toString('base64')}`; } catch (e) { return null; } }
handle('wallpaper:get', () => readWallpaper());
handle('wallpaper:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a wallpaper', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const ext = path.extname(r.filePaths[0]).slice(1).toLowerCase();
    const buf = fs.readFileSync(r.filePaths[0]);
    if (buf.length > 12 * 1024 * 1024) throw new Error('Image is larger than 12 MB');
    fs.writeFileSync(wallpaperFile(), buf); fs.writeFileSync(wallpaperFile() + '.type', 'image/' + (ext === 'jpg' ? 'jpeg' : ext));
    return readWallpaper();
});
handle('wallpaper:clear', () => { try { fs.unlinkSync(wallpaperFile()); } catch (e) { /* none */ } return true; });

// Linux desktop integration (needed for AppImage: menu entry, icon, default browser)
handle('linux:integrate', () => require('./lib/linux-integration').integrate({ app, appImage: process.env.APPIMAGE, resources: process.resourcesPath, appDir: __dirname }));
handle('linux:status', () => require('./lib/linux-integration').status({ appImage: process.env.APPIMAGE }));


// ─── Widevine (protected content: Netflix, Disney+, Prime Video) ───
// Stock Electron ships without the Widevine CDM, so Netflix answers "Pardon the interruption" (M7701-1003).
// castlabs' Electron build adds the component updater; on Linux no VMP signing is needed (L3 quality).
const DRM = { supported: !!components, state: components ? 'loading' : 'missing', version: '', error: '' };
async function drmInit(waitMs) {
    if (!components) return DRM;
    try {
        await Promise.race([components.whenReady(), new Promise((_, rej) => setTimeout(() => rej(new Error('Still downloading')), waitMs || 20000))]);
        DRM.state = 'ready'; DRM.error = '';
    } catch (e) { DRM.state = /Still downloading/.test(String(e && e.message)) ? 'loading' : 'error'; DRM.error = String(e && e.message || e); }
    try { const st = components.status(); const w = Object.values(st || {}).find(c => /widevine/i.test(c && c.name || '')) || Object.values(st || {})[0]; if (w && w.version) DRM.version = String(w.version); } catch (e) {}
    return DRM;
}
handle('drm:status', async () => (DRM.state === 'loading' ? await drmInit(1500) : DRM));
handle('drm:recheck', () => drmInit(15000));

// ─── Lifecycle ───
app.whenReady().then(async () => {
    await drmInit(8000);          // give Widevine a few seconds before restored tabs load
    const dir = path.join(app.getPath('userData'), 'wizard-browser');
    store = createStore(dir);
    vault = createVault({ store, dir, safeStorage });
    blocker = createBlocker();
    cookieSync = createCookieSync({ host: new URL(API_BASE).hostname.toLowerCase(), enabled: () => settings().shareLogin !== false, onChange: () => { clearTimeout(cookieSync._t); cookieSync._t = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('account-changed'); }, 600); } });
    extensions = require('./lib/extensions').createExtensions({ dir: path.join(dir, 'extensions'), store, net, session, chromeVersion: process.versions.chrome });
    { const d = session.defaultSession; partitionOf.set(d, 'persist:default'); configureSession(d); }
    { const a = apiSession(); partitionOf.set(a, 'persist:wizard-account'); configureSession(a); }
    createWindow();
    const first = urlsFromArgv(process.argv, process.cwd());
    if (first.length) pendingUrls.push(...first);
    app.on('activate', () => { if (!win) createWindow(); });
});
app.on('before-quit', () => { if (store) store.flush(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
