const { chromium } = require('playwright'); const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (process.env.V) console.log(c ? 'ok  ' : 'FAIL', m); if (c) pass++; else { fail++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  async function open(guest, vp) { const ctx = await b.newContext({ viewport: vp || { width: 1440, height: 1000 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(guest ? 'window.__user=null;' : ''); await p.addInitScript(mock); await p.goto('file:///home/claude/wizard-ai/browser/index.html'); await p.waitForFunction(() => window.__wbReady, null, { timeout: 8000 }); await p.waitForTimeout(150); return { p, errs }; }
  let { p, errs } = await open(false);
  // defaults
  ok(await p.locator('.wg').count() === 2, 'two default widgets (ecosystem, frequently visited)');
  ok((await p.locator('.wg h4').allTextContents()).join('|') === 'Wizard Ecosystem|Frequently visited', 'default widget titles');
  ok(await p.locator('.wg[data-k="eco"] .tile').count() === 10, 'ecosystem tiles intact');
  // gallery
  await p.click('.wadd'); await p.waitForSelector('.wgal');
  ok(await p.locator('.wgal .wcard').count() === 14, 'gallery lists 14 widgets');
  for (const k of ['digest', 'weather', 'mail', 'cal', 'notes', 'fin', 'fire', 'bookmarks', 'jump', 'sleeping', 'timer', 'shield']) await p.click(`.wgal [data-w="${k}"]`);
  ok(await p.locator('.wg').count() === 14, 'all widgets added');
  await p.click('[data-done]'); await p.waitForTimeout(500);
  ok(await p.locator('.wg[data-k="mail"] .wrow').count() === 2, 'mail widget shows messages');
  ok((await p.textContent('.wg[data-k="mail"] .wcount')).includes('1'), 'mail unread count');
  ok((await p.textContent('.wg[data-k="weather"]')).includes('81'), 'weather temp');
  ok((await p.textContent('.wg[data-k="cal"]')).includes('Standup'), 'calendar shows event');
  ok((await p.textContent('.wg[data-k="fin"]')).includes('$65'), 'finance sums expenses only');
  ok((await p.textContent('.wg[data-k="fire"]')).includes('Low'), 'firewatch risk');
  const dg = await p.textContent('.wg[data-k="digest"]'); ok(dg.includes('1 unread') && dg.includes('Standup') && dg.includes('sunny'), 'digest combines mail, calendar, weather');
  await p.click('.wg[data-k="digest"] [data-brief]'); await p.waitForFunction(() => { const e = document.querySelector('.wbrief'); return e && !e.hidden && e.textContent.length > 3; }); ok(true, 'AI briefing returns text');
  // persisted
  ok(await p.evaluate(() => S.settings.widgets.length) === 16 - 2, 'layout saved in settings');
  // quick note
  await p.fill('.wg[data-k="notes"] .wnote input', 'buy milk'); await p.press('.wg[data-k="notes"] .wnote input', 'Enter'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__calls.some(c => c[1] === 'POST' && c[2] === '/api/notes' && c[3].content === 'buy milk')), 'note saved through API'); ok((await p.textContent('.wg[data-k="notes"]')).includes('buy milk'), 'new note listed');
  // move, resize, remove
  const order = () => p.evaluate(() => [...document.querySelectorAll('.wg')].map(x => x.dataset.k));
  const o1 = await order(); await p.hover('.wg[data-k="eco"]'); await p.click('.wg[data-k="eco"] [data-a="r"]'); const o2 = await order(); ok(o2[0] === o1[1] && o2[1] === 'eco', 'move later');
  await p.click('.wg[data-k="eco"] [data-a="l"]'); ok((await order())[0] === 'eco', 'move earlier');
  await p.click('.wg[data-k="eco"] [data-a="s"]'); ok(await p.evaluate(() => document.querySelector('.wg[data-k="eco"]').style.getPropertyValue('--w')) === '3', 'resize to medium');
  await p.click('.wg[data-k="shield"] [data-a="x"]'); ok(await p.locator('.wg[data-k="shield"]').count() === 0, 'remove widget');
  // drag to reorder
  await p.evaluate(() => { const dt = new DataTransfer(), h = document.querySelector('.wg[data-k="timer"] > header'), t = document.querySelector('.wg[data-k="eco"]'); h.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); h.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); }); ok((await order())[0] === 'timer', 'drag to reorder');
  // timer
  await p.click('.wg[data-k="timer"] [data-f="go"]'); await p.waitForTimeout(1200); ok((await p.textContent('.wg[data-k="timer"] .ftime')) !== '25:00', 'timer counts down'); await p.click('.wg[data-k="timer"] [data-f="go"]'); await p.click('.wg[data-k="timer"] [data-f="reset"]'); ok((await p.textContent('.wg[data-k="timer"] .ftime')) === '25:00', 'timer resets');
  // click through
  await p.click('.wg[data-k="mail"] .wrow'); ok(/wizardecosystem\.dev\/mail/.test(await p.evaluate(() => (document.querySelector('wv-stub.show') || { getAttribute: () => '' }).getAttribute('src'))), 'mail row opens Wizard Mail');
  // survives reload of the page (settings saved)
  const saved = await p.evaluate(() => JSON.stringify(S.settings.widgets)); ok(saved.includes('timer'), 'layout stored');
  // weather location picker
  await p.evaluate(() => { newTab(); }); await p.waitForSelector('#ntp.show'); await p.waitForTimeout(300);
  await p.click('.wg[data-k="weather"] [data-loc]'); await p.click('[data-p="9"]'); await p.waitForTimeout(300); ok(await p.evaluate(() => S.settings.wxLoc.name) === 'New York', 'location saved'); ok((await p.textContent('.wg[data-k="weather"]')).includes('New York'), 'weather shows new place');
  // settings toggle ties to the widget
  await p.screenshot({ path: 'shot-widgets.png' });
  ok(errs.length === 0, 'no page errors: ' + errs.join(';'));
  // Conjure regression: instruction stays under the backend's 500 character cut and the tab list rides in "text"
  await p.evaluate(() => { newTab('https://wizardecosystem.dev/maps', { background: true }); newTab('https://wizardecosystem.dev/calendar', { background: true }); newTab('https://news.test/', { background: true }); const n = S.tabs.length; S.tabs[n - 3].title = 'Wizard Maps'; S.tabs[n - 2].title = 'Wizard Calendar'; S.tabs[n - 1].title = 'Daily News'; window.__plan = { say: 'Nothing fits.', actions: [] }; window.__calls.length = 0; });
  await p.evaluate(() => window.__emit('shortcut', 'palette')); await p.fill('#pl-q', '> Group together all my tabs for wizard maps or calendar'); await p.keyboard.press('Enter'); await p.waitForSelector('#conjure');
  const call = await p.evaluate(() => window.__calls.filter(c => c[2] === '/api/notes/ai').pop()[3]);
  ok(call.instruction.length <= 500, 'instruction fits the 500 character limit (' + call.instruction.length + ')'); ok(JSON.parse(call.text).tabs.some(t => t.title === 'Wizard Maps'), 'tab list is sent in text');
  ok((await p.textContent('#conjure')).includes('Group 2 tabs'), 'local matcher groups Maps and Calendar tabs when the AI returns nothing'); await p.click('#conjure [data-ok]');
  ok(await p.evaluate(() => S.groups.length > 0 && S.tabs.filter(t => t.group).length === 2 && !S.tabs.find(t => t.title === 'Daily News').group), 'only the matching tabs were grouped');
  await p.evaluate(() => { window.__calls.length = 0; });
  // settings: a full-page tab at wizard://settings
  const tabsBefore = await p.evaluate(() => S.tabs.length);
  await p.evaluate(() => window.__emit('shortcut', 'settings')); await p.waitForSelector('#spage.show #sp-body .spcard');
  ok(await p.evaluate(() => S.tabs.length) === tabsBefore + 1 || await p.evaluate(() => activeTab().url.startsWith('wizard://settings')), 'settings opens as a tab, not a modal');
  ok(await p.evaluate(() => document.querySelector('#o-input').value) === 'wizard://settings/general', 'address bar shows wizard://settings/general'); ok(!(await p.locator('.scrim').count()), 'no modal overlay');
  ok((await p.textContent('#tablist .tab.active')).includes('Settings'), 'tab is titled Settings');
  for (const [slug, label] of [['general', 'General'], ['appearance', 'Appearance'], ['start', 'Start page'], ['privacy', 'Privacy and security'], ['passwords', 'Passwords'], ['extensions', 'Extensions'], ['sync', 'Account and sync'], ['about', 'About']]) {
    await p.click(`#sp-tabs >> text=${label}`); await p.waitForFunction(l => document.querySelector('.sp-h h1').textContent === l, label); ok(await p.evaluate(() => document.querySelector('#o-input').value) === 'wizard://settings/' + slug, label + ': address bar follows');
    const r = await p.evaluate(() => { const e = document.querySelector('#sp-scroll'); return { over: e.scrollHeight > e.clientHeight, top: (e.scrollTop = 99999, e.scrollTop) }; }); if (r.over) ok(r.top > 0, label + ': page scrolls');
  }
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#sp-scroll'), '::-webkit-scrollbar-thumb').animationName.startsWith('sbflow')), 'scrollbar thumb is themed and animated');
  // search
  await p.fill('#sp-q', 'sleep'); await p.waitForFunction(() => document.querySelector('.sp-h h1').textContent.startsWith('Results')); ok(await p.locator('#sp-body [data-sel="sleepMinutes"]').count() === 1, 'search finds the sleep setting'); ok((await p.textContent('#sp-body .sp-grp')).includes('General'), 'results grouped by section');
  await p.fill('#sp-q', 'zzzzqq'); await p.waitForFunction(() => document.querySelector('.sp-h p').textContent.includes('Nothing matches')); ok(true, 'empty search explains itself');
  await p.fill('#sp-q', ''); await p.waitForFunction(() => !document.querySelector('.sp-h h1').textContent.startsWith('Results'));
  // reuse the same tab, deep links
  await p.evaluate(() => navigate('wizard://settings/privacy')); await p.waitForFunction(() => document.querySelector('.sp-h h1').textContent === 'Privacy and security'); ok(await p.evaluate(() => S.tabs.filter(t => t.url.startsWith('wizard://')).length) === 1, 'second open reuses the settings tab');
  ok((await p.textContent('#sp-body')).includes('Widevine is installed'), 'privacy shows Widevine status');
  ok(await p.evaluate(() => document.querySelector('[data-sw="drm"]').getAttribute('aria-checked')) === 'true', 'protected content is on by default');
  await p.click('[data-sw="drm"]'); ok(await p.evaluate(() => S.settings.drm) === false, 'protected content switch saves'); await p.click('[data-sw="drm"]');
  await p.evaluate(() => { window.__drm = 'loading'; navigate('wizard://settings/privacy'); spDraw(); }); await p.waitForSelector('[data-drm-recheck]'); await p.click('[data-drm-recheck]'); await p.waitForFunction(() => document.querySelector('#sp-body').textContent.includes('Widevine is installed')); ok(true, 'check again refreshes the status');
  // start page pane: widget switches and update frequency
  await p.evaluate(() => navigate('wizard://settings/start')); await p.waitForSelector('[data-sel="widgetRefresh"]');
  ok(await p.evaluate(() => document.querySelector('[data-sel="widgetRefresh"]').value) === '5', 'update frequency defaults to every 5 minutes');
  const before = await p.evaluate(() => wList().length); await p.click('[data-wsw="timer"]'); ok(await p.evaluate(() => wList().length) !== before, 'widget switch changes the layout');
  await p.selectOption('[data-sel="widgetRefresh"]', '15'); ok(await p.evaluate(() => S.settings.widgetRefresh) === 15, 'update frequency saves');
  // leaving the settings tab by typing a URL
  await p.evaluate(() => { navigate('https://example.org/', activeTab()); }); ok(!(await p.evaluate(() => document.querySelector('#spage').classList.contains('show'))), 'navigating away hides the settings page');
  await p.evaluate(() => { const t = S.tabs.find(x => x.url.startsWith('wizard://') || x.title === 'Settings'); window.__spt = !!t; }); 
  // persisted in the session
  await p.evaluate(() => openSettings('about')); await p.waitForTimeout(700); ok(await p.evaluate(() => window.__db.session && window.__db.session.tabs.some(t => t.url === 'wizard://settings/about')), 'settings tab is saved with the session');
  // Ctrl + wheel zoom: the page preload reports it, the UI zooms
  const src = require('fs').readFileSync('/home/claude/wizard-ai/browser/webview-preload.js', 'utf8');
  const rep = await p.evaluate(src => { const sent = []; const fake = { ipcRenderer: { sendToHost: (...a) => sent.push(a), on() {}, invoke() {} } }; new Function('require', src)(() => fake); const ev = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true }); window.dispatchEvent(ev); const plain = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true }); window.dispatchEvent(plain); return { sent, prevented: ev.defaultPrevented, plainPrevented: plain.defaultPrevented }; }, src);
  ok(rep.prevented && rep.sent.some(x => x[0] === 'wb:zoom' && x[1] === 1), 'Ctrl+wheel up reports zoom in'); ok(!rep.plainPrevented, 'plain scrolling is untouched');
  await p.evaluate(() => { navigate('https://zoom.test/', activeTab()); }); await p.waitForTimeout(200);
  const z0 = await p.evaluate(() => activeTab().zoom || 0); await p.evaluate(() => { const v = activeTab().view; const ev = new Event('ipc-message'); ev.channel = 'wb:zoom'; ev.args = [1]; v.dispatchEvent(ev); }); ok(await p.evaluate(() => activeTab().zoom) > z0, 'zoom event from the page zooms the tab');
  await p.evaluate(() => { const v = activeTab().view; const ev = new Event('ipc-message'); ev.channel = 'wb:zoom'; ev.args = [-1]; v.dispatchEvent(ev); }); ok(await p.evaluate(() => activeTab().zoom) === z0, 'and zooms back out');
  // widgets refresh on their own while the browser stays open
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const q = await ctx.newPage(); await q.clock.install(); await q.addInitScript(mock); await q.goto('file:///home/claude/wizard-ai/browser/index.html'); await q.waitForFunction(() => window.__wbReady); await q.clock.runFor(500);
    await q.evaluate(() => { S.settings.widgets = [{ k: 'mail', w: 3 }]; renderNtp(document.querySelector('#ntp')); }); await q.clock.runFor(500);
    const n = () => q.evaluate(() => window.__calls.filter(c => String(c[2]).startsWith('/api/mail/emails')).length);
    const n0 = await n(); await q.clock.runFor(4 * 60000); ok(await n() === n0, 'no refresh before the interval (5 min default)'); await q.clock.runFor(61000); ok(await n() > n0, 'mail refreshes after 5 minutes without reopening the browser');
    await q.evaluate(() => { saveSettings({ widgetRefresh: 1 }); wSchedule(); }); const n1 = await n(); await q.clock.runFor(61000); ok(await n() > n1, 'a 1 minute setting refreshes every minute');
    await q.evaluate(() => { saveSettings({ widgetRefresh: 0 }); wSchedule(); }); const n2 = await n(); await q.clock.fastForward(30 * 60000); ok(await n() === n2, 'manual mode never refreshes by itself');
    await q.click('.wrefresh'); await q.clock.runFor(300); ok(await n() > n2, 'Refresh button fetches fresh data'); await ctx.close(); }
  // startup: widgets wait for the sign-in check instead of claiming you are signed out
  async function boot(init) { const c = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const q = await c.newPage(); await q.addInitScript(init); await q.addInitScript(mock); await q.goto('file:///home/claude/wizard-ai/browser/index.html'); await q.waitForFunction(() => window.__wbReady); await q.evaluate(() => { S.settings.widgets = [{ k: 'mail', w: 3 }]; renderNtp(document.querySelector('#ntp')); }); return { q, c }; }
  { const { q, c } = await boot('window.__authDelay = 900;'); await q.waitForTimeout(250); const early = await q.textContent('.wg[data-k="mail"]'); ok(!early.includes('Sign in') && await q.locator('.wskel').count() === 1, 'slow sign-in check: widget shows loading, not "Sign in"'); await q.waitForSelector('.wg[data-k="mail"] .wrow', { timeout: 4000 }); ok(true, 'widget fills in by itself once sign-in is confirmed'); await c.close(); }
  { const { q, c } = await boot('window.__authFail = 500; window.__authRetry = [0, 400, 400, 400];'); await q.waitForTimeout(300); ok(!(await q.textContent('.wg[data-k="mail"]')).includes('Sign in'), 'server asleep: still no false "Sign in"'); await q.evaluate(() => { window.__authFail = 0; }); await q.waitForSelector('.wg[data-k="mail"] .wrow', { timeout: 4000 }); ok(true, 'startup retries until the server answers, then widgets update'); await c.close(); }
  { const { q, c } = await boot('window.__authFail = 500; window.__authRetry = [0, 100];'); await q.waitForSelector('[data-retry]', { timeout: 3000 }); ok((await q.textContent('.wg[data-k="mail"]')).includes('Could not reach Wizard'), 'gives up politely when the server never answers'); await c.close(); }
  // Conjure shortcut
  await p.evaluate(() => { window.__calls.length = 0; window.__emit('shortcut', 'conjure'); }); await p.waitForSelector('#cj-q'); ok(true, 'Ctrl+Space opens the Conjure prompt'); await p.click('[data-ex] >> nth=0'); ok((await p.inputValue('#cj-q')).length > 5, 'examples fill the prompt'); await p.fill('#cj-q', 'group my wizard maps or calendar tabs'); await p.press('#cj-q', 'Enter'); await p.waitForSelector('#conjure'); ok(await p.evaluate(() => window.__calls.some(c => c[2] === '/api/notes/ai')), 'Enter sends it to Conjure'); await p.evaluate(() => document.querySelector('#conjure') && document.querySelector('#conjure').remove());
  // greetings
  { const c = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const q = await c.newPage(); await q.clock.install(); await q.addInitScript(mock); await q.goto('file:///home/claude/wizard-ai/browser/index.html'); await q.waitForFunction(() => window.__wbReady); await q.clock.runFor(800);
    const g = () => q.evaluate(() => document.querySelector('.greet').textContent);
    const g0 = await g(); ok(g0.length > 3 && !g0.includes('workspace workspace'), 'cycle mode shows a greeting: ' + g0); await q.clock.runFor(8300); const g1 = await g(); ok(g1 !== g0, 'greeting rotates by itself: ' + g1);
    const seen = new Set([g0, g1]); for (let i = 0; i < 4; i++) { await q.clock.runFor(8300); seen.add(await g()); } ok(seen.size >= 4, 'cycles through several different greetings (' + seen.size + ')');
    await q.evaluate(() => { saveSettings({ greetMode: 'workspace' }); renderNtp(document.querySelector('#ntp')); }); ok((await g()).includes('workspace'), 'workspace mode keeps the old greeting');
    await q.evaluate(() => { localStorage.removeItem('wb_greet'); saveSettings({ greetMode: 'ai' }); window.__calls.length = 0; renderNtp(document.querySelector('#ntp')); }); await q.clock.runFor(1500);
    ok(await g() === 'Good evening! Standup is at 11 PM.', 'AI mode shows the line Wizard AI wrote: ' + await g()); const aiCall = await q.evaluate(() => window.__calls.filter(c => c[2] === '/api/notes/ai' && /greeting line/.test(c[3].instruction)).map(c => c[3])); ok(aiCall.length === 1 && aiCall[0].instruction.length <= 500 && aiCall[0].text.includes('Standup') && aiCall[0].text.includes('Ada Lovelace'), 'AI sees mail and calendar facts, instruction fits 500 chars');
    await q.evaluate(() => { window.__calls.length = 0; renderNtp(document.querySelector('#ntp')); }); await q.clock.runFor(1500); ok(await q.evaluate(() => window.__calls.filter(c => /greeting line/.test((c[3] || {}).instruction || '')).length) === 0, 'cached: opening more tabs does not call the AI again'); await c.close(); }
  // signed out
  ({ p, errs } = await open(true)); await p.click('.wadd'); await p.click('[data-w="mail"]'); await p.click('[data-done]'); ok((await p.textContent('.wg[data-k="mail"]')).includes('Sign in'), 'signed-out network widget asks to sign in'); ok(await p.locator('.wg[data-k="eco"] .tile').count() === 10, 'local widgets work signed out');
  // mobile
  ({ p, errs } = await open(false, { width: 700, height: 900 })); ok(await p.evaluate(() => document.querySelector('#wgrid').getBoundingClientRect().right <= document.querySelector('#ntp').getBoundingClientRect().right), 'no horizontal overflow when narrow');
  console.log('t8: ' + pass + ' passed, ' + fail + ' failed'); await b.close();
})();
