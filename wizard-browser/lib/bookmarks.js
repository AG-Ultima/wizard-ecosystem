'use strict';
// Parses the Netscape bookmark HTML that Vivaldi, Chrome, Firefox and Brave export.
function parseNetscape(html) {
    const out = [];
    const folders = [];
    const re = /<(\/?)(DL|H3|A)\b([^>]*)>([^<]*)/gi;
    let m, pendingFolder = null;
    const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    while ((m = re.exec(html))) {
        const close = m[1] === '/', tag = m[2].toUpperCase(), attrs = m[3], text = m[4];
        if (tag === 'H3' && !close) pendingFolder = dec(text);
        else if (tag === 'DL' && !close) { folders.push(pendingFolder); pendingFolder = null; }
        else if (tag === 'DL' && close) folders.pop();
        else if (tag === 'A' && !close) {
            const href = (/HREF="([^"]*)"/i.exec(attrs) || [])[1];
            if (href && /^https?:/i.test(dec(href))) out.push({ url: dec(href), title: dec(text) || dec(href), folder: folders.filter(Boolean).slice(-1)[0] || '' });
        }
    }
    return out;
}
module.exports = { parseNetscape };
