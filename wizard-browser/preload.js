'use strict';
// Bridge between the browser UI and the main process. The UI has no Node access.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => { const h = (e, p) => cb(p); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h); };

contextBridge.exposeInMainWorld('wb', {
    info: () => ipcRenderer.invoke('app:info'),
    ready: () => ipcRenderer.invoke('app:ready'),
    setDefault: () => ipcRenderer.invoke('app:setDefault'),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    openExternal: u => ipcRenderer.invoke('app:openExternal', u),
    showItem: p => ipcRenderer.invoke('app:showItem', p),
    openPath: p => ipcRenderer.invoke('app:openPath', p),
    store: { get: (k, d) => ipcRenderer.invoke('store:get', k, d), set: (k, v) => ipcRenderer.invoke('store:set', k, v) },
    win: {
        minimize: () => ipcRenderer.invoke('win:minimize'), maximize: () => ipcRenderer.invoke('win:maximize'),
        close: () => ipcRenderer.invoke('win:close'), fullscreen: v => ipcRenderer.invoke('win:fullscreen', v),
        state: () => ipcRenderer.invoke('win:state'),
        overlay: (c, sym) => ipcRenderer.invoke('win:overlay', c, sym), material: m => ipcRenderer.invoke('win:material', m),
        login: v => ipcRenderer.invoke('win:login', v), defaultApps: () => ipcRenderer.invoke('win:defaultApps')
    },
    perm: { answer: (id, a) => ipcRenderer.invoke('perm:answer', id, a), forget: () => ipcRenderer.invoke('perm:forget') },
    dl: { list: () => ipcRenderer.invoke('dl:list'), cancel: id => ipcRenderer.invoke('dl:cancel', id), pause: id => ipcRenderer.invoke('dl:pause', id), clear: () => ipcRenderer.invoke('dl:clear') },
    vault: {
        list: () => ipcRenderer.invoke('vault:list'), forHost: h => ipcRenderer.invoke('vault:forHost', h),
        save: e => ipcRenderer.invoke('vault:save', e), remove: id => ipcRenderer.invoke('vault:remove', id),
        clear: () => ipcRenderer.invoke('vault:clear'), never: h => ipcRenderer.invoke('vault:never', h),
        isNever: h => ipcRenderer.invoke('vault:isNever', h), reveal: id => ipcRenderer.invoke('vault:reveal', id),
        fill: (wcId, id) => ipcRenderer.invoke('vault:fill', wcId, id),
        importCsv: () => ipcRenderer.invoke('vault:import'), exportCsv: () => ipcRenderer.invoke('vault:export')
    },
    importBookmarks: () => ipcRenderer.invoke('bookmarks:import'),
    clearData: (what, parts) => ipcRenderer.invoke('data:clear', what, parts),
    api: (method, path, body) => ipcRenderer.invoke('api', method, path, body),
    blockedTotal: () => ipcRenderer.invoke('app:blockedTotal'),
    nav: { entries: id => ipcRenderer.invoke('nav:entries', id), goto: (id, i) => ipcRenderer.invoke('nav:goto', id, i) },
    wallpaper: { get: () => ipcRenderer.invoke('wallpaper:get'), pick: () => ipcRenderer.invoke('wallpaper:pick'), clear: () => ipcRenderer.invoke('wallpaper:clear') },
    ext: { list: () => ipcRenderer.invoke('ext:list'), install: x => ipcRenderer.invoke('ext:install', x), toggle: (id, on) => ipcRenderer.invoke('ext:toggle', id, on), remove: id => ipcRenderer.invoke('ext:remove', id), popup: (id, p) => ipcRenderer.invoke('ext:popup', id, p) },
    drm: { status: () => ipcRenderer.invoke('drm:status'), recheck: () => ipcRenderer.invoke('drm:recheck') },
    linux: { integrate: () => ipcRenderer.invoke('linux:integrate'), status: () => ipcRenderer.invoke('linux:status') },
    on: {
        urls: on('open-urls'), shortcut: on('shortcut'), openTab: on('open-tab'), blocked: on('blocked-count'),
        permission: on('permission-request'), download: on('download-update'), windowState: on('window-state'),
        accountChanged: on('account-changed'), searchSelection: on('search-selection'), askSelection: on('ask-selection'), clipSelection: on('clip-selection')
    }
});
