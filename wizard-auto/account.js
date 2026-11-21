/**
 * account.js — Wizard Ecosystem account authentication.
 *
 * SCOPE — read this before extending this file:
 *   This module ONLY handles signing in/out against the existing Wizard
 *   Ecosystem backend (register, verify, login, logout, check-auth). It
 *   does NOT upload, sync, or otherwise transmit anything from Autopilot's
 *   local memory.json, vault, goals, or advanced/max proactivity logs to
 *   this or any server. If that's ever wanted, it should be a separate,
 *   explicitly-scoped feature — bundling it into "account sync" here would
 *   silently reverse the local-first design the rest of this app is built
 *   around, and that's a decision worth making on purpose, not by default.
 *
 * SECURITY MODEL:
 *   - Flask's session is a signed cookie; this module maintains a small
 *     cookie jar exactly the way a browser would (absorb Set-Cookie,
 *     resend Cookie) so the multi-step register→verify flow (which
 *     depends on a server-side session value between requests) works.
 *   - The session cookie is persisted ONLY via safeStorage (OS-level
 *     encryption — same mechanism as vault.js), in its own file, never in
 *     memory.json. If encryption isn't available on this system, the
 *     session simply isn't persisted across restarts rather than falling
 *     back to plaintext.
 *   - Passwords pass through exactly once, in the outgoing request body,
 *     and are never written to disk, telemetry, or logs by this module.
 *   - Every function here is meant to be called from a dedicated Account
 *     settings form via direct IPC — never through chat/LLM input, same
 *     principle as vault credential entry.
 */

'use strict';

const { app, safeStorage } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

let _dir = null;
function ACCOUNT_DIR() {
    if (_dir) return _dir;
    try { _dir = path.join(app.getPath('userData'), 'account'); }
    catch { _dir = path.join(os.homedir(), '.wizard', 'account'); }
    try { fs.mkdirSync(_dir, { recursive: true, mode: 0o700 }); } catch { }
    return _dir;
}
function SESSION_FILE() { return path.join(ACCOUNT_DIR(), 'session.enc'); }

const WIZARD_ACCOUNT_HOST = 'arnav0928.pythonanywhere.com';

let cookieJar = {};   // cookie name -> value
let cachedUser = null; // last-known user object from the server, for display only

function sessionEncryptionAvailable() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function loadSession() {
    if (!fs.existsSync(SESSION_FILE())) return;
    try {
        const enc = fs.readFileSync(SESSION_FILE());
        const json = JSON.parse(safeStorage.decryptString(enc));
        cookieJar = json.cookies || {};
        cachedUser = json.user || null;
    } catch (e) {
        console.error('[Account] Failed to load stored session — starting logged out:', e.message);
        cookieJar = {}; cachedUser = null;
    }
}
function saveSession() {
    if (!sessionEncryptionAvailable()) return; // never fall back to plaintext
    try {
        const json = JSON.stringify({ cookies: cookieJar, user: cachedUser });
        fs.writeFileSync(SESSION_FILE(), safeStorage.encryptString(json), { mode: 0o600 });
    } catch (e) { console.error('[Account] Failed to persist session:', e.message); }
}
function clearSession() {
    cookieJar = {}; cachedUser = null;
    try { if (fs.existsSync(SESSION_FILE())) fs.unlinkSync(SESSION_FILE()); } catch { }
}

function cookieHeader() {
    return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorbSetCookie(headers) {
    const sc = headers['set-cookie'];
    if (!sc) return;
    const arr = Array.isArray(sc) ? sc : [sc];
    for (const line of arr) {
        const kv = line.split(';')[0];
        const idx = kv.indexOf('=');
        if (idx === -1) continue;
        cookieJar[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
    }
}

function apiRequest(pathName, method, bodyObj) {
    return new Promise(resolve => {
        const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
        const opts = {
            hostname: WIZARD_ACCOUNT_HOST, port: 443, path: pathName, method,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
        };
        const ck = cookieHeader();
        if (ck) opts.headers['Cookie'] = ck;

        const req = https.request(opts, res => {
            absorbSetCookie(res.headers);
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                let json;
                try { json = JSON.parse(raw); } catch { json = { error: `Unexpected response (status ${res.statusCode})` }; }
                resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body: json });
            });
        });
        req.on('error', e => resolve({ status: 0, ok: false, body: { error: e.message } }));
        req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, ok: false, body: { error: 'Request timed out' } }); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

// ── Public API ──────────────────────────────────────────────────────────

async function registerInit({ email, firstName, lastName, password } = {}) {
    return apiRequest('/api/register/init', 'POST', { email, firstName, lastName, password });
}
async function registerVerify({ email, code } = {}) {
    const r = await apiRequest('/api/register/verify', 'POST', { email, code });
    if (r.ok && r.body && r.body.user) { cachedUser = r.body.user; saveSession(); }
    return r;
}
async function resendCode() {
    return apiRequest('/api/resend-code', 'POST', {});
}
async function login({ email, password } = {}) {
    const r = await apiRequest('/api/login', 'POST', { email, password });
    if (r.ok && r.body && r.body.user) { cachedUser = r.body.user; saveSession(); }
    return r;
}
async function logout() {
    const r = await apiRequest('/api/logout', 'POST', {});
    clearSession();
    return r;
}
async function checkAuth() {
    const r = await apiRequest('/api/check-auth', 'GET', null);
    if (r.ok && r.body && r.body.authenticated) { cachedUser = r.body.user; saveSession(); }
    else if (r.status === 401) { clearSession(); }
    return r;
}
function getCachedUser() { return cachedUser; }
function isLoggedIn() { return !!cachedUser; }

function wireAccountIPC(ipcMain) {
    ipcMain.handle('account-register-init', (_e, data) => registerInit(data));
    ipcMain.handle('account-register-verify', (_e, data) => registerVerify(data));
    ipcMain.handle('account-resend-code', () => resendCode());
    ipcMain.handle('account-login', (_e, data) => login(data));
    ipcMain.handle('account-logout', () => logout());
    ipcMain.handle('account-check-auth', () => checkAuth());
    ipcMain.handle('account-get-cached-user', () => getCachedUser());
}

module.exports = {
    loadSession, saveSession, clearSession,
    registerInit, registerVerify, resendCode, login, logout, checkAuth,
    getCachedUser, isLoggedIn, wireAccountIPC
};