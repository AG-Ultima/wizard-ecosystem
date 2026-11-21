const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (process.env.V) console.log(c ? 'ok  ' : 'FAIL', m); if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  async function open(init, vp) { const ctx = await b.newContext({ viewport: vp || { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(init || ''); await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForTimeout(700); return { p, errs }; }
  // Windows with native caption overlay
  let { p, errs } = await open('window.__platform="win32";window.__overlay=true;');
  ok(await p.evaluate(() => document.body.classList.contains('plat-win32') || document.body.classList.contains('plat-win')), 'platform class set');
  ok(await p.evaluate(() => document.body.classList.contains('ovl')), 'overlay class set');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#ctl')).display === 'none'), 'built-in caption buttons hidden under overlay');
  ok(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#strip')).paddingRight) >= 140), 'room reserved for caption buttons');
  ok(await p.evaluate(() => window.__calls.some(c => c[0] === 'overlay')), 'overlay colours pushed to main');
  await p.evaluate(() => { saveSettings({ theme: 'oled' }); applyTheme(); }); await p.waitForTimeout(200);
  const ov = await p.evaluate(() => window.__calls.filter(c => c[0] === 'overlay').pop()); ok(ov && /rgb\(0, 0, 0\)|#000/.test(ov[1]), 'OLED overlay is true black: ' + (ov && ov[1]));
  ok(await p.evaluate(() => document.documentElement.dataset.theme === 'oled'), 'oled theme applied');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#app')).backgroundColor === 'rgb(0, 0, 0)'), 'OLED app background is true black');
  ok(await p.evaluate(() => THEMES.some(t => t.id === 'oled') && THEMES.some(t => t.id === 'dr460nized')), 'both themes listed');
  ok(await p.evaluate(() => /^data:image\/svg/.test(WALL.oled())), 'OLED wallpaper renders');
  ok(await p.evaluate(() => !!FX_SCENES.oled), 'OLED animated scene exists');
  // settings rows
  await p.evaluate(() => openSettings && openSettings('general')); await p.waitForTimeout(500);
  const txt = await p.textContent('body'); ok(txt.includes('Start with Windows'), 'Windows settings rows shown');
  await p.evaluate(() => openSettings('appearance')); await p.waitForTimeout(400); await p.selectOption('[data-sel="winMaterial"]', 'mica'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => window.__calls.some(c => c[0] === 'material' && c[1] === 'mica')), 'material change reaches main');
  ok(await p.evaluate(() => document.body.classList.contains('mat')), 'mat class set for Mica');
  await p.evaluate(() => openSettings('general')); await p.waitForTimeout(400); await p.click('[data-sw="login"]'); ok(await p.evaluate(() => window.__calls.some(c => c[0] === 'login' && c[1] === true)), 'start-with-Windows toggles login item');
  ok(errs.length === 0, 'no page errors: ' + errs.join(';'));
  // Linux must not show Windows rows or overlay
  ({ p, errs } = await open('')); await p.evaluate(() => openSettings('general')); await p.waitForTimeout(500);
  ok(!(await p.innerText('body')).includes('Start with Windows'), 'Linux hides Windows rows');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#ctl')).display !== 'none'), 'Linux keeps built-in buttons');
  console.log('t9: ' + pass + ' passed, ' + fail + ' failed'); await b.close();
})();
