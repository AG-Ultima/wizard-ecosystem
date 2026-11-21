'use strict';
// CRX (Chrome extension package) reader + a small ZIP extractor, so no extra npm packages are needed.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRX2: "Cr24" v2 | pubkey len | sig len | key | sig | zip.  CRX3: "Cr24" v3 | header len | header | zip.
function crxToZip(buf) {
    if (buf.length > 4 && buf.toString('latin1', 0, 4) === 'PK\x03\x04') return buf;          // already a zip
    if (buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('Not a Chrome extension package');
    const ver = buf.readUInt32LE(4);
    if (ver === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
    if (ver === 3) return buf.subarray(12 + buf.readUInt32LE(8));
    throw new Error('Unsupported CRX version ' + ver);
}

function listZip(zip) {
    let eocd = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Corrupt zip (no directory)');
    const count = zip.readUInt16LE(eocd + 10);
    let p = zip.readUInt32LE(eocd + 16);
    const out = [];
    for (let n = 0; n < count; n++) {
        if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory');
        const method = zip.readUInt16LE(p + 10), csize = zip.readUInt32LE(p + 20), usize = zip.readUInt32LE(p + 24);
        const nlen = zip.readUInt16LE(p + 28), elen = zip.readUInt16LE(p + 30), clen = zip.readUInt16LE(p + 32);
        const off = zip.readUInt32LE(p + 42);
        out.push({ name: zip.toString('utf8', p + 46, p + 46 + nlen), method, csize, usize, off });
        p += 46 + nlen + elen + clen;
    }
    return out;
}

function extractZip(zip, dest, limits = {}) {
    const maxFiles = limits.maxFiles || 5000, maxBytes = limits.maxBytes || 300 * 1024 * 1024;
    const entries = listZip(zip);
    if (entries.length > maxFiles) throw new Error('Package has too many files');
    let total = 0;
    const root = path.resolve(dest);
    fs.mkdirSync(root, { recursive: true });
    for (const e of entries) {
        const target = path.resolve(root, e.name);
        if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Unsafe path in package');   // zip-slip
        if (e.name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
        const nlen = zip.readUInt16LE(e.off + 26), elen = zip.readUInt16LE(e.off + 28);
        const data = zip.subarray(e.off + 30 + nlen + elen, e.off + 30 + nlen + elen + e.csize);
        let raw;
        if (e.method === 0) raw = data;
        else if (e.method === 8) raw = zlib.inflateRawSync(data, { maxOutputLength: maxBytes });
        else throw new Error('Unsupported compression in package');
        total += raw.length;
        if (total > maxBytes) throw new Error('Package is too large');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, raw);
    }
    return entries.length;
}

module.exports = { crxToZip, extractZip, listZip };
