const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openApp: (appId, title, url) => ipcRenderer.send('open-app', appId, title, url),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    onShowAbout: (callback) => ipcRenderer.on('show-about', callback),
    onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),
    onCheckUpdates: (callback) => ipcRenderer.on('check-updates', callback),
    onShowShortcuts: (callback) => ipcRenderer.on('show-shortcuts', callback),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});