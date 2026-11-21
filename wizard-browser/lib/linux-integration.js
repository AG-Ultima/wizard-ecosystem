'use strict';
// Desktop integration for the AppImage: menu entry, icons in the user's hicolor theme, and (optionally)
// default-browser registration. Everything goes under ~/.local/share, nothing needs root.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const NAME = 'wizard-browser';
const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const desktopFile = () => path.join(dataHome(), 'applications', NAME + '.desktop');

function desktopEntry(exec) {
    return `[Desktop Entry]
Version=1.0
Type=Application
Name=Wizard Browser
GenericName=Web Browser
Comment=Workspaces, built-in ad blocking and Wizard Ecosystem integration
Exec="${exec}" %U
Icon=${NAME}
Terminal=false
Categories=Network;WebBrowser;
MimeType=text/html;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
StartupWMClass=Wizard Browser
StartupNotify=true
Actions=new-private;

[Desktop Action new-private]
Name=New Window
Exec="${exec}"
`;
}

function installIcons(appDir) {
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
    let n = 0;
    for (const s of sizes) {
        const src = path.join(appDir, 'icons', `icon-${s}.png`);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(dataHome(), 'icons', 'hicolor', `${s}x${s}`, 'apps');
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(src, path.join(dest, NAME + '.png')); n++;
    }
    return n;
}

function run(cmd, args) { try { return spawnSync(cmd, args, { stdio: 'ignore', timeout: 8000 }).status === 0; } catch (e) { return false; } }

function integrate({ appImage, appDir, makeDefault }) {
    if (process.platform !== 'linux') return { ok: false, reason: 'Linux only' };
    const exec = appImage || process.execPath;
    // An AppImage mounts at a random /tmp/.mount_* path each run, so the stable file on disk is what we register.
    fs.mkdirSync(path.dirname(desktopFile()), { recursive: true });
    fs.writeFileSync(desktopFile(), desktopEntry(exec), { mode: 0o755 });
    const icons = installIcons(appDir);
    run('update-desktop-database', [path.dirname(desktopFile())]);
    run('gtk-update-icon-cache', ['-f', '-t', path.join(dataHome(), 'icons', 'hicolor')]);
    run('kbuildsycoca6', []) || run('kbuildsycoca5', []);              // refresh the KDE (Plasma) app menu cache
    let isDefault = false;
    if (makeDefault) {
        run('xdg-settings', ['set', 'default-web-browser', NAME + '.desktop']);
        for (const m of ['x-scheme-handler/http', 'x-scheme-handler/https', 'text/html']) run('xdg-mime', ['default', NAME + '.desktop', m]);
        const r = spawnSync('xdg-settings', ['get', 'default-web-browser'], { encoding: 'utf8', timeout: 8000 });
        isDefault = !!(r.stdout && r.stdout.trim() === NAME + '.desktop');
    }
    return { ok: true, desktop: desktopFile(), icons, default: isDefault };
}

function status({ appImage }) {
    const installed = fs.existsSync(desktopFile());
    let isDefault = false;
    try { const r = spawnSync('xdg-settings', ['get', 'default-web-browser'], { encoding: 'utf8', timeout: 5000 }); isDefault = !!(r.stdout && r.stdout.trim() === NAME + '.desktop'); } catch (e) { /* ignore */ }
    return { installed, isDefault, appImage: !!appImage };
}

module.exports = { integrate, status, desktopEntry };
