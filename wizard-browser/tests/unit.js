const assert = require('assert'); const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const B = '/home/claude/wizard-ai/browser/lib/';
const { createBlocker, siteKey } = require(B + 'adblock'); const { createStore } = require(B + 'store'); const { createVault, parseCsv } = require(B + 'vault');
const { matchShortcut } = require(B + 'shortcuts'); const { urlsFromArgv, isSafeExternal, isHttpUrl } = require(B + 'urls'); const { crxToZip, extractZip } = require(B + 'crx'); const { extractId, readTheme } = require(B + 'extensions'); const { parseNetscape } = require(B + 'bookmarks'); const li = require(B + 'linux-integration');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wbu-'));
// adblock
const ab = createBlocker();
t('blocks listed third party', () => assert(ab.shouldBlock({ url: 'https://stats.g.doubleclick.net/x.js', resourceType: 'script', firstPartyUrl: 'https://news.example/' })));
t('never blocks main frame', () => assert(!ab.shouldBlock({ url: 'https://doubleclick.net/', resourceType: 'mainFrame' })));
t('first party exempt', () => assert(!ab.shouldBlock({ url: 'https://ads.doubleclick.net/', resourceType: 'script', firstPartyUrl: 'https://www.doubleclick.net/' })));
t('allows normal', () => assert(!ab.shouldBlock({ url: 'https://cdn.example.com/app.js', resourceType: 'script', firstPartyUrl: 'https://example.com/' })));
t('suffix not substring', () => assert(!ab.shouldBlock({ url: 'https://notdoubleclick.net/a.js', resourceType: 'script', firstPartyUrl: 'https://x.com/' })));
t('wizard apis never blocked', () => assert(!ab.shouldBlock({ url: 'https://arnav0928.pythonanywhere.com/api/x', resourceType: 'xhr', firstPartyUrl: 'https://wizardecosystem.dev/' })));
t('siteKey', () => { assert.strictEqual(siteKey('a.b.example.co.uk'), 'example.co.uk'); assert.strictEqual(siteKey('a.example.com'), 'example.com'); });
// store
t('store atomic roundtrip + corrupt', () => { const d = tmp(); const s = createStore(d, { delay: 0 }); s.set('a', { x: 1 }); const s2 = createStore(d, { delay: 0 }); assert.deepStrictEqual(s2.get('a', null), { x: 1 }); fs.writeFileSync(path.join(d, 'b.json'), '{bad'); assert.deepStrictEqual(createStore(d).get('b', 7), 7); assert(fs.readdirSync(d).some(f => f.includes('corrupt'))); assert.strictEqual(fs.statSync(path.join(d, 'a.json')).mode & 0o077, 0); });
// vault (both backends)
for (const mode of ['fallback', 'system']) t('vault ' + mode, () => {
  const d = tmp(); const store = createStore(d, { delay: 0 });
  const ss = mode === 'system' ? { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('E' + s), decryptString: b => b.toString().slice(1) } : null;
  const v = createVault({ store, dir: d, safeStorage: ss });
  assert.strictEqual(v.storage(), mode);
  assert.strictEqual(v.save({ host: 'www.Example.com', username: 'u', password: 'p1' }), 'added'); assert.strictEqual(v.save({ host: 'example.com', username: 'u', password: 'p1' }), 'same'); assert.strictEqual(v.save({ host: 'example.com', username: 'u', password: 'p2' }), 'updated');
  const raw = fs.readFileSync(path.join(d, 'vault.json'), 'utf8'); assert(!raw.includes('p2') && !raw.includes('p1'), 'plain text on disk');
  const id = v.list()[0].id; assert.strictEqual(v.reveal(id).password, 'p2'); assert.strictEqual(v.forHost('example.com').length, 1); assert(!('password' in v.forHost('example.com')[0]));
  assert.strictEqual(v.save({ host: '', username: 'u', password: 'x' }), 'invalid');
  v.addNever('news.test'); assert(v.isNever('www.news.test'));
  const csv = v.exportCsv(); const v2 = createVault({ store: createStore(tmp(), { delay: 0 }), dir: tmp(), safeStorage: ss }); assert.strictEqual(v2.importCsv(csv), 1); assert.strictEqual(v2.reveal(v2.list()[0].id).password, 'p2');
  assert(v.remove(id)); assert.strictEqual(v.list().length, 0);
  if (mode === 'fallback') { assert.strictEqual(fs.statSync(path.join(d, 'vault.key')).mode & 0o077, 0); const b = JSON.parse(fs.readFileSync(path.join(d, 'vault.json'))); }
});
t('vault tamper detected', () => { const d = tmp(); const s = createStore(d, { delay: 0 }); const v = createVault({ store: s, dir: d, safeStorage: null }); v.save({ host: 'a.com', username: 'u', password: 'secret' }); const j = JSON.parse(fs.readFileSync(path.join(d, 'vault.json'))); const raw = Buffer.from(j.entries[0].secret.slice(4), 'base64'); raw[raw.length - 1] ^= 1; j.entries[0].secret = 'aes:' + raw.toString('base64'); fs.writeFileSync(path.join(d, 'vault.json'), JSON.stringify(j)); const v2 = createVault({ store: createStore(d, { delay: 0 }), dir: d, safeStorage: null }); assert.throws(() => v2.reveal(v2.list()[0].id)); });
t('csv parser', () => assert.deepStrictEqual(parseCsv('a,b\r\n"x, ""y""",z\n'), [['a', 'b'], ['x, "y"', 'z']]));
t('chrome csv import', () => { const d = tmp(); const v = createVault({ store: createStore(d, { delay: 0 }), dir: d, safeStorage: null }); assert.strictEqual(v.importCsv('name,url,username,password\nGH,https://github.com/login,me,pw\nbad,,,\n'), 1); assert.strictEqual(v.forHost('github.com').length, 1); });
// shortcuts
const k = (key, o = {}) => matchShortcut({ type: 'keyDown', key, control: false, shift: false, alt: false, ...o });
t('shortcuts', () => { assert.strictEqual(k('t', { control: true }), 'new-tab'); assert.strictEqual(k('T', { control: true, shift: true }), 'reopen-tab'); assert.strictEqual(k('n', { control: true, shift: true }), 'new-private-tab'); assert.strictEqual(k('3', { control: true }), 'tab-3'); assert.strictEqual(k('2', { control: true, alt: true }), 'workspace-2'); assert.strictEqual(k('ArrowLeft', { alt: true }), 'back'); assert.strictEqual(k('F12'), 'devtools'); assert.strictEqual(k('Tab', { control: true, shift: true }), 'prev-tab'); });
t('ctrl+space conjures', () => { assert.strictEqual(k(' ', { control: true }), 'conjure'); assert.strictEqual(k(' ', {}), null); });
t('shortcuts leave typing alone', () => { for (const c of ['c', 'v', 'x', 'a', 'z', 'y']) assert.strictEqual(k(c, { control: true }), null); assert.strictEqual(k('a'), null); assert.strictEqual(k('t', { alt: true }), null); assert.strictEqual(matchShortcut({ type: 'keyUp', key: 't', control: true }), null); });
// urls
t('urls argv', () => { assert.deepStrictEqual(urlsFromArgv(['/app', '--no-sandbox', 'https://a.com/x', 'javascript:alert(1)', 'page.html'], '/home/u'), ['https://a.com/x', 'file:///home/u/page.html']); assert(isSafeExternal('mailto:a@b.c')); assert(!isSafeExternal('file:///etc/passwd')); assert(!isSafeExternal('javascript:1')); assert(!isHttpUrl('ftp://x')); });
// crx + zip
function makeZip(files) { const parts = [], cd = []; let off = 0; for (const [name, data] of Object.entries(files)) { const nb = Buffer.from(name), comp = zlib.deflateRawSync(Buffer.from(data)); const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(Buffer.byteLength(data), 22); h.writeUInt16LE(nb.length, 26); parts.push(h, nb, comp); const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(Buffer.byteLength(data), 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42); cd.push(c, nb); off += 30 + nb.length + comp.length; } const cdb = Buffer.concat(cd); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16); return Buffer.concat([...parts, cdb, e]); }
const crx3 = z => { const hdr = Buffer.from('hdrdata'); const h = Buffer.alloc(12); h.write('Cr24'); h.writeUInt32LE(3, 4); h.writeUInt32LE(hdr.length, 8); return Buffer.concat([h, hdr, z]); };
t('crx3 extract', () => { const d = tmp(); const z = makeZip({ 'manifest.json': '{"name":"X","version":"1"}', 'js/a.js': 'console.log(1)' }); extractZip(crxToZip(crx3(z)), d); assert.strictEqual(JSON.parse(fs.readFileSync(d + '/manifest.json')).name, 'X'); assert.strictEqual(fs.readFileSync(d + '/js/a.js', 'utf8'), 'console.log(1)'); });
t('crx2 header', () => { const z = makeZip({ 'm': 'x' }); const h = Buffer.alloc(16); h.write('Cr24'); h.writeUInt32LE(2, 4); h.writeUInt32LE(3, 8); h.writeUInt32LE(2, 12); assert.deepStrictEqual(crxToZip(Buffer.concat([h, Buffer.from('abcde'), z])), z); });
t('zip-slip blocked', () => { const d = tmp(); assert.throws(() => extractZip(makeZip({ '../evil.txt': 'x' }), path.join(d, 'out')), /Unsafe/); assert(!fs.existsSync(path.join(d, 'evil.txt'))); });
t('bad package rejected', () => assert.throws(() => crxToZip(Buffer.from('not a crx at all'))));
t('store ids', () => { const id = 'a'.repeat(32); assert.strictEqual(extractId('https://chromewebstore.google.com/detail/dark-reader/' + id + '?hl=en'), id); assert.strictEqual(extractId('https://chrome.google.com/webstore/detail/x/' + id), id); assert.strictEqual(extractId(id), id); assert.strictEqual(extractId('https://evil.com/detail/' + id), null); assert.strictEqual(extractId('nope'), null); });
t('theme reader', () => { const d = tmp(); fs.writeFileSync(d + '/bg.png', 'PNGDATA'); const th = readTheme(d, { theme: { colors: { frame: [10, 20, 30], toolbar: [1, 2, 3] }, images: { theme_ntp_background: 'bg.png', theme_frame: '../../etc/passwd' } } }); assert.strictEqual(th.colors.frame, 'rgb(10, 20, 30)'); assert(th.images.theme_ntp_background.startsWith('data:image/png;base64,')); assert(!th.images.theme_frame); });
// bookmarks html
t('netscape import', () => { const l = parseNetscape('<DL><p><DT><H3>Bar</H3><DL><p><DT><A HREF="https://a.com/?x=1&amp;y=2" ADD_DATE="1">A &amp; B</A></DL><p><DT><A HREF="javascript:1">bad</A><DT><A HREF="https://top.com">Top</A></DL>'); assert.strictEqual(l.length, 2); assert.strictEqual(l[0].folder, 'Bar'); assert.strictEqual(l[0].url, 'https://a.com/?x=1&y=2'); assert.strictEqual(l[0].title, 'A & B'); assert.strictEqual(l[1].folder, ''); });
// desktop entry
t('desktop entry', () => { const e = li.desktopEntry('/home/u/Apps/Wizard-Browser.AppImage'); assert(e.includes('Exec="/home/u/Apps/Wizard-Browser.AppImage" %U')); assert(e.includes('x-scheme-handler/https')); assert(e.includes('Categories=Network;WebBrowser;')); assert(e.includes('Icon=wizard-browser')); });
t('icons present at all sizes', () => { for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) assert(fs.existsSync(`/home/claude/wizard-ai/browser/icons/icon-${s}.png`), s); });
t('package.json build', () => { const p = require('/home/claude/wizard-ai/browser/package.json'); assert.strictEqual(p.build.linux.target[0].target, 'AppImage'); assert.strictEqual(p.build.linux.icon, 'icons'); assert(p.build.files.includes('lib/**/*') && p.build.files.includes('webview-preload.js')); for (const f of ['main.js', 'preload.js', 'webview-preload.js', 'index.html']) assert(fs.existsSync('/home/claude/wizard-ai/browser/' + f), f); });
console.log('unit: ' + n + ' passed');
// cookie sync
const { EventEmitter } = require('events'); const { createCookieSync } = require(B + 'cookie-sync');
(async () => {
  const mk = () => { const jar = new Map(); const e = new EventEmitter(); const ses = { jar, cookies: Object.assign(e, { get: async () => [...jar.values()], set: async d => { const c = { name: d.name, value: d.value, domain: d.domain || new URL(d.url).hostname, path: d.path, secure: d.secure, hostOnly: !d.domain, expirationDate: d.expirationDate }; const k = c.domain + '|' + c.path + '|' + c.name; const had = jar.has(k); jar.set(k, c); e.emit('changed', {}, c, had ? 'overwrite' : 'explicit', false); }, remove: async (url, name) => { for (const [k, c] of jar) if (c.name === name) { jar.delete(k); e.emit('changed', {}, c, 'explicit', true); } } }) }; return ses; };
  const a = mk(), b = mk(), c = mk(); let changed = 0, on = true;
  const cs = createCookieSync({ host: 'api.test.com', enabled: () => on, onChange: () => changed++ });
  cs.attach(a, 'persist:wizard-account'); cs.attach(b, 'persist:ws-work'); cs.attach(c, 'persist:panels');
  await a.cookies.set({ url: 'https://api.test.com/', name: 'session', value: 'S1', domain: 'api.test.com', path: '/', secure: true }); await new Promise(r => setTimeout(r, 30));
  const has = (s, v) => [...s.jar.values()].some(x => x.name === 'session' && x.value === v);
  t('login mirrors to workspaces and panels', () => { assert(has(b, 'S1') && has(c, 'S1')); });
  await b.cookies.set({ url: 'https://api.test.com/', name: 'session', value: 'S2', domain: 'api.test.com', path: '/', secure: true }); await new Promise(r => setTimeout(r, 30));
  t('sign-in inside a tab reaches the account session', () => { assert(has(a, 'S2') && has(c, 'S2')); assert(changed >= 1); });
  await c.cookies.set({ url: 'https://other.com/', name: 'x', value: '1', domain: 'other.com', path: '/' }); await new Promise(r => setTimeout(r, 30));
  t('other sites are never mirrored', () => { assert(![...a.jar.values(), ...b.jar.values()].some(x => x.name === 'x')); });
  await a.cookies.remove('https://api.test.com/', 'session'); await new Promise(r => setTimeout(r, 30));
  t('sign out clears everywhere', () => { assert(!has(b, 'S2') && !has(c, 'S2')); });
  on = false; await a.cookies.set({ url: 'https://api.test.com/', name: 'session', value: 'S3', domain: 'api.test.com', path: '/', secure: true }); await new Promise(r => setTimeout(r, 30));
  t('toggle off stops sharing', () => assert(!has(b, 'S3')));
  console.log('cookie-sync tests done');
})();
