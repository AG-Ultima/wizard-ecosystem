const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
  await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady); await p.waitForTimeout(100);
  await p.evaluate(() => { newTab('https://a.test/x?utm_source=q&k=1'); newTab('https://b.test/'); newTab('https://c.test/'); S.tabs.forEach(t => { if (t.url) t.title = 'Page ' + t.url.slice(8, 9); }); S.tabs.find(t => t.url.includes('b.test')).digest = 'About B things.'; renderTabs(); });
  
  { const bb = await p.locator('#tablist .tab').nth(2).boundingBox(); await p.mouse.move(bb.x + 60, bb.y + 10); } await p.waitForSelector('.tabcard', { timeout: 3000 }); const card = await p.textContent('.tabcard');  ok(card.includes('b.test') && card.includes('About B things.'), 'hover card shows title and address'); await p.screenshot({ path: 'shot-tabcard.png' });
  await p.mouse.move(700, 600); await p.waitForTimeout(100); ok(await p.locator('.tabcard').count() === 0, 'card hides when pointer leaves');
  await p.evaluate(() => saveSettings({ tabPreview: false })); await p.evaluate(() => renderTabs()); ok(await p.locator('.tab[title]').count() > 0, 'native tooltip returns when cards are off'); await p.evaluate(() => saveSettings({ tabPreview: true })); await p.evaluate(() => renderTabs());
  // undo close
  const n0 = await p.evaluate(() => S.tabs.length); await p.evaluate(() => { const t = S.tabs.find(t => t.url.includes('c.test')); closeTab(t.id); }); await p.waitForSelector('#undo.show'); ok((await p.textContent('#undo')).includes('Closed 1 tab'), 'undo toast after close');
  await p.screenshot({ path: 'shot-undo.png' }); await p.click('#undo-b'); await p.waitForTimeout(80); ok(await p.evaluate(() => S.tabs.length) === n0, 'undo brings the tab back');
  await p.evaluate(() => { const ts = S.tabs.filter(t => /b\.test|c\.test/.test(t.url)); ts.forEach(t => closeTab(t.id)); }); await p.waitForSelector('#undo.show'); ok((await p.textContent('#undo')).includes('Closed 2 tabs'), 'bulk close is grouped into one Undo');
  await p.click('#undo-b'); await p.waitForTimeout(80); ok(await p.evaluate(() => S.tabs.filter(t => /b\.test|c\.test/.test(t.url)).length) === 2, 'undo restores all');
  // omnibox copy + menu
  await p.evaluate(() => { activate(S.tabs.find(t => t.url.includes('a.test')).id); }); await p.waitForTimeout(500); ok(await p.locator('#b-copy:visible').count() === 1, 'copy button visible on web pages');
  await p.click('#b-copy'); await p.waitForTimeout(100); ok((await p.evaluate(() => navigator.clipboard.readText())) === 'https://a.test/x?k=1', 'copies the address without tracking');
  await p.click('#o-input', { button: 'right' }); ok(await p.locator('.pop .mi >> text=Paste and go').count() === 1, 'omnibox right-click menu'); await p.keyboard.press('Escape'); await p.mouse.click(700, 500);
  // main menu tools + tab menu
  await p.click('#b-menu'); ok(await p.locator('.pop .mi >> text=Close other tabs').count() === 1 && await p.locator('.pop .mi >> text=Focus mode').count() === 1, 'main menu has tab tools'); await p.keyboard.press('Escape'); await p.mouse.click(700, 500);
  await p.click('#tablist .tab >> nth=1', { button: 'right' }); ok(await p.locator('.pop .mi >> text=Copy address').count() === 1, 'tab menu has copy address'); await p.keyboard.press('Escape'); await p.mouse.click(700, 500);
  // progress line
  await p.evaluate(() => { const t = activeTab(); t.loading = true; }); await p.waitForTimeout(300); ok(await p.evaluate(() => document.querySelector('#prog').classList.contains('loading')), 'loading shimmer');
  await p.evaluate(() => { const t = activeTab(); t.loading = false; onPageScroll(t, 0.4); }); await p.waitForTimeout(300); ok((await p.evaluate(() => document.querySelector('#prog').style.getPropertyValue('--sp'))) === '40.0%', 'scroll progress width');
  await p.evaluate(() => saveSettings({ scrollBar: false })); await p.waitForTimeout(300); ok(await p.evaluate(() => document.querySelector('#prog').style.opacity) === '0', 'scroll line can be turned off');
  // bookmarks bar mode
  await p.evaluate(() => { S.bookmarks.push({ id: 'z1', url: 'https://z.test', title: 'Z', folder: '', added: 1 }); renderBookmarkBar(); saveSettings({ bmMode: 'ntp' }); applyBmMode(); }); await p.waitForTimeout(50);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#bookm')).display) === 'none', 'bookmarks bar hidden on web pages'); await p.evaluate(() => goNtp()); await p.waitForTimeout(100); ok(await p.evaluate(() => getComputedStyle(document.querySelector('#bookm')).display) !== 'none', 'bookmarks bar shown on start page');
  // settings
  await p.evaluate(() => window.__emit('shortcut', 'settings')); await p.click('[data-pane="appearance"]'); ok(await p.locator('[data-sw="tabPreview"]').count() === 1 && await p.locator('[data-sel="bmMode"]').count() === 1, 'settings rows exist'); await p.keyboard.press('Escape');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); console.log('t7:', pass, 'passed,', fail, 'failed'); await b.close();
})();
