'use strict';
const path = require('path');

function isHttpUrl(u) { try { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; } catch (e) { return false; } }

// URLs / files handed to the browser on the command line (e.g. from "Open link with…" or xdg-open).
function urlsFromArgv(argv, cwd) {
    const out = [];
    for (const a of (argv || []).slice(1)) {
        if (!a || a.startsWith('-')) continue;
        if (isHttpUrl(a)) out.push(a);
        else if (/^file:\/\//i.test(a)) out.push(a);
        else if (/\.(html?|xhtml|pdf|svg)$/i.test(a)) out.push('file://' + encodeURI(path.resolve(cwd || process.cwd(), a)));
    }
    return out;
}

// Flags the jump list and shortcuts pass on the command line.
function flagsFromArgv(argv) {
    const a = (argv || []).slice(1);
    return { newTab: a.includes('--new-tab'), private: a.includes('--private') || a.includes('--incognito') };
}

// Only these schemes may be handed to the operating system (xdg-open).
function isSafeExternal(u) { try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(u).protocol); } catch (e) { return false; } }

module.exports = { isHttpUrl, urlsFromArgv, isSafeExternal, flagsFromArgv };
