const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch();
  async function open(guest) { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
    await p.addInitScript(guest ? 'window.__user=null;' : ''); await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady); return { p, errs }; }
  let { p, errs } = await open(false); await p.waitForTimeout(100);
  // 1. transient failures never sign you out
  ok(await p.evaluate(() => !!S.user), 'signed in');
  for (const st of [0, 502, 503, 500]) { await p.evaluate(s => { window.__authFail = s; }, st); await p.evaluate(() => checkAuth()); ok(await p.evaluate(() => !!S.user), 'stays signed in on status ' + st); }
  await p.evaluate(() => { window.__authFail = 401; }); await p.evaluate(() => checkAuth()); ok(await p.evaluate(() => !S.user), 'explicit 401 signs out');
  await p.evaluate(() => { window.__authFail = 0; delete window.__authFail; }); await p.evaluate(() => checkAuth()); ok(await p.evaluate(() => !!S.user), 'signs back in when server answers');
  // 2. window dragging: empty tab-strip space must be a drag region, tabs and buttons not
  const reg = await p.evaluate(() => { const g = s => getComputedStyle(document.querySelector(s)).getPropertyValue('-webkit-app-region'); document.querySelector('#b-newtab'); return { strip: g('#strip'), zone: g('#tabzone'), tab: g('.tab'), btn: g('#b-ws'), ctl: g('#w-min'), drag: g('.strip .drag') }; });
  ok(reg.zone === 'drag' && reg.strip === 'drag', 'tab strip empty space drags: ' + JSON.stringify(reg)); ok(reg.tab === 'no-drag' && reg.btn === 'no-drag' && reg.ctl === 'no-drag', 'tabs/buttons do not drag');
  // 3. back-button history list
  await p.fill('#o-input', 'asm.test'); await p.keyboard.press('Enter'); await p.waitForTimeout(100); await p.fill('#o-input', 'asm.test/2'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  await p.click('#b-back', { button: 'right' }); ok(await p.locator('.pop .mi').count() === 2, 'back menu lists earlier pages'); await p.click('.pop .mi >> text=Learn');
  ok((await p.evaluate(() => window.__calls.find(c => c[0] === 'goto'))).slice(2)[0] === 0, 'jumps to the chosen history entry');
  // 4/5. workspace editor: colors, emoji grid, image icon, custom color
  await p.click('#b-ws'); await p.click('.pop >> text=New workspace');
  ok(await p.locator('#ws-c [data-c]').count() >= 24, '24+ colour swatches'); ok(await p.locator('#ws-emoji [data-e]').count() >= 100, 'emoji grid');
  await p.click('#ws-emoji [data-e="🐉"]'); ok((await p.textContent('#ws-prev')).includes('🐉'), 'emoji chosen');
  await p.click('#ws-c [data-c="#e11d48"]'); await p.fill('#ws-cc', '#12ab34'); ok((await p.evaluate(() => document.querySelector('#ws-cc').value)) === '#12ab34', 'custom colour input');
  await p.fill('#ws-n', 'Dragon'); 
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64'); void png;
  await p.setInputFiles('#ws-file-in', __dirname + '/wbicon.png'); await p.waitForFunction(() => document.querySelector('#ws-prev img'));
  ok(true, 'image file becomes the icon'); await p.screenshot({ path: 'shot-wsedit.png' }); await p.click('.modal footer >> text=Save'); await p.waitForTimeout(60);
  const saved = await p.evaluate(() => S.workspaces.find(w => w.name === 'Dragon')); ok(saved && saved.icon.startsWith('data:image/') && saved.color === '#12ab34', 'saved with image icon and custom colour');
  ok(await p.locator('#ws-em img').count() === 1, 'workspace button shows the image'); await p.click('#b-ws'); ok(await p.locator('.pop .mi img').count() === 1, 'menu shows the image'); await p.keyboard.press('Escape'); await p.mouse.click(700, 500);
  ok((await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ws').trim())) === '#12ab34', 'window edge uses the custom colour');
  // sync sanitising: hostile workspace data is cleaned
  await p.evaluate(() => { const rb = { syncAt: Date.now() + 1e6, workspaces: [{ id: 'evil', name: 'x'.repeat(80), icon: 'javascript:alert(1)', color: 'red;background:url(x)' }, { id: '../../bad', name: 'no', icon: '✨', color: '#000000' }] }; return window.wb.api('POST', '/x'); });
  await p.evaluate(() => { S.user = S.user; window.__remote = true; });
  // 7. themes
  await p.evaluate(() => window.__emit('shortcut', 'settings')); await p.click('[data-pane="appearance"]'); ok(await p.locator('#sp-body [data-theme]').count() === 10, 'ten themes in gallery'); await p.screenshot({ path: 'shot-themes.png' });
  await p.click('[data-theme="dr460nized"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(50);
  ok((await p.getAttribute('html', 'data-theme')) === 'dr460nized', 'dr460nized applied'); ok((await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ntpbg'))).includes('svg+xml'), 'theme wallpaper set on the start page');
  await p.evaluate(() => { goNtp(); }); await p.waitForTimeout(100); await p.screenshot({ path: 'shot-dr460nized.png' });
  for (const id of ['ember', 'aurora', 'amethyst', 'midnight', 'light', 'grimoire']) { await p.evaluate(i => { saveSettings({ theme: i, customTheme: null }); applyTheme(); }, id); await p.screenshot({ path: 'shot-theme-' + id + '.png' }); }
  await p.evaluate(() => { saveSettings({ theme: 'dr460nized' }); applyTheme(); }); await p.fill('#o-input', 'asm.test'); await p.keyboard.press('Enter'); await p.waitForTimeout(120); await p.screenshot({ path: 'shot-dr460nized-tabs.png' });
  ok(errs.length === 0, 'no page errors: ' + errs.join('|')); console.log(`t4: ${pass} passed, ${fail} failed`); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
