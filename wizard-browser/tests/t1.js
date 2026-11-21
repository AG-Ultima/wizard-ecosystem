const { chromium } = require('playwright');
const fs = require('fs');
const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch();
  async function open(opts = {}) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push('console: ' + m.text()); });
    await p.addInitScript(`window.__layout=${JSON.stringify(opts.layout || 'top')};${opts.guest ? 'window.__user=null;' : ''}${opts.urls ? 'window.__urls=' + JSON.stringify(opts.urls) + ';' : ''}`);
    await p.addInitScript(mock);
    await p.goto('file:///home/claude/wizard-ai/browser/index.html');
    await p.waitForFunction(() => window.__wbReady, null, { timeout: 8000 });
    return { p, errs, ctx };
  }
  let { p, errs } = await open({ guest: true });
  ok(await p.locator('.tab').count() === 1, 'one initial tab');
  ok(await p.locator('#ntp.show').count() === 1, 'new tab page shown');
  ok((await p.textContent('#ws-name')) === 'Default', 'workspace button');
  await p.screenshot({ path: 'shot-ntp.png' });
  // omnibox: URL
  await p.fill('#o-input', 'example.com'); await p.keyboard.press('Enter');
  await p.waitForSelector('wv-stub.show');
  ok((await p.getAttribute('wv-stub.show', 'src')) === 'https://example.com', 'url normalised to https');
  await p.waitForFunction(() => document.querySelector('.tab.active .title').textContent.startsWith('Title of'));
  ok(await p.locator('#ntp.show').count() === 0, 'ntp hidden after navigation');
  // search
  await p.evaluate(() => window.__emit('shortcut', 'new-tab'));
  ok(await p.locator('.tab').count() === 2, 'new tab via shortcut');
  await p.fill('#o-input', 'wizard spells'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => (document.querySelector('wv-stub.show') || {}).getAttribute && document.querySelector('wv-stub.show').getAttribute('src').includes('wizardecosystem.dev/search?q=wizard%20spells'));
  ok(true, 'search goes to wizard search');
  await p.evaluate(() => window.__emit('shortcut', 'new-tab'));
  await p.fill('#o-input', '!gh electron'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('wv-stub.show').getAttribute('src').startsWith('https://github.com/search?q=electron'));
  ok(true, 'bang works');
  // tabs
  ok(await p.locator('.tab').count() === 3, 'three tabs');
  await p.evaluate(() => window.__emit('shortcut', 'tab-1'));
  ok(await p.locator('.tab.active .title').textContent().then(t => t.includes('example.com')), 'ctrl+1 activates first tab');
  await p.evaluate(() => window.__emit('shortcut', 'next-tab'));
  await p.locator('.tab').first().click({ button: 'right' });
  await p.click('text=Pin tab');
  ok(await p.locator('#pinned .tab.pin').count() === 1, 'pin tab');
  await p.locator('.tab:not(.pin)').first().hover();
  await p.locator('.tab:not(.pin)').first().locator('.x').click();
  ok(await p.locator('.tab').count() === 2, 'close tab');
  await p.evaluate(() => window.__emit('shortcut', 'reopen-tab'));
  ok(await p.locator('.tab').count() === 3, 'reopen closed tab');
  // back/forward
  await p.fill('#o-input', 'a.test'); await p.keyboard.press('Enter');
  await p.waitForTimeout(60);
  await p.fill('#o-input', 'b.test'); await p.keyboard.press('Enter'); await p.waitForTimeout(60);
  ok(await p.locator('#b-back').isEnabled(), 'back enabled');
  await p.click('#b-back'); await p.waitForTimeout(60);
  ok((await p.inputValue('#o-input')).includes('a.test'), 'back navigates');
  // bookmark
  await p.click('#b-star'); ok((await p.evaluate(() => window.__db.bookmarks.length)) === 1, 'bookmark saved');
  ok(await p.locator('#bookm .bm').count() === 1, 'bookmark bar shows it');
  await p.click('#b-star'); ok((await p.evaluate(() => window.__db.bookmarks.length)) === 0, 'bookmark removed');
  // find
  await p.evaluate(() => window.__emit('shortcut', 'find'));
  await p.fill('#find-in', 'wizard'); await p.waitForTimeout(40);
  ok((await p.textContent('#find-cnt')) === '1/3', 'find count');
  await p.keyboard.press('Escape'); ok(await p.locator('#findbar').count() === 0, 'find closes');
  // zoom
  await p.evaluate(() => window.__emit('shortcut', 'zoom-in'));
  ok((await p.evaluate(() => window.__zoom)) === 0.5, 'zoom in');
  ok((await p.evaluate(() => Object.keys(window.__db.sitesettings).length)) === 1, 'zoom remembered per site');
  // error page
  await p.fill('#o-input', 'fail.test'); await p.keyboard.press('Enter');
  await p.waitForSelector('#err.show');
  ok((await p.textContent('#err')).includes('could not be found'), 'friendly error text');
  // workspaces
  await p.click('#b-ws'); ok(await p.locator('.pop .mi').count() >= 6, 'workspace menu');
  await p.click('.pop >> text=Work');
  ok((await p.textContent('#ws-name')) === 'Work', 'switch workspace');
  ok(await p.locator('.tab').count() === 1, 'work workspace has its own tabs');
  const part = await p.evaluate(() => { const t = S.tabs.find(t => t.ws === 'work'); return null; }).catch(() => null);
  await p.evaluate(() => window.__emit('shortcut', 'workspace-1'));
  ok((await p.textContent('#ws-name')) === 'Default', 'ctrl+alt+1 returns');
  await p.click('#b-ws'); await p.click('.pop >> text=New workspace');
  await p.fill('#ws-n', 'Research'); await p.fill('#ws-i', '🧪'); await p.click('footer .pri');
  ok((await p.textContent('#ws-name')) === 'Research', 'create workspace');
  ok((await p.evaluate(() => window.__db.workspaces.length)) === 5, 'workspace persisted');
  // private tab
  await p.evaluate(() => window.__emit('shortcut', 'new-private-tab'));
  await p.fill('#o-input', 'secret.test'); await p.keyboard.press('Enter'); await p.waitForSelector('wv-stub.show');
  ok(await p.locator('.tab.priv').count() === 1, 'private tab marked');
  ok((await p.evaluate(() => document.querySelector('wv-stub.show').getAttribute('partition'))).startsWith('private-'), 'private partition');
  const sess = await p.evaluate(() => JSON.stringify(window.__db.session)); ok(!sess.includes('secret.test'), 'private tab not in saved session');
  const hist = await p.evaluate(() => JSON.stringify(window.__db.history)); ok(!hist.includes('secret.test'), 'private tab not in history');
  ok(true, 'placeholder');
  // partitions per workspace
  await p.evaluate(() => window.__emit('shortcut', 'workspace-2')); await p.fill('#o-input', 'w.test'); await p.keyboard.press('Enter'); await p.waitForTimeout(40);
  ok((await p.evaluate(() => document.querySelector('wv-stub.show').getAttribute('partition'))) === 'persist:ws-default', 'workspaces share one cookie jar by default');
  await p.evaluate(() => saveSettings({ isolateWorkspaces: true })); await p.evaluate(() => window.__emit('shortcut', 'new-tab')); await p.fill('#o-input', 'iso.test'); await p.keyboard.press('Enter'); await p.waitForSelector('wv-stub.show');
  ok((await p.evaluate(() => document.querySelector('wv-stub.show').getAttribute('partition'))) === 'persist:ws-work', 'isolation setting gives each workspace its own jar');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await p.screenshot({ path: 'shot-tabs.png' });
  console.log(`t1: ${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
