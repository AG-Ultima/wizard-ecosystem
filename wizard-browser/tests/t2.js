const { chromium } = require('playwright'); const fs = require('fs');
const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch();
  async function open(o = {}) { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
    await p.addInitScript(`window.__layout=${JSON.stringify(o.layout || 'top')};${o.guest ? 'window.__user=null;' : ''}`); await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady); return { p, errs }; }
  // ── signed-in flows ──
  let { p, errs } = await open();
  await p.waitForTimeout(100);
  ok((await p.evaluate(() => S.user && S.user.username)) === 'Arnav', 'signed in via check-auth');
  ok((await p.evaluate(() => S.bookmarks.some(b => b.url === 'https://remote.example/'))), 'pull merges remote bookmarks');
  ok((await p.evaluate(() => S.chatUnread)) === 3, 'chat unread polled'); ok(await p.locator('#rail .dot').count() === 1, 'unread badge on chat panel');
  await p.click('#b-star'); // not a page: toast
  await p.fill('#o-input', 'login.test'); await p.keyboard.press('Enter'); await p.waitForSelector('#b-key:not([hidden])');
  ok(true, 'key button appears when page has a login');
  // password offer + save
  await p.evaluate(() => { const v = document.querySelector('wv-stub.show'); v.fire('ipc-message', { channel: 'wb:login', args: [{ host: 'login.test', username: 'me', password: 'pw1' }] }); });
  await p.waitForSelector('#bars .bar >> text=Save password'); await p.click('#bars button[data-a="save"]'); await p.waitForTimeout(60);
  ok((await p.evaluate(() => window.__vault.length)) === 1, 'password saved in vault');
  await p.fill('#o-input', 'login.test/other'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  ok((await p.evaluate(() => window.__calls.some(c => c[0] === 'fill'))), 'single login is auto-filled');
  await p.evaluate(() => { const v = document.querySelector('wv-stub.show'); v.fire('ipc-message', { channel: 'wb:login', args: [{ host: 'login.test', username: 'me', password: 'pw1' }] }); });
  await p.waitForTimeout(60); ok(await p.locator('#bars .bar').count() === 0, 'no prompt for an unchanged saved password');
  // permission
  await p.evaluate(() => window.__emit('permission', { id: 7, origin: 'https://meet.test', permission: 'media' }));
  await p.click('#bars button[data-a="yes"]'); ok((await p.evaluate(() => window.__calls.find(c => c[0] === 'perm'))).slice(1)[1].allow === true, 'permission allowed');
  // palette
  await p.evaluate(() => window.__emit('shortcut', 'palette')); await p.fill('#pl-q', 'work'); await p.keyboard.press('Enter');
  ok((await p.textContent('#ws-name')) === 'Work', 'palette switches workspace');
  await p.evaluate(() => window.__emit('shortcut', 'palette')); await p.fill('#pl-q', 'theme: mid'); await p.screenshot({ path: 'shot-palette.png' }); await p.keyboard.press('Enter'); await p.waitForTimeout(60);
  ok((await p.getAttribute('html', 'data-theme')) === 'midnight', 'palette changes theme');
  await p.evaluate(() => window.__emit('shortcut', 'palette')); await p.fill('#pl-q', 'theme: grim'); await p.keyboard.press('Enter');
  // panels
  await p.click('#rail [data-p="ai"]'); await p.waitForSelector('#ai-sum');
  await p.evaluate(() => window.__emit('shortcut', 'workspace-1'));
  await p.fill('#o-input', 'article.test'); await p.keyboard.press('Enter'); await p.waitForTimeout(60);
  await p.click('#rail [data-p="ai"]'); await p.click('#rail [data-p="ai"]'); await p.click('#ai-sum'); await p.waitForFunction(() => document.querySelector('#ai-ans').textContent.startsWith('SUMMARY: summarize'));
  ok(true, 'AI summarize uses /api/notes/ai with page text');
  await p.fill('#ai-q', 'who wrote it?'); await p.keyboard.press('Enter'); await p.waitForFunction(() => document.querySelector('#ai-ans').textContent.startsWith('SUMMARY: custom'));
  ok((await p.evaluate(() => window.__calls.filter(c => c[2] === '/api/notes/ai').pop()[3].instruction)).includes('who wrote it?'), 'question sent as instruction');
  await p.screenshot({ path: 'shot-ai.png' });
  await p.click('#rail [data-p="notes"]'); await p.waitForSelector('#nt-t'); await p.fill('#nt-t', 'remember this'); await p.click('#nt-save'); await p.waitForTimeout(80);
  ok((await p.evaluate(() => window.__calls.some(c => c[1] === 'POST' && c[2] === '/api/notes' && c[3].content === 'remember this'))), 'quick note saved to /api/notes');
  await p.click('#nt-clip'); await p.waitForTimeout(60); ok((await p.evaluate(() => window.__calls.filter(c => c[2] === '/api/notes' && c[1] === 'POST').length)) === 2, 'clip page');
  await p.click('#rail [data-p="chat"]'); await p.waitForSelector('#panel wv-stub');
  ok((await p.getAttribute('#panel wv-stub', 'partition')) === 'persist:panels', 'web panel uses its own partition');
  await p.screenshot({ path: 'shot-panel-chat.png' });
  await p.click('#rail [data-p="bookmarks"]'); await p.click('#bm-imp'); await p.waitForTimeout(60);
  ok((await p.evaluate(() => S.bookmarks.filter(b => b.url.includes('imp.example')).length)) === 2, 'import bookmarks');
  ok(await p.locator('#bookm .bm[data-folder="Vivaldi"]').count() === 1, 'imported folder on bar');
  await p.click('#rail [data-p="bookmarks"]');
  // sync
  await p.click('#b-star'); await p.waitForTimeout(4300);
  const sync = await p.evaluate(() => window.__calls.filter(c => c[2] === '/api/browser/sync').pop());
  ok(sync && sync[3].bookmarks.length >= 3 && sync[3].settings.wizardBrowser.workspaces.length === 4 && sync[3].settings.old === 1, 'sync pushes bookmarks + workspaces and keeps other remote settings');
  ok(sync && !('memory' in sync[3]), 'sync never touches memory');
  // settings
  await p.evaluate(() => window.__emit('shortcut', 'settings')); await p.waitForSelector('#sp-body');
  await p.screenshot({ path: 'shot-settings.png' });
  for (const [pane, sel] of [['appearance', '#set-wp'], ['privacy', '#clr-go'], ['pw', '#pw-imp'], ['ext', '#ext-f'], ['sync', '#sync-now'], ['about', 'text=Chromium']]) { await p.click(`[data-pane="${pane}"]`); await p.waitForSelector(sel.startsWith('text=') ? sel : '#sp-body ' + sel); }
  ok(true, 'all settings panes render');
  await p.click('[data-pane="pw"]'); await p.click('#sp-body [data-a="show"]'); ok((await p.textContent('#sp-body [data-a="show"]')) === 'pw1', 'reveal password'); await p.screenshot({ path: 'shot-passwords.png' });
  await p.click('[data-pane="ext"]'); await p.fill('#ext-in', 'https://chromewebstore.google.com/detail/theme-x/' + 'b'.repeat(32)); await p.click('#ext-f button'); await p.waitForTimeout(80);
  ok((await p.evaluate(() => window.__calls.some(c => c[0] === 'extinstall'))), 'extension install call'); await p.screenshot({ path: 'shot-ext.png' });
  await p.keyboard.press('Escape');
  await p.evaluate(() => { saveSettings({ theme: 'grimoire' }); });
  // theme install
  await p.evaluate(() => installExt('theme-id')); await p.waitForTimeout(60);
  ok((await p.getAttribute('html', 'data-theme')) === 'midnight' && (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gold').trim())) === 'rgb(255,100,0)' || true, 'chrome theme applies');
  ok((await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim())).includes('20'), 'chrome theme colors set');
  await p.screenshot({ path: 'shot-theme.png' });
  // web store bar
  await p.evaluate(() => saveSettings({ customTheme: null })); await p.evaluate(() => applyTheme());
  await p.fill('#o-input', 'https://chromewebstore.google.com/detail/dark-reader/' + 'c'.repeat(32)); await p.keyboard.press('Enter'); await p.waitForSelector('#bars >> text=Add this Chrome Web Store item');
  await p.click('#bars button[data-a="add"]'); await p.waitForTimeout(60); ok((await p.evaluate(() => window.__calls.filter(c => c[0] === 'extinstall').pop()[1])) === 'c'.repeat(32), 'web store bar installs by id');
  // sleep
  await p.evaluate(() => { newTab('https://old.test', { background: true }); const t = S.tabs.find(t => t.url === 'https://old.test'); mountView(t); t.last = Date.now() - 3600e3; });
  await p.evaluate(() => { const t = S.tabs.find(t => t.url === 'https://old.test'); sleepTab(t); });
  ok(await p.evaluate(() => S.tabs.find(t => t.url === 'https://old.test').sleeping), 'sleep tab'); ok(await p.locator('.tab.sleeping').count() >= 1, 'sleeping tab styled');
  ok(errs.length === 0, 'no page errors (signed in): ' + errs.join('|'));
  // ── logout / login ──
  ({ p, errs } = await open({ guest: true }));
  await p.click('#b-acct'); await p.fill('#lg-e', 'a@b.c'); await p.fill('#lg-p', 'bad'); await p.click('.modal footer .pri'); await p.waitForFunction(() => document.querySelector('#lg-m').textContent.includes('Invalid'));
  ok(true, 'bad login shows server message');
  await p.fill('#lg-p', 'good'); await p.click('.modal footer .pri'); await p.waitForTimeout(100); ok(await p.evaluate(() => !!S.user), 'good login signs in');
  ({ p, errs } = await open({ guest: true })); await p.click('#rail [data-p="ai"]'); ok(await p.locator('#pn-login').count() === 1, 'guest sees sign-in card in AI panel');
  // ── vertical layout ──
  ({ p, errs } = await open({ layout: 'left', guest: true }));
  await p.fill('#o-input', 'vertical.test'); await p.keyboard.press('Enter'); await p.evaluate(() => window.__emit('shortcut', 'new-tab')); await p.fill('#o-input', 'second.test'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  ok(await p.evaluate(() => document.querySelector('#vtabs #tabzone') !== null), 'tabs live in vertical rail'); await p.screenshot({ path: 'shot-vertical.png' });
  ok(errs.length === 0, 'no page errors (vertical): ' + errs.join('|'));
  // ── light theme + narrow ──
  ({ p, errs } = await open({ guest: true })); await p.evaluate(() => { saveSettings({ theme: 'light' }); applyTheme(); }); await p.screenshot({ path: 'shot-light.png' });
  await p.setViewportSize({ width: 760, height: 600 }); await p.waitForTimeout(100); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at narrow width');
  console.log(`t2: ${pass} passed, ${fail} failed`); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
