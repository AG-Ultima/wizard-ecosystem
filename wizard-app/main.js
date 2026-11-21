const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;
let appWindows = {};

// Disable SSL certificate errors for development
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

function createMainWindow() {
    // Allow insecure content for your domain
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"]
            }
        });
    });

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            allowRunningInsecureContent: true
        },
        backgroundColor: '#030614',
        title: 'Wizard Ecosystem',
        icon: path.join(__dirname, 'icons/icon.png'),
        show: false
    });

    // Load your website
    mainWindow.loadURL('https://www.wizardecosystem.dev', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }).catch(err => {
        console.log('Failed to load:', err);
        mainWindow.loadURL('http://www.wizardecosystem.dev');
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    // Handle SSL certificate errors
    mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
        if (url.includes('wizardecosystem.dev')) {
            event.preventDefault();
            callback(true);
        } else {
            callback(false);
        }
    });

    // Handle failed navigations
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.log('Failed to load:', errorDescription);
        if (errorDescription.includes('ERR_CERT') || errorDescription.includes('SSL')) {
            mainWindow.loadURL('http://www.wizardecosystem.dev');
        }
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('wizardecosystem.dev')) {
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Set up menu
    const menuTemplate = [
        {
            label: '🧙 Wizard',
            submenu: [
                {
                    label: 'About Wizard Ecosystem',
                    click: () => {
                        mainWindow.webContents.send('show-about');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Reload App',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.reload();
                    }
                },
                {
                    label: 'Back to Hub',
                    accelerator: 'CmdOrCtrl+H',
                    click: () => {
                        mainWindow.loadURL('https://www.wizardecosystem.dev');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    role: 'quit',
                    accelerator: 'CmdOrCtrl+Q'
                }
            ]
        },
        {
            label: '📁 Apps',
            submenu: [
                {
                    label: '🧠 Wizard AI',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => openAppWindow('ai', 'Wizard AI', 'https://wizardecosystem.dev/ai')
                },
                {
                    label: '🔍 Wizard Search',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => openAppWindow('search', 'Wizard Search', 'https://wizardecosystem.dev/search')
                },
                {
                    label: '📧 Wizard Mail',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => openAppWindow('mail', 'Wizard Mail', 'https://wizardecosystem.dev/mail')
                },
                {
                    label: '📅 Wizard Calendar',
                    accelerator: 'CmdOrCtrl+4',
                    click: () => openAppWindow('calendar', 'Wizard Calendar', 'https://wizardecosystem.dev/calendar')
                },
                {
                    label: '💬 Wizard Chat',
                    accelerator: 'CmdOrCtrl+5',
                    click: () => openAppWindow('chat', 'Wizard Chat', 'https://wizardecosystem.dev/chat')
                },
                { type: 'separator' },
                {
                    label: '🏠 Back to Hub',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.loadURL('https://www.wizardecosystem.dev');
                            mainWindow.focus();
                        }
                    }
                }
            ]
        },
        {
            label: '🔧 View',
            submenu: [
                { label: 'Reload', role: 'reload' },
                { label: 'Force Reload', role: 'forceReload' },
                { type: 'separator' },
                { label: 'Actual Size', role: 'resetZoom' },
                { label: 'Zoom In', role: 'zoomIn' },
                { label: 'Zoom Out', role: 'zoomOut' },
                { type: 'separator' },
                { label: 'Toggle Full Screen', role: 'togglefullscreen' },
                { label: 'Toggle Developer Tools', role: 'toggleDevTools' }
            ]
        },
        {
            label: '❓ Help',
            submenu: [
                {
                    label: 'Keyboard Shortcuts',
                    click: () => {
                        mainWindow.webContents.send('show-shortcuts');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function openAppWindow(id, title, url) {
    if (appWindows[id] && !appWindows[id].isDestroyed()) {
        appWindows[id].focus();
        return;
    }

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            allowRunningInsecureContent: true
        },
        backgroundColor: '#030614',
        title: title,
        icon: path.join(__dirname, 'icons/icon.png'),
        show: false
    });

    // Handle certificate errors in child windows
    win.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
        if (url.includes('wizardecosystem.dev')) {
            event.preventDefault();
            callback(true);
        } else {
            callback(false);
        }
    });

    win.loadURL(url).catch(err => {
        console.log('Failed to load child window:', err);
        const httpUrl = url.replace('https://', 'http://');
        win.loadURL(httpUrl);
    });

    win.once('ready-to-show', () => {
        win.show();
    });

    win.on('closed', () => {
        delete appWindows[id];
    });

    appWindows[id] = win;
}

// IPC handlers
ipcMain.on('open-app', (event, appId, title, url) => {
    openAppWindow(appId, title, url);
});

ipcMain.on('focus-main', () => {
    if (mainWindow) {
        mainWindow.focus();
    }
});

ipcMain.on('go-back-to-hub', () => {
    if (mainWindow) {
        mainWindow.loadURL('https://www.wizardecosystem.dev');
        mainWindow.focus();
    }
});

ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});

app.whenReady().then(() => {
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        if (url.includes('wizardecosystem.dev')) {
            event.preventDefault();
            callback(true);
        } else {
            callback(false);
        }
    });

    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}