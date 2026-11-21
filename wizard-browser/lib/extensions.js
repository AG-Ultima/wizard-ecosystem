'use strict';
// Chrome Web Store extensions and themes for Wizard Browser.
// Uses Electron's built-in extension loader (partial chrome.* API support: content scripts, storage,
// runtime messaging, scripting, popups). Extensions that depend on blocking webRequest or the full
// chrome.tabs/windows APIs (e.g. MV2 uBlock Origin) will load but not fully work.
const fs = require('fs');
const path = require('path');
const { crxToZip, extractZip } = require('./crx');

const ID_RE = /^[a-p]{32}$/;
function extractId(input) {
    const s = String(input || '').trim();
    if (ID_RE.test(s)) return s;
    try {
        const u = new URL(s);
        if (!/(^|\.)(chromewebstore\.google\.com|chrome\.google\.com)$/.test(u.hostname)) return null;
        const seg = u.pathname.split('/').filter(Boolean).reverse().find(x => ID_RE.test(x));
        return seg || null;
    } catch (e) { return null; }
}

function resolveMsg(dir, manifest, value) {
    const m = /^__MSG_(.+)__$/.exec(value || '');
    if (!m) return value;
    const locales = [manifest.default_locale, 'en', 'en_US'].filter(Boolean);
    for (const loc of locales) {
        try { const j = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8').replace(/^﻿/, ''));
            const k = Object.keys(j).find(x => x.toLowerCase() === m[1].toLowerCase()); if (k && j[k].message) return j[k].message; } catch (e) { /* next */ }
    }
    return value;
}

function readTheme(dir, manifest) {
    const t = manifest.theme || {};
    const colors = {};
    for (const [k, v] of Object.entries(t.colors || {})) if (Array.isArray(v) && v.length >= 3) colors[k] = `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
    const images = {};
    for (const k of ['theme_ntp_background', 'theme_frame', 'theme_toolbar']) {
        const rel = (t.images || {})[k];
        if (!rel) continue;
        try {
            const f = path.resolve(dir, rel);
            if (!f.startsWith(path.resolve(dir) + path.sep)) continue;
            const b = fs.readFileSync(f);
            if (b.length > 8 * 1024 * 1024) continue;
            const ext = path.extname(f).slice(1).toLowerCase();
            images[k] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b.toString('base64')}`;
        } catch (e) { /* skip */ }
    }
    return { colors, images };
}

function createExtensions({ dir, store, net, session, chromeVersion }) {
    fs.mkdirSync(dir, { recursive: true });
    const reg = () => store.get('extensions', []);
    const save = list => store.set('extensions', list);

    async function loadInto(ses, entry) {
        const api = ses.extensions && ses.extensions.loadExtension ? ses.extensions : ses;
        try {
            const already = (api.getAllExtensions ? api.getAllExtensions() : []).find(x => x.id === entry.id);
            if (already) return already;
            return await api.loadExtension(entry.path, { allowFileAccess: false });
        } catch (e) { entry.error = String(e && e.message || e); return null; }
    }
    async function unloadFrom(ses, id) {
        const api = ses.extensions && ses.extensions.removeExtension ? ses.extensions : ses;
        try { api.removeExtension(id); } catch (e) { /* not loaded there */ }
    }

    async function download(id) {
        const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${chromeVersion}&acceptformat=crx2,crx3&x=${encodeURIComponent('id=' + id + '&uc')}`;
        const res = await net.fetch(url, { redirect: 'follow' });
        if (!res.ok) throw new Error('The Chrome Web Store did not return a package (HTTP ' + res.status + ')');
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) throw new Error('The Chrome Web Store did not return a package. The item may be unavailable in your region.');
        if (buf.length > 120 * 1024 * 1024) throw new Error('Package is too large');
        return buf;
    }

    return {
        extractId,
        list() { return reg().map(e => ({ id: e.id, name: e.name, version: e.version, enabled: e.enabled, error: e.error || null, popup: e.popup || null, kind: 'extension' })); },
        async install(input, { sessions } = {}) {
            const id = extractId(input);
            if (!id) throw new Error('That is not a Chrome Web Store link or extension ID');
            const buf = await download(id);
            const tmp = path.join(dir, id + '.tmp');
            fs.rmSync(tmp, { recursive: true, force: true });
            extractZip(crxToZip(buf), tmp);
            const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
            const name = resolveMsg(tmp, manifest, manifest.name) || id;
            if (manifest.theme) {
                const theme = readTheme(tmp, manifest);
                fs.rmSync(tmp, { recursive: true, force: true });
                return { kind: 'theme', id, name, theme };
            }
            const final = path.join(dir, id);
            fs.rmSync(final, { recursive: true, force: true });
            fs.renameSync(tmp, final);
            const act = manifest.action || manifest.browser_action || manifest.page_action || {};
            const entry = { id, name, version: manifest.version, enabled: true, path: final, popup: act.default_popup || null, mv: manifest.manifest_version };
            const list = reg().filter(e => e.id !== id); list.push(entry); save(list);
            for (const ses of (sessions || [])) await loadInto(ses, entry);
            return { kind: 'extension', id, name, version: manifest.version, mv: manifest.manifest_version };
        },
        async loadAllInto(ses) { for (const e of reg()) if (e.enabled) await loadInto(ses, e); save(reg()); },
        async setEnabled(id, on, sessions) {
            const list = reg(); const e = list.find(x => x.id === id); if (!e) return false;
            e.enabled = !!on; save(list);
            for (const ses of sessions) { on ? await loadInto(ses, e) : await unloadFrom(ses, id); }
            return true;
        },
        async remove(id, sessions) {
            const list = reg(); const e = list.find(x => x.id === id); if (!e) return false;
            for (const ses of sessions) await unloadFrom(ses, id);
            fs.rmSync(e.path, { recursive: true, force: true });
            save(list.filter(x => x.id !== id));
            return true;
        },
        openPopup(id, partition, parentWin, sessionMod) {
            const e = reg().find(x => x.id === id);
            if (!e || !e.popup) return false;
            const { BrowserWindow } = require('electron');
            const ses = sessionMod.fromPartition(/^persist:ws-/.test(partition || '') ? partition : 'persist:ws-default');
            const w = new BrowserWindow({ parent: parentWin, width: 380, height: 560, show: false, frame: false, resizable: true, skipTaskbar: true, backgroundColor: '#ffffff', webPreferences: { session: ses, contextIsolation: true, sandbox: true } });
            const b = parentWin.getBounds();
            w.setPosition(b.x + b.width - 420, b.y + 90);
            w.loadURL(`chrome-extension://${id}/${e.popup.replace(/^\//, '')}`);
            w.once('ready-to-show', () => w.show());
            w.on('blur', () => { if (!w.isDestroyed()) w.close(); });
            return true;
        }
    };
}

module.exports = { createExtensions, extractId, readTheme };
