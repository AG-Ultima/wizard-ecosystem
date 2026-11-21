'use strict';
// Small JSON file store: one file per key under a directory. Writes are debounced and atomic
// (write to .tmp, then rename), so a crash or power loss never leaves a half-written file.
const fs = require('fs');
const path = require('path');

function createStore(dir, opts = {}) {
    const delay = opts.delay === undefined ? 400 : opts.delay;
    const cache = new Map();
    const timers = new Map();
    fs.mkdirSync(dir, { recursive: true });
    const file = key => path.join(dir, key.replace(/[^a-z0-9_-]/gi, '_') + '.json');

    function read(key, fallback) {
        if (cache.has(key)) return cache.get(key);
        let value = fallback;
        try { value = JSON.parse(fs.readFileSync(file(key), 'utf8')); }
        catch (e) {
            // A corrupt file is kept aside so nothing is lost silently.
            if (e.code !== 'ENOENT') { try { fs.renameSync(file(key), file(key) + '.corrupt-' + Date.now()); } catch (e2) { /* ignore */ } }
        }
        cache.set(key, value);
        return value;
    }
    function writeNow(key) {
        clearTimeout(timers.get(key)); timers.delete(key);
        const target = file(key), tmp = target + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cache.get(key)), { mode: 0o600 });
        fs.renameSync(tmp, target);
    }
    function write(key, value) {
        cache.set(key, value);
        clearTimeout(timers.get(key));
        if (delay === 0) return writeNow(key);
        const t = setTimeout(() => { try { writeNow(key); } catch (e) { /* disk full etc.: keep in memory */ } }, delay);
        if (t.unref) t.unref();
        timers.set(key, t);
    }
    function flush() { for (const key of [...timers.keys()]) { try { writeNow(key); } catch (e) { /* ignore */ } } }
    return { get: read, set: write, flush, file };
}

module.exports = { createStore };
