const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript('window.__user=null;'); await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady);
  const order = () => p.evaluate(() => S.workspaces.map(w => w.name).join(','));
  ok((await order()) === 'Default,Work,School,Media', 'initial order');
  await p.click('#b-ws'); await p.locator('.pop .mi').nth(3).dragTo(p.locator('.pop .mi').nth(1));
  ok((await order()) === 'Default,Media,Work,School', 'drag Media above Work');
  ok((await p.evaluate(() => window.__db.workspaces.map(w => w.name).join(','))) === 'Default,Media,Work,School', 'order saved');
  ok((await p.locator('.pop .mi').nth(1).textContent()).includes('Media') && (await p.locator('.pop .mi').nth(1).textContent()).includes('Ctrl+Alt+2'), 'menu re-renders with new hotkey numbers');
  await p.keyboard.press('Escape'); await p.mouse.click(700, 500);
  await p.evaluate(() => window.__emit('shortcut', 'workspace-2')); ok((await p.textContent('#ws-name')) === 'Media', 'Ctrl+Alt+2 follows new order');
  await p.click('#b-ws'); await p.click('.pop >> text=Edit'); await p.click('.modal footer >> text=Move down'); ok((await order()) === 'Default,Work,Media,School', 'move down in edit dialog');
  await p.click('.modal footer >> text=Move up'); ok((await order()) === 'Default,Media,Work,School', 'move up in edit dialog');
  ok(errs.length === 0, 'no errors ' + errs.join('|')); console.log(`t3: ${pass} passed, ${fail} failed`); await b.close();
})();
