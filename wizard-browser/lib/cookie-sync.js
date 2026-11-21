'use strict';
// Keeps the Wizard backend's login cookie identical in every persistent session (account, each
// workspace, panels). Sign in once, anywhere, and the other tabs and panels are signed in too;
// sign out anywhere and they all are. Only cookies of the Wizard API host are mirrored, and
// private tabs (non-persistent sessions) are never touched.

function createCookieSync({ host, enabled, onChange }) {
    const sessions = [];            // { ses, name }
    const busy = new Map();         // cookie key@session -> value we are writing (loop guard)
    const matches = c => { const d = String(c.domain || '').replace(/^\./, '').toLowerCase(); return d === host || host.endsWith('.' + d) || d.endsWith('.' + host); };
    const key = c => `${c.domain}|${c.path}|${c.name}`;
    const urlOf = c => `http${c.secure ? 's' : ''}://${String(c.domain).replace(/^\./, '')}${c.path || '/'}`;

    async function put(ses, c) {
        const k = key(c) + '@' + sessions.findIndex(s => s.ses === ses);
        busy.set(k, c.value);
        try {
            const details = { url: urlOf(c), name: c.name, value: c.value, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: c.sameSite || 'unspecified' };
            if (!c.hostOnly) details.domain = c.domain;
            if (c.expirationDate) details.expirationDate = c.expirationDate;
            await ses.cookies.set(details);
        } catch (e) { /* ignore a cookie the target refuses */ }
        setTimeout(() => busy.delete(k), 200);
    }
    async function drop(ses, c) {
        const k = key(c) + '@' + sessions.findIndex(s => s.ses === ses);
        busy.set(k, undefined);
        try { await ses.cookies.remove(urlOf(c), c.name); } catch (e) { /* already gone */ }
        setTimeout(() => busy.delete(k), 200);
    }
    async function list(ses) { try { return (await ses.cookies.get({})).filter(matches); } catch (e) { return []; } }

    async function reconcile() {
        if (!enabled()) return;
        const best = new Map();
        for (const s of sessions) for (const c of await list(s.ses)) {
            const cur = best.get(key(c));
            if (!cur || (c.expirationDate || 0) > (cur.expirationDate || 0)) best.set(key(c), c);
        }
        for (const s of sessions) {
            const have = new Map((await list(s.ses)).map(c => [key(c), c]));
            for (const [k, c] of best) { const h = have.get(k); if (!h || h.value !== c.value) await put(s.ses, c); }
        }
    }

    function attach(ses, name) {
        if (sessions.some(s => s.ses === ses)) return;
        sessions.push({ ses, name });
        ses.cookies.on('changed', async (e, cookie, cause, removed) => {
            if (!matches(cookie)) return;
            const mine = key(cookie) + '@' + sessions.findIndex(s => s.ses === ses);
            if (busy.has(mine) && busy.get(mine) === (removed ? undefined : cookie.value)) return;
            if (name === 'persist:wizard-account' && onChange) onChange();
            if (!enabled()) return;
            if (removed) {
                if (cause !== 'explicit' && cause !== 'expired_overwrite') return;   // plain overwrites (cookie refresh) are not a sign-out
                for (const s of sessions) if (s.ses !== ses) await drop(s.ses, cookie);
            } else {
                for (const s of sessions) if (s.ses !== ses) await put(s.ses, cookie);
            }
        });
        reconcile();
    }
    return { attach, reconcile, _sessions: sessions };
}

module.exports = { createCookieSync };
