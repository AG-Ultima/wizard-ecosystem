/**
 * vault.js — Wizard Autopilot credential vault
 *
 * SECURITY MODEL (read before touching this file):
 *   - Values here are NEVER put into an LLM prompt, NEVER logged (telLog,
 *     console, macro recording), and NEVER returned in an IPC payload to
 *     the renderer in plaintext except the one masked listing function.
 *   - The action schema only ever carries a SITE KEY (e.g. "amazon.com"),
 *     never a username/password/card number. dispatch() resolves the
 *     site key to real values internally, at the moment of autofill.
 *   - Encryption is Electron's safeStorage: Keychain (mac) / DPAPI (win) /
 *     libsecret (linux). If safeStorage isn't available (unsupported
 *     platform/headless), the vault refuses to store anything rather
 *     than silently falling back to plaintext.
 *   - Autofill is allowlisted per-entry: saving a credential for
 *     "amazon.com" will NOT autofill on "amazon-support.com" or any
 *     other domain, even a close lookalike. Match is exact hostname or
 *     explicit subdomain suffix the user approved.
 *   - This module never submits a form. It fills fields and stops.
 *     The human clicks Buy / Sign in / Submit.
 */

'use strict';

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

let _dir = null;
function VAULT_DIR() {
    if (_dir) return _dir;
    try { _dir = path.join(app.getPath('userData'), 'vault'); }
    catch { _dir = path.join(require('os').homedir(), '.wizard', 'vault'); }
    try { fs.mkdirSync(_dir, { recursive: true, mode: 0o700 }); } catch { }
    return _dir;
}
function VAULT_FILE() { return path.join(VAULT_DIR(), 'vault.enc'); }

// In-memory decrypted cache for this session only — never written to disk plaintext.
let _cache = null;

function vaultAvailable() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function loadRaw() {
    if (_cache) return _cache;
    if (!fs.existsSync(VAULT_FILE())) { _cache = { entries: {} }; return _cache; }
    try {
        const enc = fs.readFileSync(VAULT_FILE());
        const json = safeStorage.decryptString(enc);
        _cache = JSON.parse(json);
    } catch (e) {
        console.error('[Vault] Failed to decrypt/parse vault file — refusing to guess. Error:', e.message);
        _cache = { entries: {} };
    }
    return _cache;
}

function saveRaw() {
    if (!vaultAvailable()) throw new Error('OS-level encryption is not available on this system — refusing to store credentials in plaintext.');
    const json = JSON.stringify(_cache || { entries: {} });
    const enc = safeStorage.encryptString(json);
    fs.writeFileSync(VAULT_FILE(), enc, { mode: 0o600 });
}

/**
 * Normalise a site input ("https://www.amazon.com/gp/cart") down to a
 * bare registrable-ish hostname key ("amazon.com"). Deliberately simple
 * (no public-suffix-list) — good enough to prevent obvious mismatches,
 * NOT a security boundary by itself. The allowlist check below is.
 */
function siteKey(input) {
    if (!input) return null;
    let s = String(input).trim().toLowerCase();
    try {
        if (!/^https?:\/\//.test(s)) s = 'https://' + s;
        const u = new URL(s);
        let host = u.hostname.replace(/^www\./, '');
        return host;
    } catch {
        return s.replace(/^www\./, '').split('/')[0];
    }
}

/**
 * Does `actualHost` (the page currently loaded in the browser view)
 * match the vault entry saved under `savedKey`? Exact match or a true
 * subdomain of it — never the reverse, never substring matching
 * (which would let "amazon.com.evil.tld" match "amazon.com").
 */
function hostMatchesEntry(actualHost, savedKey) {
    if (!actualHost || !savedKey) return false;
    actualHost = actualHost.replace(/^www\./, '').toLowerCase();
    savedKey = savedKey.replace(/^www\./, '').toLowerCase();
    return actualHost === savedKey || actualHost.endsWith('.' + savedKey);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Save a credential. `fields` is a free-form object, e.g.
 * { username, password } or { cardholder, number, exp, cvc, zip }.
 * Never pass this through the LLM — this is called from a dedicated
 * settings UI where the human types directly into fields that go
 * straight to this function, not through chat.
 */
function saveEntry({ label, site, kind, fields } = {}) {
    if (!vaultAvailable()) return { success: false, message: 'Encryption unavailable on this system — cannot store credentials.' };
    if (!site || !fields || typeof fields !== 'object') return { success: false, message: 'Missing site or fields.' };
    const key = siteKey(site);
    if (!key) return { success: false, message: 'Could not parse site.' };

    const data = loadRaw();
    const id = `${kind || 'login'}:${key}:${Date.now()}`;
    data.entries[id] = {
        id, label: label || key, site: key, kind: kind || 'login',
        fields, createdAt: Date.now()
    };
    saveRaw();
    return { success: true, message: `Saved ${kind || 'login'} for ${key}`, id };
}

function deleteEntry(id) {
    const data = loadRaw();
    if (!data.entries[id]) return { success: false, message: 'Not found' };
    delete data.entries[id];
    saveRaw();
    return { success: true, message: 'Deleted' };
}

/**
 * Masked listing for the settings UI — safe to send over IPC and render.
 * Never includes raw field values (passwords, card numbers).
 */
function listEntriesMasked() {
    const data = loadRaw();
    return Object.values(data.entries).map(e => ({
        id: e.id, label: e.label, site: e.site, kind: e.kind,
        fieldNames: Object.keys(e.fields || {}),
        createdAt: e.createdAt
    }));
}

/**
 * Resolve entries usable for autofill on a given page hostname.
 * Returns the SAME masked shape — never raw values — for confirmation
 * dialogs / UI. Raw values are only ever touched inside doAutofill().
 */
function findEntriesForHost(actualHost) {
    const data = loadRaw();
    return Object.values(data.entries)
        .filter(e => hostMatchesEntry(actualHost, e.site))
        .map(e => ({ id: e.id, label: e.label, site: e.site, kind: e.kind, fieldNames: Object.keys(e.fields || {}) }));
}

/**
 * Internal-only: get raw fields for a specific entry id, but ONLY if
 * actualHost matches the entry's allowlisted site. Throws otherwise.
 * This is the one function allowed to touch plaintext credential
 * values, and it must be called from main-process autofill code only
 * — never expose this function itself over IPC.
 */
function _resolveForAutofill(entryId, actualHost) {
    const data = loadRaw();
    const entry = data.entries[entryId];
    if (!entry) throw new Error('Vault entry not found');
    if (!hostMatchesEntry(actualHost, entry.site)) {
        throw new Error(`Refusing autofill: entry saved for "${entry.site}" does not match current page host "${actualHost}"`);
    }
    return entry.fields;
}

module.exports = {
    vaultAvailable,
    saveEntry,
    deleteEntry,
    listEntriesMasked,
    findEntriesForHost,
    _resolveForAutofill,
    siteKey,
};