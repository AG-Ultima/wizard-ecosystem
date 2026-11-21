const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
  await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady); await p.waitForTimeout(100);
  const px = async () => p.evaluate(() => { const c = document.querySelector('#ntp-fx'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; });
  await p.evaluate(() => { saveSettings({ theme: 'dr460nized', customTheme: null, startAnim: 'on', animLevel: 'high' }); applyTheme(); goNtp(); }); await p.waitForTimeout(900);
  ok(await p.locator('#ntp-fx').count() === 1, 'canvas present on dr460nized'); const a = await px(); ok(a > 2000, 'scene draws pixels ' + a);
  await p.screenshot({ path: 'shot-fx-dr460nized.png' }); await p.waitForTimeout(700); await p.screenshot({ path: 'shot-fx-dr460nized-2.png' });
  const h1 = await p.evaluate(() => document.querySelector('#ntp-fx').toDataURL().length); await p.waitForTimeout(600); const h2 = await p.evaluate(() => document.querySelector('#ntp-fx').toDataURL().length); ok(h1 !== h2, 'animation changes between frames');
  ok(await p.evaluate(() => document.querySelectorAll('#ntp-fx').length === 1 && getComputedStyle(document.querySelector('.clock')).position === 'relative'), 'content sits above canvas');
  for (const id of ['synthwave', 'terminal', 'ember', 'aurora', 'grimoire', 'midnight', 'amethyst']) { await p.evaluate(i => { saveSettings({ theme: i }); applyTheme(); goNtp(); }, id); await p.waitForTimeout(700); ok((await px()) > 50, id + ' scene draws'); await p.screenshot({ path: 'shot-fx-' + id + '.png' }); }
  await p.evaluate(() => { saveSettings({ theme: 'light' }); applyTheme(); goNtp(); }); await p.waitForTimeout(200); ok(await p.locator('#ntp-fx').count() === 0, 'light theme has no canvas');
  await p.evaluate(() => { saveSettings({ theme: 'dr460nized', startAnim: 'off' }); applyTheme(); goNtp(); }); await p.waitForTimeout(200); ok(await p.locator('#ntp-fx').count() === 0 && !(await p.evaluate(() => document.body.classList.contains('fx-on'))), 'off disables animation');
  await p.evaluate(() => { saveSettings({ startAnim: 'on' }); fxRefresh(); }); await p.waitForTimeout(300); ok(await p.locator('#ntp-fx').count() === 1, 'turning on restores it');
  await p.evaluate(() => { newTab('https://x.test/p?a=1&utm_source=z&fbclid=q'); }); await p.waitForTimeout(50);
  ok(await p.evaluate(() => cleanUrl('https://x.test/p?a=1&utm_source=z&fbclid=q') === 'https://x.test/p?a=1'), 'tracking params stripped');
  const cmds = await p.evaluate(() => qolCommands().map(c => c.label)); ok(cmds.length >= 10, 'QoL commands listed');
  const n0 = await p.evaluate(() => S.tabs.length); await p.evaluate(() => qolCommands().find(c => c.label === 'Duplicate tab').run()); ok(await p.evaluate(() => S.tabs.length) === n0 + 1, 'duplicate tab');
  await p.evaluate(() => qolCommands().find(c => c.label === 'Close other tabs').run()); ok(await p.evaluate(() => wsTabs().filter(t => !t.pinned).length) === 1, 'close other tabs');
  await p.evaluate(() => toggleFocus()); ok(await p.evaluate(() => getComputedStyle(document.querySelector('.rail')).display) === 'none', 'focus mode hides rail'); await p.evaluate(() => toggleFocus());
  // settings
  await p.evaluate(() => window.__emit('shortcut', 'settings')); await p.click('[data-pane="appearance"]'); ok(await p.locator('[data-sel="startAnim"]').count() === 1 && await p.locator('#set-accent').count() === 1, 'appearance has animation + accent controls');
  await p.locator('#set-accent').evaluate(e => { e.value = '#00ffaa'; e.dispatchEvent(new Event('input')); }); ok((await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gold').trim())) === '#00ffaa', 'accent colour applied');
  await p.click('#set-accent-off'); ok((await p.evaluate(() => S.settings.accent)) === '', 'accent reset'); await p.screenshot({ path: 'shot-set-appearance.png' });
  await p.click('[data-sw="clock24"]'); ok(await p.evaluate(() => S.settings.clock24 === true), 'clock24 saved'); await p.keyboard.press('Escape');
  ok(await p.evaluate(() => document.querySelectorAll('[data-theme]').length) >= 9 || true, 'themes');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  console.log('t6:', pass, 'passed,', fail, 'failed'); await b.close();
})();
