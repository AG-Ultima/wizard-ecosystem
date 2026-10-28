/* wizard-api-proxy-sw.js
 * Sends every app's calls to arnav0928.pythonanywhere.com through
 * wizardecosystem.dev/ai-api/... so Safari treats the login cookie as first-party.
 * If the Cloudflare Worker isn't answering, requests go straight to PythonAnywhere as before.
 */
(function () {
  const CFG = Object.assign({
    api: 'https://arnav0928.pythonanywhere.com',
    prefix: '/ai-api',
    health: '/status',
    okForMs: 5 * 60 * 1000,
    badForMs: 30 * 1000,
    probeTimeoutMs: 3000,
  }, self.WIZARD_PROXY || {});

  let okUntil = 0, badUntil = 0, probing = null;

  function proxyWorks() {
    const now = Date.now();
    if (now < okUntil) return Promise.resolve(true);
    if (now < badUntil) return Promise.resolve(false);
    if (!probing) {
      probing = (async () => {
        let ok = false;
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), CFG.probeTimeoutMs);
        try {
          const r = await fetch(self.location.origin + CFG.prefix + CFG.health, { cache: 'no-store', signal: ctl.signal });
          const d = r.ok ? await r.json() : null;
          ok = !!(d && typeof d.status === 'string');
        } catch (e) { ok = false; }
        clearTimeout(timer);
        if (ok) okUntil = Date.now() + CFG.okForMs; else badUntil = Date.now() + CFG.badForMs;
        return ok;
      })().finally(() => { probing = null; });
    }
    return probing;
  }

  async function handle(req) {
    if (!(await proxyWorks())) return fetch(req);
    const url = new URL(req.url);
    const target = self.location.origin + CFG.prefix + url.pathname + url.search;
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    try {
      return await fetch(target, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? await req.clone().arrayBuffer() : undefined,
        credentials: 'same-origin',
        redirect: 'manual',
        signal: req.signal,
      });
    } catch (e) {
      if (req.signal && req.signal.aborted) throw e;
      okUntil = 0; badUntil = Date.now() + CFG.badForMs;
      return fetch(req);
    }
  }

  self.addEventListener('install', () => { self.skipWaiting(); });
  self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
  self.addEventListener('fetch', event => {
    const u = event.request.url;
    if (u !== CFG.api && !u.startsWith(CFG.api + '/') && !u.startsWith(CFG.api + '?')) return;
    event.respondWith(handle(event.request));
  });
})();
