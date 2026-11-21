'use strict';
// Runs inside every web page (isolated world, sandboxed). It does two small things:
//  1. notices login forms so the browser can offer to save / fill a password,
//  2. reports page facts (selected text, article text on request) back to the UI.
// It exposes nothing to the page itself.
const { ipcRenderer } = require('electron');

function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
function findFields(root) {
    const pw = [...(root || document).querySelectorAll('input[type=password]')].filter(visible);
    if (!pw.length) return null;
    const pass = pw[0];
    const scope = pass.form || document;
    const cands = [...scope.querySelectorAll('input[type=text],input[type=email],input[type=tel],input:not([type])')].filter(visible);
    // The username field is the closest text-like input before the password field.
    let user = null;
    for (const c of cands) { if (c.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING) user = c; }
    return { pass, user };
}

let lastReport = '';
function report() {
    const f = findFields();
    const has = !!f;
    const key = location.href + ':' + has;
    if (key === lastReport) return;
    lastReport = key;
    ipcRenderer.sendToHost('wb:forms', { hasLogin: has });
}
let t = null;
const schedule = () => { clearTimeout(t); t = setTimeout(report, 400); };
window.addEventListener('DOMContentLoaded', () => { report(); new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true }); });

let sent = '';
function captureLogin() {
    const f = findFields();
    if (!f || !f.pass.value) return;
    const username = f.user ? f.user.value : '';
    const payload = { host: location.hostname, username, password: f.pass.value };
    const sig = payload.host + '|' + username + '|' + payload.password.length;
    if (sig === sent) return;
    sent = sig;
    ipcRenderer.sendToHost('wb:login', payload);
}
document.addEventListener('submit', captureLogin, true);
document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button,input[type=submit],[role=button]');
    if (b && findFields()) captureLogin();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.type === 'password') captureLogin(); }, true);

function setValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);                                    // works with React/Vue controlled inputs
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}
ipcRenderer.on('wb:fill', (e, { username, password }) => {
    const f = findFields();
    if (!f) return;
    if (f.user && username) setValue(f.user, username);
    setValue(f.pass, password);
});

// Readable text of the page for "summarize this page" (only on request from the UI).
ipcRenderer.on('wb:extract', (e, id) => {
    let root = document.querySelector('article, main, [role=main]') || document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,nav,footer,aside,form,iframe,svg,[aria-hidden=true]').forEach(n => n.remove());
    const text = (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
    ipcRenderer.sendToHost('wb:extracted', { id, title: document.title, text: text.slice(0, 12000) });
});

// Scroll position (0..1) so the browser can draw a thin reading-progress line.
{ let pend = false; const send = () => { pend = false; const d = document.scrollingElement || document.documentElement; const max = d.scrollHeight - d.clientHeight; ipcRenderer.sendToHost('wb:scroll', max > 200 ? d.scrollTop / max : 0); };
  addEventListener('scroll', () => { if (!pend) { pend = true; setTimeout(send, 120); } }, { passive: true, capture: true }); }

// Ctrl + mouse wheel (and touchpad pinch) zooms the page. Pages swallow these events, so the UI never sees them.
let zoomAt = 0;
window.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const now = Date.now(); if (now - zoomAt < 70) return; zoomAt = now;
    if (e.deltaY) ipcRenderer.sendToHost('wb:zoom', e.deltaY < 0 ? 1 : -1);
}, { passive: false, capture: true });
