const Module = require('module'), path = require('path'), os = require('os'), fs = require('fs'), assert = require('assert'), { EventEmitter } = require('events');
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'wbm-'));
const handlers = {}, switches = [], ses = {}, created = [];
class Win extends EventEmitter { constructor(o) { super(); this.opts = o; this.webContents = new EventEmitter(); this.webContents.isDestroyed = () => false; this.webContents.send = (...a) => (this.sent = this.sent || []).push(a); this.webContents.setWindowOpenHandler = f => { this.webContents.woh = f; }; created.push(this); }
  loadFile() {} once(ev, f) { if (ev === 'ready-to-show') f(); return this; } show() {} maximize() {} isMaximized() { return false; } isMinimized() { return false; } isFullScreen() { return false; } isDestroyed() { return false; } getBounds() { return { x: 0, y: 0, width: 1000, height: 700 }; } isFocused() { return true; } }
const mkSes = () => { const s = { cookies: Object.assign(new EventEmitter(), { get: async () => [], set: async () => {}, remove: async () => {} }), webRequest: { onBeforeRequest(f) { s.obr = f; }, onBeforeSendHeaders(f) { s.obsh = f; } }, setUserAgent(u) { s.ua = u; }, getUserAgent: () => 'Mozilla/5.0 X11; Linux Chrome/142 Electron/39.0.0 wizard-browser/11.0.0 Safari/537.36', setPermissionRequestHandler(f) { s.prh = f; }, setPermissionCheckHandler() {}, on() {}, fetch: async () => ({ status: 200, ok: true, json: async () => ({ ok: 1 }) }) }; return s; };
const app = Object.assign(new EventEmitter(), { commandLine: { appendSwitch: (...a) => switches.push(a) }, setDesktopName() {}, setName() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getPath: n => n === 'downloads' ? '/dl' : ud, getVersion: () => '11.0.0', isDefaultProtocolClient: () => false, quit() {}, setAsDefaultProtocolClient: () => true });
const electron = { app, BrowserWindow: Win, Menu: Object.assign(function () { this.append = () => {}; this.popup = () => {}; }, { setApplicationMenu() {} }), MenuItem: function (o) { Object.assign(this, o); }, ipcMain: { handle: (c, f) => { handlers[c] = f; } }, session: { fromPartition: p => ses[p] || (ses[p] = mkSes()), defaultSession: mkSes() }, shell: { openExternal: async u => (electron.opened = u) }, safeStorage: { isEncryptionAvailable: () => false }, clipboard: {}, dialog: {}, nativeTheme: {}, net: {}, webContents: { fromId: () => null } };
const orig = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : orig.call(this, r, ...a); };
process.env.XDG_CURRENT_DESKTOP = 'KDE'; process.env.KDE_SESSION_VERSION = '6'; process.platform === 'linux' || console.log('not linux');
require('/home/claude/wizard-ai/browser/main.js');
(async () => {
  await new Promise(r => setTimeout(r, 50));
  const win = created[0]; assert(win, 'window created'); assert.strictEqual(win.opts.frame, false, 'frameless'); assert.strictEqual(win.opts.webPreferences.contextIsolation, true); assert.strictEqual(win.opts.webPreferences.nodeIntegration, false); assert(win.opts.icon.endsWith('icons/icon-512.png'));
  assert(switches.some(s => s[0] === 'ozone-platform-hint'), 'wayland hint'); assert(switches.some(s => s[0] === 'password-store' && s[1] === 'kwallet6'), 'kwallet6');
  const call = async (c, ...a) => handlers[c]({ sender: win.webContents }, ...a);
  await assert.rejects((async () => handlers['store:get']({ sender: {} }, 'settings'))(), /forbidden/);
  await assert.rejects(call('store:get', '../../etc'), /bad key/);
  const s = await call('store:get', 'settings'); assert.strictEqual(s.searchEngine, 'wizard'); assert.strictEqual(s.tabLayout, 'top');
  await call('store:set', 'bookmarks', [{ url: 'x' }]); assert.deepStrictEqual(await call('store:get', 'bookmarks', []), [{ url: 'x' }]);
  await assert.rejects(call('api', 'GET', 'https://evil.com/x'), /bad path/); await assert.rejects(call('api', 'GET', '/api/../admin'), /bad path/); await assert.rejects(call('api', 'PATCH', '/api/x'), /bad method/);
  assert.strictEqual((await call('api', 'GET', '/api/check-auth')).status, 200);
  // vault round trip through IPC
  assert.strictEqual(await call('vault:save', { host: 'a.com', username: 'u', password: 'p' }), 'added'); const l = await call('vault:list'); assert.strictEqual((await call('vault:reveal', l[0].id)).password, 'p');
  assert.strictEqual(await call('vault:fill', 1, l[0].id), false, 'fill with no webview refuses');
  // webview attach hardening
  const prefs = { nodeIntegration: true, preload: '/evil.js', preloadURL: 'file:///evil.js', contextIsolation: false }; let prevented = false;
  win.webContents.emit('will-attach-webview', { preventDefault() { prevented = true; } }, prefs, { partition: 'persist:ws-work', src: 'javascript:alert(1)' });
  assert(!prevented); assert.strictEqual(prefs.nodeIntegration, false); assert.strictEqual(prefs.contextIsolation, true); assert(prefs.preload.endsWith('webview-preload.js')); assert.strictEqual(prefs.preloadURL, undefined);
  prevented = false; win.webContents.emit('will-attach-webview', { preventDefault() { prevented = true; } }, {}, { partition: 'persist:../../evil' }); assert(prevented, 'bad partition refused');
  const params = { partition: 'private-abc123', src: 'file:///etc/passwd' }; win.webContents.emit('will-attach-webview', { preventDefault() {} }, {}, params); assert.strictEqual(params.src, 'file:///etc/passwd'); // file allowed only for explicit user navigation
  // session behaviour
  const w = ses['persist:ws-work']; assert(w.ua && !/Electron|wizard-browser/i.test(w.ua), 'UA cleaned: ' + w.ua);
  let res; w.obr({ url: 'https://stats.g.doubleclick.net/a.js', resourceType: 'script', referrer: 'https://news.example/', webContentsId: 5 }, r => res = r); assert.strictEqual(res.cancel, true, 'ad blocked');
  w.obr({ url: 'https://news.example/app.js', resourceType: 'script', referrer: 'https://news.example/' }, r => res = r); assert.deepStrictEqual(res, {});
  await call('store:set', 'settings', { adblock: false }); w.obr({ url: 'https://stats.g.doubleclick.net/a.js', resourceType: 'script', referrer: 'https://news.example/' }, r => res = r); assert.deepStrictEqual(res, {}, 'adblock toggle');
  let h; w.obsh({ requestHeaders: {} }, r => h = r.requestHeaders); assert.strictEqual(h['Sec-GPC'], '1');
  let granted; w.prh({ getURL: () => 'https://x.com' }, 'fullscreen', g => granted = g, {}); await new Promise(r => setTimeout(r, 5)); assert.strictEqual(granted, true);
  w.prh({ getURL: () => 'https://x.com' }, 'usb', g => granted = g, {}); await new Promise(r => setTimeout(r, 5)); assert.strictEqual(granted, false, 'unknown permissions denied');
  // protected content: DRM permission follows the Settings switch with no prompt; status is reported
  w.prh({ getURL: () => 'https://www.netflix.com' }, 'mediaKeySystem', g => granted = g, {}); await new Promise(r => setTimeout(r, 5)); assert.strictEqual(granted, true, 'DRM allowed by default');
  await call('store:set', 'settings', { drm: false }); w.prh({ getURL: () => 'https://www.netflix.com' }, 'mediaKeySystem', g => granted = g, {}); await new Promise(r => setTimeout(r, 5)); assert.strictEqual(granted, false, 'DRM refused when switched off'); await call('store:set', 'settings', { drm: true });
  const dst = await call('drm:status'); assert.strictEqual(dst.supported, false, 'stock Electron reports no Widevine'); assert.strictEqual(dst.state, 'missing');
  // popup + external handling
  const wc = new EventEmitter(); wc.getType = () => 'webview'; wc.hostWebContents = win.webContents; wc.id = 9; wc.setWindowOpenHandler = f => { wc.woh = f; }; wc.getURL = () => 'https://x.com';
  app.emit('web-contents-created', {}, wc);
  assert.deepStrictEqual(wc.woh({ url: 'javascript:alert(1)', disposition: 'foreground-tab' }), { action: 'deny' });
  assert.strictEqual(wc.woh({ url: 'https://y.com', disposition: 'foreground-tab' }).action, 'deny'); assert.deepStrictEqual(win.sent.pop(), ['open-tab', { url: 'https://y.com', background: false, from: 9 }]);
  assert.strictEqual(wc.woh({ url: 'https://pay.com', disposition: 'new-window', features: 'width=500,height=600' }).action, 'allow');
  let pd = false; wc.emit('will-navigate', { preventDefault() { pd = true; } }, 'zoommtg://join'); assert(pd, 'unknown scheme not navigated');
  wc.emit('before-input-event', { preventDefault() { pd = 'sc'; } }, { type: 'keyDown', key: 't', control: true }); assert.strictEqual(pd, 'sc'); assert.deepStrictEqual(win.sent.pop(), ['shortcut', 'new-tab']);
  assert.strictEqual(await call('app:openExternal', 'file:///etc/passwd'), false); await call('app:openExternal', 'mailto:a@b.c'); assert.strictEqual(electron.opened, 'mailto:a@b.c');
  assert.strictEqual((await call('app:ready')).length, 0);
  console.log('main smoke: ok');
  process.exit(0);
})().catch(e => { console.error('main smoke FAIL', e); process.exit(1); });
