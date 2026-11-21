// Injected before the page: a fake Electron bridge + a stub <webview>.
(() => {
  const handlers = {}; const db = { settings: {}, bookmarks: [], history: [], workspaces: null, panels: null, groups: [], sitesettings: {}, session: null };
  const vault = []; let vid = 1; const calls = []; window.__calls = calls;
  const reg = ch => cb => { (handlers[ch] = handlers[ch] || []).push(cb); return () => {}; };
  window.__emit = (ch, p) => (handlers[ch] || []).forEach(f => f(p));
  window.__db = db; window.__vault = vault;
  const notes = [{ id: 1, title: 'Old note', content: 'hello world' }];
  window.__user = window.__user === undefined ? { username: 'Arnav', email: 'a@b.c' } : window.__user;
  window.wb = {
    info: async () => ({ version: '11.0.0', platform: window.__platform || 'linux', overlay: !!window.__overlay, electron: '39', chrome: '142', wayland: true, vault: 'system', blockerSize: 300, downloads: '/home/u/Downloads', isDefault: false }),
    ready: async () => window.__urls || [], setDefault: async () => true, relaunch: async () => {}, openExternal: async () => {}, showItem: async () => {}, openPath: async () => {},
    store: { get: async (k, d) => { const v = db[k]; if (k === 'settings') return Object.assign({ theme: 'grimoire', adblock: true, searchEngine: 'wizard', tabLayout: window.__layout || 'top', sleepMinutes: 20, restoreSession: true, showBookmarksBar: true }, v); return v === undefined || v === null ? d : JSON.parse(JSON.stringify(v)); },
             set: async (k, v) => { calls.push(['store', k]); db[k] = k === 'settings' ? Object.assign({}, db.settings, v) : v; return true; } },
    win: { minimize: async () => calls.push(['min']), maximize: async () => calls.push(['max']), close: async () => calls.push(['close']), fullscreen: async v => calls.push(['fs', v]), state: async () => ({ maximized: false, fullscreen: false, focused: true }), overlay: async (c, sy) => { calls.push(['overlay', c, sy]); return true; }, material: async m => { calls.push(['material', m]); return true; }, login: async v => { calls.push(['login', v]); return !!v; }, defaultApps: async () => calls.push(['defapps']) },
    perm: { answer: async (id, a) => calls.push(['perm', id, a]), forget: async () => calls.push(['permforget']) },
    dl: { list: async () => ({}), cancel: async () => {}, pause: async () => {}, clear: async () => {} },
    vault: { list: async () => vault.map(v => ({ id: v.id, host: v.host, username: v.username })), forHost: async h => vault.filter(v => v.host === h).map(v => ({ id: v.id, username: v.username })),
             save: async e => { const x = vault.find(v => v.host === e.host && v.username === e.username); if (x) { x.password = e.password; return 'updated'; } vault.push({ id: 'v' + vid++, ...e }); return 'added'; },
             remove: async id => { const i = vault.findIndex(v => v.id === id); if (i >= 0) vault.splice(i, 1); }, clear: async () => {}, never: async h => calls.push(['never', h]), isNever: async () => false,
             reveal: async id => vault.find(v => v.id === id), fill: async (wc, id) => { calls.push(['fill', wc, id]); return true; }, importCsv: async () => 2, exportCsv: async () => true },
    importBookmarks: async () => [{ url: 'https://imp.example/a', title: 'Imported A', folder: 'Vivaldi' }, { url: 'https://imp.example/b', title: 'Imported B', folder: '' }],
    clearData: async (w, p) => calls.push(['clear', w, p]),
    api: async (m, p, b) => { calls.push(['api', m, p, b]);
      if (p === '/api/check-auth' && window.__authDelay) await new Promise(r => setTimeout(r, window.__authDelay));
      if (p === '/api/notes/ai' && /greeting line/.test(b.instruction||'')) return { ok: true, status: 200, data: { result: '"Good evening! Standup is at 11 PM."' } };
      if (p === '/api/check-auth') return window.__authFail ? { ok: false, status: window.__authFail, data: null } : window.__user ? { ok: true, status: 200, data: { authenticated: true, user: window.__user } } : { ok: false, status: 401, data: { authenticated: false } };
      if (p === '/api/login') return b.password === 'good' ? (window.__user = { username: 'Arnav', email: b.email }, { ok: true, status: 200, data: { success: true } }) : { ok: false, status: 401, data: { error: 'Invalid email or password' } };
      if (p === '/api/logout') return { ok: true, status: 200, data: {} };
      if (p === '/api/notes' && m === 'GET') return { ok: true, status: 200, data: { notes } };
      if (p === '/api/notes' && m === 'POST') { notes.unshift({ id: 2, title: b.title, content: b.content }); return { ok: true, status: 200, data: { note: {} } }; }
      if (p === '/api/notes/ai' && /You control a web browser/.test(b.instruction||'')) return { ok: true, status: 200, data: { result: 'Sure! ' + JSON.stringify(window.__plan) } };
      if (p === '/api/notes/ai' && /one plain sentence/.test(b.instruction||'')) return { ok: true, status: 200, data: { result: 'A page about tests.' } };
      if (p === '/api/notes/ai') return { ok: true, status: 200, data: { result: 'SUMMARY: ' + b.action + ' of ' + b.text.slice(0, 20) } };
      if (p.startsWith('/api/mail/emails')) return { ok: true, status: 200, data: { emails: [{ from: 'Ada Lovelace <ada@x.io>', subject: 'Engine notes', date: new Date().toISOString(), is_read: false }, { from: 'bob@x.io', subject: 'Lunch?', date: new Date().toISOString(), is_read: true }] } };
      if (p === '/api/calendar/events') { const t = new Date(); t.setHours(23, 0, 0, 0); const e = new Date(t.getTime() + 36e5); return { ok: true, status: 200, data: { events: [{ title: 'Standup', start: t.toISOString(), end: e.toISOString() }] } }; }
      if (p.startsWith('/api/heat/current')) return { ok: true, status: 200, data: { current: { temp: 81.4, condition: 'Sunny', feels_like: 83, uv_index: 6, humidity: 12 }, risk: { level: 'Moderate', color: '#e0b030' } } };
      if (p.startsWith('/api/firewatch/status')) return { ok: true, status: 200, data: { risk: { level: 'Low', color: '#5fd0a0' }, fires: [] } };
      if (p.startsWith('/api/finance/transactions')) return { ok: true, status: 200, data: { transactions: [{ amount: 40, category: 'Food', transaction_type: 'expense' }, { amount: 25, category: 'Fun', transaction_type: 'expense' }, { amount: 900, category: 'Pay', transaction_type: 'income' }] } };
      if (p === '/api/chat/poll') return { ok: true, status: 200, data: { unread_total: 3 } };
      if (p === '/api/browser/data') return { ok: true, status: 200, data: { bookmarks: [{ url: 'https://remote.example/', title: 'Remote' }], settings: { old: 1 }, tabGroups: [] } };
      if (p === '/api/browser/sync') return { ok: true, status: 200, data: { success: true } };
      return { ok: false, status: 404, data: null }; },
    blockedTotal: async () => 5,
    nav: { entries: async id => ({ index: 2, entries: [{ url: 'https://home.makemusic.com/learn', title: 'Learn' }, { url: 'https://asm.test/a', title: 'Assignment' }, { url: 'https://asm.test/b?done', title: 'After recording' }] }), goto: async (id, i) => { window.__calls.push(['goto', id, i]); return true; } },
    wallpaper: { get: async () => null, pick: async () => null, clear: async () => true },
    ext: { list: async () => [{ id: 'a'.repeat(32), name: 'Dark Reader', version: '4.9', enabled: true, popup: 'p.html' }], install: async x => { calls.push(['extinstall', x]); return x.includes('theme') ? { kind: 'theme', name: 'Nice Theme', theme: { colors: { frame: 'rgb(20,30,60)', toolbar: 'rgb(30,40,80)', button_background: 'rgb(255,100,0)' }, images: {} } } : { kind: 'extension', name: 'Ext X', version: '1' }; }, toggle: async () => true, remove: async () => true, popup: async () => true },
    drm: { status: async () => ({ supported: true, state: window.__drm || 'ready', version: '4.10.2891.0', error: '' }), recheck: async () => { window.__drm = 'ready'; return { supported: true, state: 'ready' }; } },
    linux: { status: async () => ({ installed: false, isDefault: false, appImage: true }), integrate: async () => ({ ok: true }) },
    on: { urls: reg('urls'), shortcut: reg('shortcut'), openTab: reg('openTab'), blocked: reg('blocked'), permission: reg('permission'), download: reg('download'), windowState: reg('windowState'), searchSelection: reg('searchSelection'), askSelection: reg('askSelection'), accountChanged: reg('accountChanged'), clipSelection: reg('clipSelection') }
  };
  let wcSeq = 100;
  class WV extends HTMLElement {
    connectedCallback() { if (this._init) return; this._init = true; this._hist = []; this._i = -1; this._wc = ++wcSeq; this.style.display = this.style.display || 'flex'; this._zoom = 0;
      setTimeout(() => { this.fire('dom-ready'); const s = this.getAttribute('src'); if (s) this._go(s, true); }, 5); }
    fire(n, props) { const e = new Event(n); Object.assign(e, props || {}); this.dispatchEvent(e); }
    _go(u, push) { if (push) { this._hist = this._hist.slice(0, this._i + 1); this._hist.push(u); this._i++; } this.setAttribute('data-url', u); this.fire('did-start-loading');
      setTimeout(() => { if (u.includes('fail.test')) { this.fire('did-fail-load', { isMainFrame: true, errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED', validatedURL: u }); this.fire('did-stop-loading'); return; }
        this.fire('did-navigate', { url: u }); this.fire('page-title-updated', { title: 'Title of ' + new URL(u).hostname }); if (u.includes('login.test')) this.fire('ipc-message', { channel: 'wb:forms', args: [{ hasLogin: true }] }); this.fire('did-stop-loading'); }, 5); }
    getWebContentsId() { return this._wc; } canGoBack() { return this._i > 0; } canGoForward() { return this._i < this._hist.length - 1; }
    goBack() { if (this.canGoBack()) { this._i--; this._go(this._hist[this._i]); } } goForward() { if (this.canGoForward()) { this._i++; this._go(this._hist[this._i]); } }
    loadURL(u) { this._go(u, true); } reload() { this._go(this._hist[this._i]); } stop() { this.fire('did-stop-loading'); } reloadIgnoringCache() { this.reload(); }
    findInPage(q) { window.__find = q; this.fire('found-in-page', { result: { matches: 3, activeMatchOrdinal: 1 } }); } stopFindInPage() { window.__find = null; }
    setZoomLevel(z) { this._zoom = z; window.__zoom = z; } setAudioMuted(m) { window.__muted = m; } print() { window.__printed = true; } openDevTools() { window.__devtools = true; } focus() {}
    send(ch, id) { window.__calls.push(['wvsend', ch]); if (ch === 'wb:extract') setTimeout(() => this.fire('ipc-message', { channel: 'wb:extracted', args: [{ id, title: 'T', text: 'This is the page text about wizards and spells. '.repeat(5) }] }), 5); }
  }
  customElements.define('wv-stub', WV);
  const ce = document.createElement.bind(document); document.createElement = (t, o) => ce(String(t).toLowerCase() === 'webview' ? 'wv-stub' : t, o);
})();
