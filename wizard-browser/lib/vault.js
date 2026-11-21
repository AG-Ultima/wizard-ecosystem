'use strict';
// Saved passwords. Secrets are encrypted at rest:
//   - "ss:" prefix = Electron safeStorage (GNOME Keyring / KWallet / libsecret on Linux).
//   - "aes:" prefix = AES-256-GCM with a random key file (0600) next to the vault. Used only when
//     the desktop has no keyring, so passwords are never plain text on disk. Weaker, and flagged.
// The renderer never receives a password unless the user explicitly reveals or copies one.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createVault({ store, dir, safeStorage }) {
    const keyFile = path.join(dir, 'vault.key');
    let key = null;

    function fallbackKey() {
        if (key) return key;
        try { key = fs.readFileSync(keyFile); if (key.length === 32) return key; } catch (e) { /* create below */ }
        key = crypto.randomBytes(32);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(keyFile, key, { mode: 0o600 });
        return key;
    }
    const useSystem = () => { try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch (e) { return false; } };

    function encrypt(text) {
        if (useSystem()) return 'ss:' + safeStorage.encryptString(text).toString('base64');
        const iv = crypto.randomBytes(12);
        const c = crypto.createCipheriv('aes-256-gcm', fallbackKey(), iv);
        const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
        return 'aes:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    }
    function decrypt(blob) {
        if (blob.startsWith('ss:')) return safeStorage.decryptString(Buffer.from(blob.slice(3), 'base64'));
        if (blob.startsWith('aes:')) {
            const raw = Buffer.from(blob.slice(4), 'base64');
            const d = crypto.createDecipheriv('aes-256-gcm', fallbackKey(), raw.subarray(0, 12));
            d.setAuthTag(raw.subarray(12, 28));
            return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
        }
        throw new Error('Unknown secret format');
    }

    const data = () => {
        const d = store.get('vault', null);
        if (d && Array.isArray(d.entries)) return d;
        const fresh = { entries: [], never: [] };
        store.set('vault', fresh);
        return fresh;
    };
    const persist = () => store.set('vault', data());
    const id = () => crypto.randomBytes(8).toString('hex');
    const cleanHost = h => String(h || '').toLowerCase().replace(/^www\./, '');

    return {
        storage: () => (useSystem() ? 'system' : 'fallback'),
        list() { return data().entries.map(e => ({ id: e.id, host: e.host, username: e.username, date: e.date })); },
        forHost(host) { const h = cleanHost(host); return data().entries.filter(e => e.host === h).map(e => ({ id: e.id, username: e.username })); },
        // Returns "added", "updated" or "same".
        save({ host, username, password }) {
            const h = cleanHost(host);
            if (!h || !username || !password) return 'invalid';
            const d = data();
            const existing = d.entries.find(e => e.host === h && e.username === username);
            if (existing) {
                if (decrypt(existing.secret) === password) return 'same';
                existing.secret = encrypt(password); existing.date = Date.now(); persist();
                return 'updated';
            }
            d.entries.push({ id: id(), host: h, username, secret: encrypt(password), date: Date.now() });
            persist();
            return 'added';
        },
        reveal(entryId) { const e = data().entries.find(x => x.id === entryId); return e ? { host: e.host, username: e.username, password: decrypt(e.secret) } : null; },
        remove(entryId) { const d = data(); const n = d.entries.length; d.entries = d.entries.filter(e => e.id !== entryId); persist(); return d.entries.length !== n; },
        clear() { const d = data(); d.entries = []; persist(); },
        isNever(host) { return data().never.includes(cleanHost(host)); },
        addNever(host) { const d = data(); const h = cleanHost(host); if (!d.never.includes(h)) { d.never.push(h); persist(); } },
        // CSV in the format Chrome/Brave/Vivaldi export: name,url,username,password
        importCsv(text) {
            const rows = parseCsv(text);
            if (rows.length < 2) return 0;
            const head = rows[0].map(c => c.trim().toLowerCase());
            const iUrl = head.findIndex(c => c === 'url' || c === 'origin' || c === 'login_uri');
            const iUser = head.findIndex(c => c === 'username' || c === 'login_username' || c === 'user');
            const iPass = head.findIndex(c => c === 'password' || c === 'login_password');
            if (iUrl < 0 || iUser < 0 || iPass < 0) return 0;
            let n = 0;
            for (const r of rows.slice(1)) {
                let host = r[iUrl] || '';
                try { host = new URL(/^[a-z]+:\/\//i.test(host) ? host : 'https://' + host).hostname; } catch (e) { continue; }
                const res = this.save({ host, username: r[iUser], password: r[iPass] });
                if (res === 'added' || res === 'updated') n++;
            }
            return n;
        },
        exportCsv() {
            const q = s => '"' + String(s).replace(/"/g, '""') + '"';
            return 'name,url,username,password\n' + data().entries.map(e => [e.host, 'https://' + e.host, e.username, decrypt(e.secret)].map(q).join(',')).join('\n') + '\n';
        }
    };
}

// Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF).
function parseCsv(text) {
    const rows = []; let row = [], field = '', quoted = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quoted) {
            if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && s[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

module.exports = { createVault, parseCsv };
