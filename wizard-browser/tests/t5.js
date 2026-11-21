const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
  await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady); await p.waitForTimeout(100);
  await p.evaluate(() => { newTab('https://shop.test/a', { background: true }); newTab('https://shop.test/b', { background: true }); newTab('https://news.test/', { background: true }); S.tabs.forEach((t, i) => { t.title = ['Shoes', 'Shirts', 'News'][i - (S.tabs.length - 3)] || t.title; }); });
  const ids = await p.evaluate(() => S.tabs.slice(-3).map(t => t.id));
  // Conjure
  await p.evaluate(([a, c]) => { window.__plan = { say: 'Grouping shopping tabs.', actions: [{ do: 'group', tabs: [a[0], a[1], 'bogus'], name: 'Shopping' }, { do: 'open', url: 'javascript:alert(1)' }, { do: 'close', tabs: ['nope'] }] }; }, [ids]);
  await p.evaluate(() => window.__emit('shortcut','palette')); await p.fill('#pl-q', 'group my shopping tabs'); ok(await p.locator('#pl-r .row >> text=Conjure').count() === 1, 'conjure row offered');
  await p.keyboard.press('ArrowDown'); await p.locator('#pl-r .row >> text=Conjure').click(); await p.waitForSelector('#conjure');
  ok((await p.locator('#conjure li').count()) === 1, 'only the valid action is shown (bad ids/urls dropped)'); ok((await p.textContent('#conjure')).includes('Group 2 tabs'), 'describes the action');
  const before = await p.evaluate(() => S.groups.length); await p.click('#conjure [data-c]'); ok(await p.evaluate(() => S.groups.length) === before, 'cancel changes nothing');
  await p.evaluate(() => window.__emit('shortcut','palette')); await p.fill('#pl-q', '> group my shopping tabs');  await p.keyboard.press('Enter'); await p.waitForSelector('#conjure'); await p.click('#conjure [data-ok]');
  ok(await p.evaluate(([a]) => S.groups.some(g => g.name === 'Shopping') && tabById(a[0]).group === tabById(a[1]).group && !!tabById(a[0]).group && !tabById(a[2]).group, [ids]), 'approved group applied to the right tabs');
  await p.evaluate(() => { window.__plan = { say: 'Closing.', actions: [{ do: 'close', tabs: ['x'] }] }; }); await p.evaluate(() => window.__emit('shortcut','palette')); await p.fill('#pl-q', '> close junk'); await p.keyboard.press('Enter'); await p.waitForSelector('#conjure'); ok(await p.locator('#conjure [data-ok]').count() === 0, 'no actions → no Do it button'); await p.click('#conjure [data-c]');
  // Rewind
  await p.evaluate(() => takeSnapshots()); const n1 = await p.evaluate(() => REWIND.length); await p.evaluate(() => takeSnapshots()); ok(await p.evaluate(() => REWIND.length) === n1, 'unchanged workspace is not re-recorded');
  await p.evaluate(() => { const t = S.tabs.find(t => t.title === 'News'); closeTab(t.id); takeSnapshots(); }); ok(await p.evaluate(() => REWIND.length) === n1 + 1, 'change is recorded');
  await p.evaluate(() => window.__emit('shortcut','palette')); await p.fill('#pl-q', 'rewind'); await p.keyboard.press('Enter'); await p.waitForSelector('[aria-label="Rewind"]'); ok(await p.locator('[data-r]').count() >= 2, 'rewind lists snapshots');
  const open0 = await p.evaluate(() => S.tabs.length); await p.locator('[data-r]').nth(1).click(); await p.waitForTimeout(50); ok(await p.evaluate(() => S.tabs.length) === open0 + 1, 'restore reopens only the missing tab');
  // Digests
  await p.evaluate(() => { window.extractPage = async () => ({ text: 'x'.repeat(400) }); });
  const tid = await p.evaluate(() => { const t = newTab('https://dig.test/', { background: false }); newTab('https://other.test/', { background: false }); mountView(t); t.last = 0; return t.id; });
  await p.evaluate(id => { const t = tabById(id); t.view = t.view || {}; }, tid);
  console.log(await p.evaluate(id => { const t = tabById(id); t.loading = false; return JSON.stringify({v: !!t.view, a: isActive(t), l: t.loading, au: t.audible, u: !!S.user, p: t.priv, url: t.url}); }, tid)); console.log(await p.evaluate(async id => { const t = tabById(id); t.loading = false; sleepTab(t); await new Promise(r => setTimeout(r, 400)); return JSON.stringify({sp: t.sleepPending, s: t.sleeping, v: !!t.view, d: t.digest, e: typeof extractPage, src: sleepTab.toString().slice(0,60)}); }, tid));
  const d = await p.evaluate(id => { const t = tabById(id); return { s: t.sleeping, d: t.digest }; }, tid); ok(d.s && d.d === 'A page about tests.', 'sleeping tab keeps an AI digest ' + JSON.stringify(d));
  ok(await p.evaluate(id => { saveSettings({ tabPreview: false }); renderTabs(); return document.querySelector('.tab[data-id="' + id + '"]').title.includes('A page about tests.'); }, tid), 'digest shown in tab tooltip when hover cards are off');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  console.log('t5:', pass, 'passed,', fail, 'failed'); await b.close();
})();
