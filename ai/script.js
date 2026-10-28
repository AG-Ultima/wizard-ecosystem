/* ============================================================
   WIZARD.AI v16 — Grimoire Reforged
   Frontend controller · Created by Arnav Gupta
   ============================================================ */
(() => {
'use strict';

const API = (typeof window.WIZARD_API_BASE === 'string') ? window.WIZARD_API_BASE : 'https://arnav0928.pythonanywhere.com';
const SITE = 'https://wizardecosystem.dev/ai';
const VERSION = '16.0.0';

// <PURE>
/* ---------- tiny pure helpers (unit-tested in node) ---------- */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC_MAP[c]); }

// The server sends naive UTC (datetime.utcnow().isoformat()) with no "Z".
// Without this fix every timestamp is read as local time and is hours off.
function parseTs(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    let s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}[T ][\d:.]+$/.test(s)) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return isNaN(d) ? null : d;
}
function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function groupLabel(d, now) {
    if (!d) return 'Older';
    const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff <= 7) return 'Previous 7 days';
    if (diff <= 30) return 'Previous 30 days';
    return 'Older';
}
const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

// subsequence fuzzy match. returns -1 for no match, higher is better
function fuzzy(q, t) {
    q = String(q || '').toLowerCase().trim(); t = String(t || '').toLowerCase();
    if (!q) return 0;
    const idx = t.indexOf(q);
    if (idx >= 0) return 1000 - idx - (t.length - q.length) * 0.01;
    let qi = 0, score = 0, last = -2;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) {
            score += (last === i - 1) ? 5 : 1;
            if (i === 0 || /[\s\-_/]/.test(t[i - 1])) score += 3;
            last = i; qi++;
        }
    }
    return qi === q.length ? score : -1;
}

function highlightTerm(text, q) {
    const t = String(text || '');
    q = String(q || '').trim();
    if (!q) return esc(t);
    const i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
}

/* ---------- syntax highlighting (small, dependency-free) ---------- */
const KW = {
    py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self cls',
    js: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new null of return static super switch this throw try typeof undefined var void while with yield true false interface type enum implements public private protected readonly as',
    sh: 'if then else elif fi for while do done case esac in function return exit export local echo cd ls rm cp mv cat grep sed awk sudo git npm pip python node true false',
    sql: 'select from where and or not insert into values update set delete create table drop alter add join left right inner outer on group by order having limit offset as distinct union all null is in like between exists case when then else end primary key foreign references index default unique',
    clike: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected new delete this namespace using template typename virtual override final import package interface extends implements throws try catch finally throw null true false nil func fn let mut pub impl trait use mod match loop self Self string bool var val fun object when in is as defer go chan select range map type',
    css: '',
    json: 'true false null',
    yaml: 'true false null yes no on off'
};
const LANG_ALIAS = {
    python: 'py', py: 'py', python3: 'py',
    javascript: 'js', js: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', mjs: 'js', node: 'js',
    json: 'json', jsonc: 'json',
    bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh',
    css: 'css', scss: 'css', less: 'css',
    html: 'html', xml: 'html', svg: 'html', vue: 'html',
    sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql', sqlite: 'sql',
    c: 'clike', cpp: 'clike', 'c++': 'clike', h: 'clike', java: 'clike', go: 'clike', golang: 'clike', rust: 'clike', rs: 'clike',
    cs: 'clike', csharp: 'clike', kotlin: 'clike', swift: 'clike', php: 'clike', scala: 'clike', dart: 'clike',
    yaml: 'yaml', yml: 'yaml', toml: 'yaml', ini: 'yaml'
};
const kwSets = {};
function kwSet(k) { return kwSets[k] || (kwSets[k] = new Set((KW[k] || '').split(' ').filter(Boolean))); }
const hl = (cls, s) => '<span class="tk-' + cls + '">' + esc(s) + '</span>';

function lexGeneric(code, kind) {
    const lineC = kind === 'py' || kind === 'sh' || kind === 'yaml' ? String.raw`#[^\n]*`
        : kind === 'sql' ? String.raw`--[^\n]*` : String.raw`\/\/[^\n]*`;
    const blockC = (kind === 'js' || kind === 'clike' || kind === 'sql') ? String.raw`|\/\*[\s\S]*?(?:\*\/|$)` : '';
    const triple = kind === 'py' ? String.raw`"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|` : '';
    const str = triple + String.raw`"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|\x60(?:[^\x60\\]|\\.)*\x60?`;
    const re = new RegExp(
        '(?<c>' + lineC + blockC + ')|(?<s>' + str + ')|(?<n>\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)|(?<w>[A-Za-z_$][\\w$]*)|(?<o>[=<>!+\\-*/%&|^~?:]+)', 'g');
    const kws = kwSet(kind);
    const ci = kind === 'sql';
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
        if (m.index > last) out += esc(code.slice(last, m.index));
        const g = m.groups, t = m[0];
        if (g.c !== undefined) out += hl('c', t);
        else if (g.s !== undefined) {
            let key = false;
            if (kind === 'json' || kind === 'yaml') key = /^\s*:/.test(code.slice(re.lastIndex, re.lastIndex + 12));
            out += hl(key ? 't' : 's', t);
        }
        else if (g.n !== undefined) out += hl('n', t);
        else if (g.w !== undefined) {
            if (kws.has(ci ? t.toLowerCase() : t)) out += hl('k', t);
            else if (code[re.lastIndex] === '(') out += hl('f', t);
            else if (kind === 'yaml' && code[re.lastIndex] === ':') out += hl('t', t);
            else out += esc(t);
        }
        else out += hl('o', t);
        last = re.lastIndex;
        if (m[0].length === 0) re.lastIndex++;
    }
    return out + esc(code.slice(last));
}
function lexHtml(code) {
    const re = /(<!--[\s\S]*?(?:-->|$))|(<\/?[A-Za-z][\w:.-]*)|("[^"]*"|'[^']*')|(\/?>)|([\w:-]+)(?==)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
        if (m.index > last) out += esc(code.slice(last, m.index));
        if (m[1]) out += hl('c', m[0]); else if (m[2]) out += hl('t', m[0]); else if (m[3]) out += hl('s', m[0]);
        else if (m[4]) out += hl('t', m[0]); else out += hl('f', m[0]);
        last = re.lastIndex;
    }
    return out + esc(code.slice(last));
}
function lexCss(code) {
    const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([-\w]+)(?=\s*:)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
        if (m.index > last) out += esc(code.slice(last, m.index));
        if (m[1]) out += hl('c', m[0]); else if (m[2]) out += hl('s', m[0]); else if (m[3]) out += hl('k', m[0]);
        else if (m[4]) out += hl('n', m[0]); else out += hl('t', m[0]);
        last = re.lastIndex;
    }
    return out + esc(code.slice(last));
}
function highlight(code, lang) {
    const kind = LANG_ALIAS[String(lang || '').toLowerCase()];
    if (!kind || code.length > 40000) return esc(code);
    try {
        if (kind === 'html') return lexHtml(code);
        if (kind === 'css') return lexCss(code);
        return lexGeneric(code, kind);
    } catch (e) { return esc(code); }
}

/* ---------- markdown → safe HTML ----------
   Everything is escaped BEFORE any markup is added, so model output can
   never inject HTML. Only http(s)/mailto links are ever produced. */
function inline(src) {
    const stash = [];
    const hold = h => { stash.push(h); return '\u0000' + (stash.length - 1) + '\u0000'; };
    let s = String(src).replace(/\u0000/g, '');

    s = s.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => hold('<code>' + esc(c.trim()) + '</code>'));
    s = esc(s);

    const emph = t => t
        .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?![\w])/g, '$1<strong>$2</strong>')
        .replace(/\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '<em>$1</em>')
        .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w])/g, '$1<em>$2</em>')
        .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

    s = s.replace(/!?\[([^\]\n]+)\]\(\s*([^\s)]+)(?:\s+&quot;[^)]*?&quot;)?\s*\)/g, (all, text, url) => {
        if (!/^(https?:\/\/|mailto:)/i.test(url)) return text;
        const label = all.charAt(0) === '!' ? '🖼 ' + text : text;
        return hold('<a href="' + url + '" target="_blank" rel="noopener noreferrer nofollow">' + emph(label) + '</a>');
    });
    s = s.replace(/\bhttps?:\/\/[^\s<>]+/g, u => {
        let tail = '';
        const cut = u.search(/&lt;|&gt;|&quot;|&#39;/);
        if (cut >= 0) { tail = u.slice(cut); u = u.slice(0, cut); }
        const m = /[.,;:!?)\]]+$/.exec(u);
        if (m) { tail = m[0] + tail; u = u.slice(0, u.length - m[0].length); }
        if (u.length < 9) return u + tail;
        return hold('<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + u + '</a>') + tail;
    });
    s = emph(s).replace(/\n/g, '<br>');
    for (let k = 0; k < 6 && /\u0000\d+\u0000/.test(s); k++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[+n] || '');
    return s;
}

const RE_FENCE = /^\s{0,12}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_LIST = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/;
const RE_TDELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

function splitRow(line) {
    let t = line.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
    const cells = []; let cur = '';
    for (let i = 0; i < t.length; i++) {
        if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; }
        else if (t[i] === '|') { cells.push(cur.trim()); cur = ''; }
        else cur += t[i];
    }
    cells.push(cur.trim());
    return cells;
}

function isTable(l, next) {
    return next !== undefined && l.includes('|') && RE_TDELIM.test(next) && next.includes('-') &&
        splitRow(l).length === splitRow(next).length;
}

function codeBlock(code, lang) {
    const safe = String(lang || '').replace(/[^\w+#.-]/g, '').slice(0, 20);
    const canPreview = /^(html?|svg)$/i.test(safe) || (!safe && /^\s*(<!doctype html|<html[\s>])/i.test(code));
    return '<div class="codeblock"><div class="code-head"><span class="lang">' + esc(safe || 'text') + '</span>' +
        (canPreview ? '<button type="button" data-act="preview" title="Run this page in a safe preview"><i data-icon="play"></i><span>Preview</span></button>' : '') +
        '<button type="button" data-act="dl-code" title="Download as a file"><i data-icon="download"></i></button>' +
        '<button type="button" data-act="wrap" title="Toggle line wrapping"><i data-icon="wrap"></i></button>' +
        '<button type="button" data-act="copy-code" title="Copy code"><i data-icon="copy"></i><span>Copy</span></button></div>' +
        '<pre><code>' + highlight(code, safe) + '</code></pre></div>';
}

function renderNodes(nodes) {
    let html = '', k = 0;
    while (k < nodes.length) {
        const ord = nodes[k].ordered; let j = k, lis = '';
        while (j < nodes.length && nodes[j].ordered === ord) {
            const n = nodes[j];
            let t = n.text, box = '';
            const tm = /^\[( |x|X)\]\s+/.exec(t);
            if (tm) { box = tm[1] === ' ' ? '☐ ' : '☑ '; t = t.slice(tm[0].length); }
            lis += '<li>' + box + inline(t) + (n.children.length ? renderNodes(n.children) : '') + '</li>';
            j++;
        }
        html += ord ? '<ol' + (nodes[k].start > 1 ? ' start="' + nodes[k].start + '"' : '') + '>' + lis + '</ol>' : '<ul>' + lis + '</ul>';
        k = j;
    }
    return html;
}

function md(src) {
    src = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    const lines = src.split('\n');
    const out = [];
    let i = 0;
    const isBlockStart = (l, next) => RE_FENCE.test(l) || RE_HEAD.test(l) || RE_HR.test(l) || /^\s{0,3}>/.test(l) ||
        (RE_LIST.test(l) && !RE_HR.test(l)) || isTable(l, next);

    while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === '') { i++; continue; }

        let m = RE_FENCE.exec(line);
        if (m) {
            const fence = m[1], lang = m[2];
            const closer = new RegExp('^\\s{0,12}' + (fence[0] === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$');
            const indent = /^\s*/.exec(line)[0].length;
            const buf = []; i++;
            while (i < lines.length && !closer.test(lines[i])) { buf.push(lines[i].replace(new RegExp('^\\s{0,' + indent + '}'), '')); i++; }
            i++;
            out.push(codeBlock(buf.join('\n'), lang));
            continue;
        }
        if ((m = RE_HEAD.exec(line))) {
            const lvl = Math.min(m[1].length, 4);
            out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>');
            i++; continue;
        }
        if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }
        if (/^\s{0,3}>/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s{0,3}>/.test(lines[i])) { buf.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++; }
            out.push('<blockquote>' + md(buf.join('\n')) + '</blockquote>');
            continue;
        }
        if (isTable(line, lines[i + 1])) {
            const head = splitRow(line);
            const aligns = splitRow(lines[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '');
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|') && !RE_FENCE.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
            const cell = (tag, c, idx) => '<' + tag + (aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : '') + '>' + inline(c) + '</' + tag + '>';
            out.push('<div class="tablewrap"><table><thead><tr>' + head.map((c, k) => cell('th', c, k)).join('') + '</tr></thead><tbody>' +
                rows.map(r => '<tr>' + head.map((_, k) => cell('td', r[k] || '', k)).join('') + '</tr>').join('') + '</tbody></table></div>');
            continue;
        }
        if ((m = RE_LIST.exec(line))) {
            const items = [];
            while (i < lines.length) {
                const l = lines[i];
                const lm = RE_LIST.exec(l);
                if (lm && !RE_HR.test(l)) {
                    items.push({ indent: lm[1].replace(/\t/g, '    ').length, ordered: !!lm[3], start: lm[3] ? +lm[3] : 1, text: lm[4], children: [] });
                    i++; continue;
                }
                if (l.trim() === '') {
                    let j = i + 1;
                    while (j < lines.length && lines[j].trim() === '') j++;
                    if (j < lines.length && !RE_FENCE.test(lines[j]) && ((RE_LIST.test(lines[j]) && !RE_HR.test(lines[j])) || /^\s{2,}\S/.test(lines[j]))) { i = j; continue; }
                    break;
                }
                if (/^\s+\S/.test(l) && !RE_FENCE.test(l) && items.length) { items[items.length - 1].text += '\n' + l.trim(); i++; continue; }
                break;
            }
            const root = { children: [], indent: -1 };
            const stack = [root];
            for (const it of items) {
                while (stack.length > 1 && it.indent <= stack[stack.length - 1].indent) stack.pop();
                stack[stack.length - 1].children.push(it);
                stack.push(it);
            }
            out.push(renderNodes(root.children));
            continue;
        }
        const buf = [line]; i++;
        while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i], lines[i + 1])) { buf.push(lines[i]); i++; }
        out.push('<p>' + inline(buf.join('\n')) + '</p>');
    }
    return out.join('');
}

// Does this message look like it needs live information?
const FRESH_RE = /\b(today|tonight|right now|latest|breaking|news|headlines?|current(ly)?|this (week|month|year)|score|scores|standings|weather|forecast|temperature|stock|stocks|price of|prices?|exchange rate|who (won|is winning)|release date|trending|just (released|announced))\b/i;

function toMarkdownExport(chat) {
    const lines = ['# ' + (chat.name || 'Chat'), ''];
    for (const m of chat.messages || []) {
        lines.push('**' + (m.sender === 'user' ? 'You' : 'Wizard.AI') + '**', '', String(m.text || ''), '');
        if (m.image) lines.push('![' + (m.prompt || 'image') + '](' + m.image + ')', '');
    }
    return lines.join('\n');
}
// </PURE>

/* ---------- DOM + storage helpers ---------- */
const $ = id => document.getElementById(id);
const qs = (sel, root) => (root || document).querySelector(sel);
const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const store = {
    get(k, d) { try { const v = localStorage.getItem('wiz.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('wiz.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem('wiz.' + k); } catch (e) { } },
    wipe() { try { Object.keys(localStorage).filter(k => k.startsWith('wiz.') && k !== 'wiz.settings').forEach(k => localStorage.removeItem(k)); } catch (e) { } }
};

/* ---------- icons (Feather-style, inline) ---------- */
const ICONS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    sidebar: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>',
    'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
    'arrow-down': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    keyboard: '<rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="8" y1="12" x2="8.01" y2="12"/><line x1="12" y1="12" x2="12.01" y2="12"/><line x1="16" y1="12" x2="16.01" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    sparkles: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    wrap: '<line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/>',
    file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
};
function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
}
function hydrate(root) {
    qsa('i[data-icon]:not([data-done])', root || document).forEach(el => {
        el.innerHTML = icon(el.getAttribute('data-icon'));
        el.setAttribute('data-done', '1');
    });
}
function setIcon(el, name) { if (!el) return; const i = qs('i[data-icon]', el); if (i) { i.setAttribute('data-icon', name); i.innerHTML = icon(name); i.setAttribute('data-done', '1'); } }

/* ---------- toasts, snackbar, clipboard ---------- */
function toast(msg, kind, ms) {
    const box = $('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms || (kind === 'err' ? 5200 : 2600));
}
let snackTimer = null, snackUndo = null;
function snack(text, onUndo, ms) {
    $('snack-text').textContent = text;
    $('snack').hidden = false;
    snackUndo = onUndo;
    $('snack-undo').hidden = !onUndo;
    clearTimeout(snackTimer);
    snackTimer = setTimeout(hideSnack, ms || 7000);
}
function hideSnack() { $('snack').hidden = true; snackUndo = null; clearTimeout(snackTimer); }

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e2) { return false; }
    }
}
function downloadBlob(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function safeFile(name) { return String(name || 'chat').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'chat'; }
function fmtTime(d) { return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
function fmtDay(d) {
    if (!d) return '';
    const now = new Date();
    return groupLabel(d, now) === 'Today' ? fmtTime(d) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + fmtTime(d);
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* ============================================================
   STATE, API, POPOVERS, MODALS
   ============================================================ */
const MODES = [
    { id: 'JARVIS', emoji: '🎩', name: 'JARVIS', desc: 'Sophisticated, precise, quietly witty.' },
    { id: 'Normal', emoji: '✨', name: 'Normal', desc: 'Balanced, friendly conversation.' },
    { id: 'Fast', emoji: '⚡', name: 'Fast', desc: 'Short, quick answers.' },
    { id: 'Fun', emoji: '🎉', name: 'Fun', desc: 'Playful and energetic.' },
    { id: 'Sarcastic', emoji: '😏', name: 'Sarcastic', desc: 'Dry wit, still helpful.' },
    { id: 'Nerd', emoji: '🧠', name: 'Nerd', desc: 'Detailed and academic.' },
    { id: 'ORACLE', emoji: '🔮', name: 'ORACLE', desc: 'Mystical and all-knowing.' }
];
const modeOf = id => MODES.find(m => m.id === id) || MODES[0];
const DEFAULT_TITLES = ['New Chat', 'Main Chat', 'New chat'];
const MAX_LEN = 16000;

const S = {
    user: null, chats: [], chat: null, hits: [],
    searchSeq: 0, busy: false, phase: 'idle', ctl: null, turn: null,
    filter: '', openSeq: 0, listLoading: false,
    webOn: false, attach: [], stick: true, model: store.get('model', 'auto'), tiers: [],
    menuChatId: null, renderFrom: 0, lastSend: null,
    settings: Object.assign({ enterSends: true, autoWeb: true, calm: false, density: 'cozy', collapsed: false }, store.get('settings', {})),
    personas: store.get('persona', {}),
    profile: null, deferredInstall: null, tzSent: false
};
const mobileMQ = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false, addEventListener() { } };
const reduceMotion = () => S.settings.calm || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function applySettings() {
    document.body.classList.toggle('calm', !!S.settings.calm);
    document.body.classList.remove('density-cozy', 'density-compact', 'density-roomy');
    document.body.classList.add('density-' + (S.settings.density || 'cozy'));
    const sh = $('shell'); if (sh) sh.classList.toggle('collapsed', !!S.settings.collapsed && !mobileMQ.matches);
    store.set('settings', S.settings);
}

/* ---------- connection state ---------- */
function setConn(state) {
    const c = $('conn'); if (!c) return;
    const wasOff = S.offline;
    S.offline = state === 'off';
    c.classList.toggle('off', state === 'off');
    c.classList.toggle('warn', state === 'warn');
    $('conn-text').textContent = state === 'off' ? 'Offline' : state === 'warn' ? 'Reconnecting' : 'Connected';
    if (S.offline) showBanner('You appear to be offline — messages can’t be sent until the connection is back.', false);
    else if (wasOff) hideBanner();
}
function showBanner(text, err) { const b = $('banner'); b.textContent = text; b.classList.toggle('err', !!err); b.hidden = false; }
function hideBanner() { $('banner').hidden = true; }

/* ---------- API ---------- */
class ApiError extends Error {
    constructor(status, msg, data) { super(msg); this.status = status; this.data = data || {}; }
}
function waitText(sec) {
    sec = Math.max(1, Math.round(sec));
    return sec < 90 ? sec + ' seconds' : Math.ceil(sec / 60) + ' minutes';
}
async function api(path, o) {
    o = o || {};
    const init = { method: o.method || 'GET', credentials: 'include', signal: o.signal, headers: {} };
    if (o.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
    if (o.form) init.body = o.form;
    let res;
    try { res = await fetch(API + path, init); }
    catch (e) {
        if (e && e.name === 'AbortError') throw e;
        setConn('off');
        throw new ApiError(0, 'Can’t reach the Wizard.AI server. Check your connection and try again.');
    }
    if (S.offline) setConn('ok');
    let data = null;
    try { data = await res.json(); } catch (e) { /* not json */ }
    if (!res.ok) {
        if (res.status === 401 && !o.noAuthRedirect) sessionLost();
        let msg = (data && data.error) || (res.status >= 500 ? 'The server hit a problem. Please try again.' : 'Request failed (' + res.status + ')');
        if (res.status === 429 && data && data.retry_after && !/try again/i.test(msg)) msg += ' Try again in ' + waitText(data.retry_after) + '.';
        throw new ApiError(res.status, msg, data);
    }
    return data || {};
}
const errMsg = e => (e && e.message) ? e.message : 'Something went wrong.';

function sessionLost() {
    if (!S.user) return;
    S.user = null;
    wipeUserData();
    closeAllModals(); closePops();
    showGate('Your session has ended. Please log in again.');
}
function wipeUserData() {
    store.wipe();
    S.chats = []; S.chat = null; S.hits = []; S.profile = null; S.attach = []; S.personas = {};
    pendingDeletes.forEach(p => clearTimeout(p.timer)); pendingDeletes.clear();
}

/* ---------- popovers ---------- */
let openPopEl = null, openPopAnchor = null;
function closePops() {
    if (openPopEl) {
        openPopEl.hidden = true;
        if (openPopAnchor && openPopAnchor.setAttribute) openPopAnchor.setAttribute('aria-expanded', 'false');
        qsa('.more[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    }
    openPopEl = null; openPopAnchor = null;
}
function openPop(pop, anchor, opts) {
    opts = opts || {};
    const same = openPopEl === pop && openPopAnchor === anchor;
    closePops();
    if (same) return;
    pop.hidden = false;
    openPopEl = pop; openPopAnchor = anchor;
    if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = opts.alignRight ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    let top = r.bottom + 6;
    if (opts.up || top + ph > vh - 8) top = r.top - ph - 6;
    if (top < 8) top = Math.max(8, Math.min(r.bottom + 6, vh - ph - 8));
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    const first = qs('button', pop); if (first && opts.focus !== false) first.focus({ preventScroll: true });
}

/* ---------- modals ---------- */
const modalStack = [];
function openModal(id) {
    const m = $(id); if (!m) return;
    closePops();
    if (m.hidden) {
        m._opener = document.activeElement;
        m.hidden = false;
        modalStack.push(id);
        document.body.style.overflow = 'hidden';
    }
    hydrate(m);
    const f = qs('input:not([type=hidden]):not([hidden]), textarea, select', m);
    const target = qs('[autofocus]', m) || f;
    if (target && !m.classList.contains('lightbox')) setTimeout(() => { try { target.focus({ preventScroll: true }); } catch (e) { } }, 30);
}
function closeModal(id) {
    const m = typeof id === 'string' ? $(id) : id; if (!m || m.hidden) return;
    m.hidden = true;
    if (m.id === 'm-preview') { const f = $('preview-frame'); if (f) f.srcdoc = ''; }
    const k = modalStack.indexOf(m.id); if (k >= 0) modalStack.splice(k, 1);
    if (!modalStack.length) document.body.style.overflow = '';
    if (m._opener && m._opener.focus && document.contains(m._opener)) { try { m._opener.focus({ preventScroll: true }); } catch (e) { } }
    if (m.id === 'm-confirm' && confirmResolve) { const r = confirmResolve; confirmResolve = null; r(false); }
}
function closeAllModals() { modalStack.slice().forEach(closeModal); }
function topModal() { return modalStack.length ? $(modalStack[modalStack.length - 1]) : null; }

let confirmResolve = null;
function confirmBox(o) {
    return new Promise(resolve => {
        $('confirm-title').textContent = o.title || 'Are you sure?';
        $('confirm-body').textContent = o.body || '';
        const y = $('confirm-yes');
        y.textContent = o.yes || 'Confirm';
        y.className = 'btn ' + (o.danger ? 'danger' : 'primary');
        if (confirmResolve) confirmResolve(false);
        confirmResolve = resolve;
        openModal('m-confirm');
        y.focus();
    });
}
function resolveConfirm(v) {
    const r = confirmResolve; confirmResolve = null;
    closeModal('m-confirm');
    if (r) r(v);
}

/* ---------- gate / shell ---------- */
function hideBoot() {
    const b = $('boot');
    if (b && !b.classList.contains('gone')) { b.classList.add('gone'); setTimeout(() => b.remove(), 700); }
}
function showGate(msg) {
    $('shell').hidden = true; $('gate').hidden = false;
    const e = $('gate-error'); e.hidden = !msg; e.textContent = msg || '';
    document.title = 'Wizard.AI Pro — your magical AI workspace';
    hideBoot();
}
function showShell() { $('gate').hidden = true; $('shell').hidden = false; applySettings(); hideBoot(); }
let progTimer = null;
function progress(on) {
    const p = $('progress'); if (!p) return;
    clearTimeout(progTimer);
    if (on) { p.className = ''; void p.offsetWidth; p.className = 'on'; }
    else { p.className = 'done'; progTimer = setTimeout(() => { p.className = ''; }, 700); }
}

function renderUser() {
    const u = S.user; if (!u) return;
    const full = ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || 'Wizard';
    $('user-name').textContent = full;
    $('user-email').textContent = u.email || '';
    $('user-avatar').textContent = ((u.first_name || '?')[0] + (u.last_name || '')[0] || '').toUpperCase();
}

/* ============================================================
   CHATS: list, open, create, rename, delete
   ============================================================ */
const sortedChats = () => S.chats.slice().sort((a, b) => ((parseTs(b.updated_at) || 0) - (parseTs(a.updated_at) || 0)));
function summaryOf(chat) {
    const msgs = chat.messages || [];
    const last = msgs.length ? msgs[msgs.length - 1].text : '';
    return {
        chat_id: chat.chat_id, name: chat.name, emoji: chat.emoji, mode: chat.mode,
        updated_at: chat.updated_at || new Date().toISOString(), message_count: msgs.length, preview: String(last || '').slice(0, 90)
    };
}
function upsertSummary(s) {
    const i = S.chats.findIndex(c => c.chat_id === s.chat_id);
    if (i >= 0) S.chats[i] = Object.assign({}, S.chats[i], s); else S.chats.unshift(s);
}
function cacheList() { store.set('chats', S.chats); }
function cacheChat(chat) {
    if (!chat) return;
    store.set('c.' + chat.chat_id, { chat_id: chat.chat_id, name: chat.name, emoji: chat.emoji, mode: chat.mode, updated_at: chat.updated_at, messages: (chat.messages || []).slice(-80) });
    let lru = store.get('clru', []).filter(x => x !== chat.chat_id);
    lru.unshift(chat.chat_id);
    lru.slice(4).forEach(x => store.del('c.' + x));
    store.set('clru', lru.slice(0, 4));
}

function renderList() {
    const box = $('chat-list'); if (!box) return;
    const q = S.filter.trim();
    const now = new Date();
    let html = '';
    if (S.listLoading && !S.chats.length) html = '<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    else {
        const item = (c, extra) => {
            const active = S.chat && S.chat.chat_id === c.chat_id;
            return '<div class="chat-item' + (active ? ' active' : '') + (extra ? ' ' + extra : '') + '" role="button" tabindex="0" data-id="' + esc(c.chat_id) + '"' + (active ? ' aria-current="true"' : '') + '>' +
                '<span class="ce">' + esc(c.emoji || '💬') + '</span><span class="ct">' + highlightTerm(c.name || 'New chat', q) + '</span>' +
                '<button type="button" class="more" data-more aria-label="Chat options" aria-haspopup="menu" aria-expanded="false"><i data-icon="more"></i></button></div>';
        };
        if (q) {
            const scored = S.chats.map(c => ({ c, s: Math.max(fuzzy(q, c.name), fuzzy(q, c.preview) - 5) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s);
            if (scored.length) html += '<div class="grp">Chats</div>' + scored.map(x => item(x.c)).join('');
            if (S.hits.length) {
                html += '<div class="grp">In messages</div>' + S.hits.filter(h => h.snippet).map(h =>
                    '<div class="chat-item hit" role="button" tabindex="0" data-id="' + esc(h.chat_id) + '" data-index="' + (h.index == null ? '' : h.index) + '">' +
                    '<span class="ce">' + esc(h.emoji || '💬') + '</span><span class="ct">' + esc(h.name) + '<span class="snip">' + highlightTerm(h.snippet, q) + '</span></span></div>').join('');
            }
            if (!scored.length && !S.hits.length) html = '<div class="list-empty">No chats match “' + esc(q) + '”.</div>';
        } else if (!S.chats.length) {
            html = '<div class="list-empty">No conversations yet.<br>Start one — I’ll remember it here.</div>';
        } else {
            let last = '';
            for (const c of sortedChats()) {
                const g = groupLabel(parseTs(c.updated_at), now);
                if (g !== last) { html += '<div class="grp">' + g + '</div>'; last = g; }
                html += item(c);
            }
        }
    }
    box.innerHTML = html;
    hydrate(box);
}

async function refreshChats(quiet) {
    if (!S.user) return;
    if (!S.chats.length) { S.listLoading = true; renderList(); }
    try {
        const r = await api('/api/ai-chats');
        S.chats = (r.chats || []).filter(c => !pendingDeletes.has(c.chat_id));
        cacheList();
    } catch (e) { if (!quiet && e.status !== 401) toast(errMsg(e), 'err'); }
    S.listLoading = false;
    renderList();
}

function chatTitleOf(chat) { return (chat && chat.name && !DEFAULT_TITLES.includes(chat.name)) ? chat.name : 'New chat'; }

function renderHeader() {
    const c = S.chat; if (!c) return;
    $('chat-title').textContent = chatTitleOf(c);
    $('chat-emoji').textContent = c.emoji || '🧙';
    const p = personaFor(c);
    const m = modeOf(c.mode);
    $('mode-emoji').textContent = p ? p.emoji : m.emoji;
    $('mode-name').textContent = p ? p.name : m.name;
    document.title = (c.name && !DEFAULT_TITLES.includes(c.name) ? c.name + ' · ' : '') + 'Wizard.AI';
}
function personaFor(chat) { return chat ? (S.personas[chat.chat_id] || null) : null; }

const SPARKS = [
    { e: '🧠', t: 'Explain something', s: 'How do black holes form, in plain words?', q: 'Explain how black holes form, in plain words.' },
    { e: '✍️', t: 'Draft an email', s: 'Ask a teacher for a deadline extension', q: 'Draft a friendly, short email asking my teacher for a one-day deadline extension.' },
    { e: '💻', t: 'Write some code', s: 'Find duplicate files in a folder', q: 'Write a Python script that finds duplicate files in a folder by hashing them.' },
    { e: '🎨', t: 'Imagine an image', s: 'A wizard tower above the clouds', q: 'Generate an image of a wizard tower floating above the clouds at dusk' },
    { e: '🌐', t: 'Look something up', s: 'What’s happening in the news today?', q: 'What are the top news headlines today?' },
    { e: '🗺️', t: 'Plan a trip', s: 'Three relaxed days in Sedona', q: 'Plan a relaxed 3-day trip to Sedona, Arizona with hikes and good food.' }
];
function renderEmpty() {
    const u = S.user, p = personaFor(S.chat);
    const h = new Date().getHours();
    const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const first = u && u.first_name ? u.first_name : '';
    $('empty-title').innerHTML = first ? esc(part) + ', <em>' + esc(first) + '</em>' : 'How can I <em>help</em>?';
    $('empty-sub').textContent = (p && p.greeting) ? p.greeting : 'Ask anything, or pick a spark below.';
    const pick = SPARKS.slice().sort(() => Math.random() - .5).slice(0, 4);
    $('sparks').innerHTML = pick.map((s, i) => '<button type="button" class="spark" data-q="' + esc(s.q) + '"><span class="se">' + s.e + '</span><b>' + esc(s.t) + '</b><span>' + esc(s.s) + '</span></button>').join('');
}

/* ============================================================
   THREAD RENDERING
   ============================================================ */
const safeImg = u => /^(https?:\/\/|data:image\/(png|jpe?g|webp);base64,|\/api\/images\/[a-f0-9]{32}\.(png|jpg|webp)$)/i.test(String(u || ''));
const imgSrc = u => String(u).charAt(0) === '/' ? API + u : String(u);
function imgCard(url, prompt) {
    if (!safeImg(url)) return '';
    return '<figure class="imgcard" data-src="' + esc(imgSrc(url)) + '" data-cap="' + esc(prompt || '') + '" tabindex="0" role="button" aria-label="View image full size">' +
        '<img src="' + esc(imgSrc(url)) + '" alt="' + esc(prompt || 'Generated image') + '" loading="lazy" decoding="async">' +
        (prompt ? '<figcaption class="cap">' + esc(prompt) + '</figcaption>' : '') + '</figure>';
}
function userImgs(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return '<div class="uimgs">' + list.slice(0, 3).map(u => imgCard(u, '')).join('') + '</div>';
}
function toolChips(tools) {
    if (!Array.isArray(tools) || !tools.length) return '';
    const names = Array.from(new Set(tools.map(t => String(t).replace(/_/g, ' ')))).slice(0, 5);
    return '<div class="tools-used">' + names.map(n => '<span class="tool-chip"><i data-icon="tool"></i>' + esc(n) + '</span>').join('') + '</div>';
}
function actBtn(act, ic, label) { return '<button type="button" class="act" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"><i data-icon="' + ic + '"></i></button>'; }

function messageHTML(m, i, isLast) {
    const t = parseTs(m.timestamp);
    if (m.sender === 'user') {
        return '<article class="msg user' + (isLast ? ' last' : '') + '" data-i="' + i + '" aria-label="You said">' +
            '<div class="body">' + userImgs(m.images) + '<div class="bubble" title="' + esc(fmtDay(t)) + '">' + esc(m.text) + '</div>' +
            '<div class="actions-row">' + actBtn('copy', 'copy', 'Copy') + actBtn('edit', 'edit', 'Edit and resend') + '</div></div></article>';
    }
    const p = personaFor(S.chat), mode = modeOf(m.mode || (S.chat && S.chat.mode));
    const lastAssistant = isLast;
    return '<article class="msg assistant' + (isLast ? ' last' : '') + '" data-i="' + i + '" aria-label="Wizard.AI replied">' +
        '<div class="ava" aria-hidden="true">' + esc(p ? p.emoji : mode.emoji) + '</div>' +
        '<div class="body"><div class="meta"><span class="who">' + esc(p ? p.name : 'Wizard.AI') + '</span><span class="mtag">' + esc(mode.name) + '</span>' + (m.model ? '<span class="mtag mmodel" title="Model that wrote this">' + esc(String(m.model).slice(0, 30)) + '</span>' : '') + '<time>' + esc(fmtDay(t)) + '</time></div>' +
        imgCard(m.image, m.prompt) +
        (m.text ? '<div class="content md">' + md(m.text) + '</div>' : '') +
        toolChips(m.tools) +
        (m.truncated && isLast ? '<div class="cont-row"><span>This reply hit the length limit.</span><button type="button" class="btn ghost sm" data-act="continue"><i data-icon="play"></i>Continue generating</button></div>' : '') +
        '<div class="actions-row">' + actBtn('copy', 'copy', 'Copy') + (lastAssistant ? actBtn('regen', 'refresh', 'Regenerate') : '') + '</div></div></article>';
}

function pendingHTML() {
    const p = personaFor(S.chat), mode = modeOf(S.chat && S.chat.mode);
    return '<article class="msg assistant streaming" id="pending" aria-label="Wizard.AI is replying" aria-busy="true">' +
        '<div class="ava" aria-hidden="true">' + esc(p ? p.emoji : mode.emoji) + '</div>' +
        '<div class="body"><div class="meta"><span class="who">' + esc(p ? p.name : 'Wizard.AI') + '</span><span class="mtag">' + esc(mode.name) + '</span></div>' +
        '<div class="thinking" id="think"><span class="dots"><i></i><i></i><i></i></span><span id="think-label">Thinking…</span></div>' +
        '<div class="content md" id="pending-content" hidden></div></div></article>';
}

function renderThread(keepScroll) {
    const c = S.chat, th = $('thread'), sc = $('scroller');
    if (!c) { th.innerHTML = ''; return; }
    const msgs = c.messages || [];
    const empty = !msgs.length && !S.busy;
    $('empty').hidden = !empty;
    if (empty) renderEmpty();
    const from = Math.max(0, msgs.length > 120 ? msgs.length - 80 : 0);
    S.renderFrom = from;
    let html = '';
    if (from > 0) html += '<button type="button" class="btn ghost sm" data-act="earlier" style="align-self:center">Show ' + from + ' earlier message' + (from === 1 ? '' : 's') + '</button>';
    for (let i = from; i < msgs.length; i++) html += messageHTML(msgs[i], i, i === msgs.length - 1 && !S.busy);
    th.innerHTML = html;
    hydrate(th);
    if (!keepScroll) scrollToBottom(true);
    updateJump();
}
function showEarlier() {
    const c = S.chat; if (!c) return;
    const sc = $('scroller'), prevH = sc.scrollHeight;
    const from = 0; S.renderFrom = 0;
    let html = '';
    for (let i = 0; i < c.messages.length; i++) html += messageHTML(c.messages[i], i, i === c.messages.length - 1 && !S.busy);
    $('thread').innerHTML = html; hydrate($('thread'));
    sc.scrollTop = sc.scrollHeight - prevH;
}

function nearBottom() { const sc = $('scroller'); return sc.scrollHeight - sc.scrollTop - sc.clientHeight < 90; }
function scrollToBottom(force) {
    const sc = $('scroller');
    if (force || S.stick) { sc.scrollTop = sc.scrollHeight; }
}
function updateJump() { $('jump-btn').hidden = nearBottom(); }

/* ============================================================
   OPEN / CREATE / RENAME / DELETE
   ============================================================ */
function lastIdKey() { return 'last'; }
async function openChat(id, opts) {
    opts = opts || {};
    if (!S.user || !id) return;
    if (S.busy && S.turn && S.turn.cid === id) return; // already showing this chat, mid-reply
    if (S.busy) abortTurn(true);
    const token = ++S.openSeq;
    // draft of the chat we are leaving
    saveDraft();
    const cached = store.get('c.' + id, null);
    const summary = S.chats.find(c => c.chat_id === id);
    const prior = S.chat && S.chat.chat_id === id ? S.chat : null;
    S.chat = prior || (cached ? Object.assign({}, summary || {}, cached) : Object.assign({ messages: [] }, summary || { chat_id: id, name: 'New Chat', emoji: '🧙', mode: 'JARVIS' }));
    store.set(lastIdKey(), id);
    S.stick = true;
    renderHeader(); renderThread(); renderList(); restoreDraft();
    closeDrawer();
    try {
        const r = await api('/api/ai-chats/' + encodeURIComponent(id));
        if (token !== S.openSeq) return;
        if (S.busy && S.turn && S.turn.cid === id) return; // a reply is streaming into this chat; don't clobber it
        S.chat = r.chat;
        upsertSummary(summaryOf(S.chat)); cacheList(); cacheChat(S.chat);
        renderHeader(); renderThread(!!opts.scrollTo || false); renderList();
        if (opts.scrollTo != null && opts.scrollTo !== '') flashMessage(+opts.scrollTo);
    } catch (e) {
        if (token !== S.openSeq) return;
        if (e.status === 404) {
            S.chats = S.chats.filter(c => c.chat_id !== id); cacheList();
            toast('That chat no longer exists.', 'err');
            const next = sortedChats()[0];
            if (next) openChat(next.chat_id); else newChat(true);
        } else if (e.status !== 401) toast(errMsg(e), 'err');
    }
}
function flashMessage(i) {
    const el = qs('.msg[data-i="' + i + '"]'); if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.animate([{ background: 'rgba(201,168,76,.22)' }, { background: 'transparent' }], { duration: 1600 });
}

async function newChat(force) {
    if (!S.user) { openAuth('login'); return; }
    const cur = S.chat;
    if (!force && cur && !(cur.messages || []).length && !S.busy) { focusInput(); closeDrawer(); return; }
    if (S.busy) abortTurn(true);
    const mode = (S.chat && S.chat.mode) || (S.profile && S.profile.preferred_mode) || 'JARVIS';
    try {
        const r = await api('/api/ai-chats', { method: 'POST', body: { name: 'New Chat', emoji: '🧙', mode } });
        upsertSummary(r.chat); cacheList();
        const el = S.chat; S.chat = null; // force fresh open
        await openChat(r.chat.chat_id);
        const fresh = qs('.chat-item[data-id="' + CSS.escape(r.chat.chat_id) + '"]'); if (fresh) fresh.classList.add('fresh');
        focusInput();
    } catch (e) { toast(errMsg(e), 'err'); }
}

function renameChat(id) {
    const c = S.chats.find(x => x.chat_id === id) || (S.chat && S.chat.chat_id === id ? S.chat : null); if (!c) return;
    S.menuChatId = id;
    $('rename-input').value = DEFAULT_TITLES.includes(c.name) ? '' : c.name;
    openModal('m-rename');
    $('rename-input').select();
}
async function doRename(name) {
    const id = S.menuChatId; name = name.trim().slice(0, 60);
    if (!id || !name) return;
    const sum = S.chats.find(c => c.chat_id === id); const old = sum ? sum.name : null;
    if (sum) sum.name = name;
    if (S.chat && S.chat.chat_id === id) { S.chat.name = name; renderHeader(); }
    renderList();
    try { await api('/api/ai-chats/' + encodeURIComponent(id), { method: 'PATCH', body: { name } }); cacheList(); }
    catch (e) { if (sum && old != null) sum.name = old; if (S.chat && S.chat.chat_id === id && old != null) S.chat.name = old; renderHeader(); renderList(); toast(errMsg(e), 'err'); }
}

const pendingDeletes = new Map();
function commitDelete(id) {
    const p = pendingDeletes.get(id); if (!p) return;
    clearTimeout(p.timer); pendingDeletes.delete(id);
    api('/api/ai-chats/' + encodeURIComponent(id), { method: 'DELETE' }).then(() => { store.del('c.' + id); if (id === 'default') refreshChats(true); })
        .catch(e => { if (e.status !== 401) { toast('Couldn’t delete that chat: ' + errMsg(e), 'err'); refreshChats(true); } });
}
async function deleteChat(id) {
    const c = S.chats.find(x => x.chat_id === id); if (!c) return;
    pendingDeletes.forEach((_, k) => commitDelete(k));
    const idx = S.chats.indexOf(c);
    S.chats = S.chats.filter(x => x.chat_id !== id); cacheList();
    const timer = setTimeout(() => { commitDelete(id); hideSnack(); }, 7000);
    pendingDeletes.set(id, { timer, c, idx });
    const wasActive = S.chat && S.chat.chat_id === id;
    if (wasActive) { if (S.busy) abortTurn(true); S.chat = null; const next = sortedChats()[0]; if (next) await openChat(next.chat_id); else await newChat(true); }
    renderList();
    snack('Chat “' + (c.name || 'New chat').slice(0, 40) + '” deleted', () => {
        const p = pendingDeletes.get(id); if (!p) return;
        clearTimeout(p.timer); pendingDeletes.delete(id);
        S.chats.splice(Math.min(p.idx, S.chats.length), 0, p.c); cacheList(); renderList();
        if (wasActive) openChat(id);
        toast('Chat restored', 'ok');
    }, 7000);
}
window.addEventListener('pagehide', () => {
    pendingDeletes.forEach((p, id) => {
        try { fetch(API + '/api/ai-chats/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include', keepalive: true }); } catch (e) { }
    });
});

async function clearChat(id) {
    const ok = await confirmBox({ title: 'Clear this conversation?', body: 'All messages in this chat will be removed. The chat itself stays.', yes: 'Clear messages', danger: true });
    if (!ok) return;
    try {
        await api('/api/ai-chats/' + encodeURIComponent(id) + '/clear', { method: 'POST' });
        if (S.chat && S.chat.chat_id === id) { S.chat.messages = []; renderThread(); }
        const s = S.chats.find(c => c.chat_id === id); if (s) { s.message_count = 0; s.preview = ''; }
        cacheList(); cacheChat(S.chat); renderList(); toast('Chat cleared', 'ok');
    } catch (e) { toast(errMsg(e), 'err'); }
}

async function exportChat(id, all) {
    try {
        let chat = S.chat && S.chat.chat_id === id ? S.chat : null;
        if (!chat || (chat.messages || []).length === 0) chat = (await api('/api/ai-chats/' + encodeURIComponent(id))).chat;
        if (!(chat.messages || []).length) { toast('Nothing to export yet.', 'warn'); return; }
        downloadBlob(safeFile(chat.name) + '.md', toMarkdownExport(chat));
        toast('Exported', 'ok');
    } catch (e) { toast(errMsg(e), 'err'); }
}
async function exportAll() {
    try {
        const parts = [];
        for (const s of sortedChats()) {
            const chat = (await api('/api/ai-chats/' + encodeURIComponent(s.chat_id))).chat;
            if ((chat.messages || []).length) parts.push(toMarkdownExport(chat));
        }
        if (!parts.length) { toast('No messages to export yet.', 'warn'); return; }
        downloadBlob('wizard-ai-chats-' + new Date().toISOString().slice(0, 10) + '.md', parts.join('\n\n---\n\n'));
        toast('Exported ' + parts.length + ' chats', 'ok');
    } catch (e) { toast(errMsg(e), 'err'); }
}

/* ---------- drafts ---------- */
function saveDraft() {
    const c = S.chat, inp = $('input'); if (!c || !inp) return;
    const v = inp.value;
    if (v.trim()) store.set('d.' + c.chat_id, v.slice(0, MAX_LEN)); else store.del('d.' + c.chat_id);
}
function restoreDraft() {
    const c = S.chat, inp = $('input'); if (!c) return;
    inp.value = store.get('d.' + c.chat_id, '') || '';
    autoGrow();
}
const saveDraftSoon = debounce(saveDraft, 400);

/* ---------- sidebar ---------- */
function openDrawer() { $('shell').classList.add('drawer'); }
function closeDrawer() { $('shell').classList.remove('drawer'); }
function toggleSidebar() {
    if (mobileMQ.matches) { $('shell').classList.toggle('drawer'); return; }
    S.settings.collapsed = !S.settings.collapsed; applySettings();
}

/* ============================================================
   SENDING, STREAMING, TYPEWRITER
   ============================================================ */
const TW = { full: '', shown: 0, raf: 0, el: null, netDone: false, resolve: null, last: 0 };
function twReset(el) { cancelAnimationFrame(TW.raf); TW.full = ''; TW.shown = 0; TW.raf = 0; TW.el = el; TW.netDone = false; TW.resolve = null; TW.last = 0; }
function twPaint() {
    if (!TW.el) return;
    let n = TW.shown;
    const c = TW.full.charCodeAt(n - 1);
    if (c >= 0xD800 && c <= 0xDBFF) n++;
    TW.el.hidden = false;
    TW.el.innerHTML = md(TW.full.slice(0, n));
    hydrate(TW.el);
    if (S.stick) scrollToBottom(true);
}
function twKick() { if (!TW.raf) TW.raf = requestAnimationFrame(twStep); }
function twStep(ts) {
    TW.raf = 0;
    const back = TW.full.length - TW.shown;
    if (back > 0) {
        if (reduceMotion() || document.hidden) TW.shown = TW.full.length;
        else TW.shown = Math.min(TW.full.length, TW.shown + Math.max(2, Math.ceil(back * 0.06)));
        if (!TW.last || ts - TW.last > 28 || TW.shown >= TW.full.length) { twPaint(); TW.last = ts; }
    }
    if (TW.shown < TW.full.length) TW.raf = requestAnimationFrame(twStep);
    else if (TW.netDone && TW.resolve) { const r = TW.resolve; TW.resolve = null; r(); }
}
function twFinish() { // resolves when everything is revealed
    TW.netDone = true;
    return new Promise(res => {
        if (TW.shown >= TW.full.length) { twPaint(); res(); return; }
        TW.resolve = res; twKick();
    });
}
function twSkip() { TW.shown = TW.full.length; twPaint(); if (TW.netDone && TW.resolve) { const r = TW.resolve; TW.resolve = null; r(); } }

function setThink(text) { const l = $('think-label'); if (l) l.textContent = text; }
function setBusy(b) {
    S.busy = b;
    const btn = $('send-btn');
    btn.classList.toggle('stop', b);
    setIcon(btn, b ? 'stop' : 'send');
    btn.setAttribute('aria-label', b ? 'Stop generating' : 'Send message');
    btn.title = b ? 'Stop (Esc)' : 'Send (Enter)';
    updateSendState();
    $('composer').classList.toggle('busy', b);
}
function updateSendState() {
    const btn = $('send-btn');
    btn.disabled = !S.busy && !$('input').value.trim() && !S.attach.some(a => a.dataUrl);
}
function tzName() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch (e) { return undefined; } }

function removePending() { const p = $('pending'); if (p) p.remove(); }

function errorBox(msg, canRetry) {
    const p = $('pending');
    const html = '<article class="msg assistant error" aria-live="polite"><div class="ava" aria-hidden="true">⚠️</div><div class="body"><div class="err-box"><span>' + esc(msg) + '</span>' +
        (canRetry ? '<button type="button" class="btn ghost" data-act="retry"><i data-icon="refresh"></i>Try again</button>' : '') + '</div></div></article>';
    if (p) { p.outerHTML = html; } else $('thread').insertAdjacentHTML('beforeend', html);
    hydrate($('thread')); scrollToBottom(true);
}

function abortTurn(silent) {
    if (!S.busy) return;
    const t = S.turn;
    if (S.phase === 'net' && S.ctl) {
        try { S.ctl.abort(); } catch (e) { }
        if (t) t.aborted = true; if (t) t.silent = !!silent;
    } else if (S.phase === 'reveal') {
        twSkip();
    }
}

async function send(text, opt) {
    opt = opt || {};
    text = String(text || '').trim();
    const pics = S.attach.filter(a => a.dataUrl).map(a => a.dataUrl);
    if (S.attach.some(a => a.state === 'up')) { toast('Wait for the attachment to finish loading.', 'err'); return; }
    if (!text && pics.length) text = 'Please look at the attached image.';
    if (!text || S.busy) return;
    if (!S.user) { openAuth('login'); return; }
    if (S.offline) { toast('You’re offline.', 'err'); return; }
    if (text.length > MAX_LEN) { toast('That message is too long (max ' + MAX_LEN.toLocaleString() + ' characters).', 'err'); return; }
    const chat = S.chat; if (!chat) return;
    const cid = chat.chat_id;
    const replaceFrom = opt.replaceFrom != null ? opt.replaceFrom : null;

    const keepImgs = replaceFrom != null && chat.messages[replaceFrom] ? (chat.messages[replaceFrom].images || []) : [];
    if (replaceFrom != null) chat.messages = chat.messages.slice(0, replaceFrom);
    const userIdx = chat.messages.length;
    const userMsg = { sender: 'user', text, mode: chat.mode, timestamp: new Date().toISOString() };
    if (pics.length || keepImgs.length) userMsg.images = pics.length ? pics : keepImgs;
    chat.messages.push(userMsg);
    S.lastSend = { text, replaceFrom: userIdx };
    S.stick = true;
    setBusy(true); S.phase = 'net';
    const turn = S.turn = { cid, userIdx, aborted: false, silent: false };

    if (replaceFrom != null || $('empty').hidden === false) renderThread();
    else { qsa('.msg.last').forEach(m => m.classList.remove('last')); }
    if (replaceFrom == null && !qs('.msg[data-i="' + userIdx + '"]')) {
        $('thread').insertAdjacentHTML('beforeend', messageHTML(userMsg, userIdx, false));
    }
    $('empty').hidden = true;
    $('thread').insertAdjacentHTML('beforeend', pendingHTML());
    hydrate($('thread')); scrollToBottom(true);
    twReset($('pending-content'));

    if (!opt.keepInput) { $('input').value = ''; autoGrow(); store.del('d.' + cid); }
    S.attach = []; renderChips();

    const auto = S.settings.autoWeb && FRESH_RE.test(text);
    const body = { message: text, mode: chat.mode, search: !!(S.webOn || auto), chat_id: cid, tz: tzName() };
    if (replaceFrom != null) body.replace_from = userIdx;
    if (pics.length) body.images = pics;
    if (S.model && S.model !== 'auto') body.model = S.model;
    const persona = personaFor(chat); if (persona && persona.id) body.personality_id = persona.id;

    const ctl = S.ctl = new AbortController();
    let done = null, errorText = null, images = [], tools = [], gotAny = false;
    progress(true);
    try {
        const res = await fetch(API + '/api/compound/stream', {
            method: 'POST', credentials: 'include', signal: ctl.signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (S.offline) setConn('ok');
        if (!res.ok) {
            let d = null; try { d = await res.json(); } catch (e) { }
            if (res.status === 401) { sessionLost(); return; }
            errorText = (d && d.error) || 'The server hit a problem. Please try again.';
            if (res.status === 429 && d && d.retry_after && !/try again/i.test(errorText)) errorText += ' Try again in ' + waitText(d.retry_after) + '.';
        } else {
            const handle = ev => {
                gotAny = true;
                if (typeof ev.thinking === 'string') {
                    setThink(ev.thinking);
                    const m = /^🔧 Used:\s*(.+)$/.exec(ev.thinking);
                    if (m) tools = m[1].split(',').map(s => s.trim()).filter(Boolean);
                }
                if (ev.image) {
                    images.push({ url: ev.image, prompt: ev.prompt });
                    const pc = $('pending-content');
                    if (pc && safeImg(ev.image)) pc.insertAdjacentHTML('beforebegin', imgCard(ev.image, ev.prompt));
                    const t = $('think'); if (t) t.remove();
                    scrollToBottom(true);
                }
                if (typeof ev.token === 'string') {
                    const t = $('think'); if (t) t.remove();
                    TW.full += ev.token; twKick();
                }
                if (ev.done) done = ev;
                if (ev.error) errorText = String(ev.error);
            };
            await readSSE(res, handle);
        }
    } catch (e) {
        if (e && e.name === 'AbortError') { /* handled below */ }
        else { setConn('off'); errorText = 'The connection dropped before the reply finished.'; }
    }
    progress(false);

    // ---- aborted by the user
    if (turn.aborted) {
        S.ctl = null; S.phase = 'idle'; twReset(null);
        removePending();
        setBusy(false); S.turn = null;
        if (S.chat && S.chat.chat_id === cid) {
            S.chat.messages = S.chat.messages.slice(0, userIdx);
            if (!turn.silent) {
                renderThread(true);
                if (!$('input').value.trim()) { $('input').value = text; autoGrow(); updateSendState(); }
                toast('Stopped', 'warn', 1800);
            }
        }
        resyncLater(cid, userIdx, text);
        return;
    }
    if (S.turn !== turn) return; // chat was switched or deleted underneath us

    // ---- failed
    if (errorText || !done) {
        S.ctl = null; S.phase = 'idle'; twReset(null);
        errorBox(errorText || 'The reply was interrupted. Your message may not have been saved.', true);
        setBusy(false); S.turn = null;
        if (!errorText) resyncLater(cid, userIdx, text);
        return;
    }

    // ---- success: let the typewriter finish, then commit
    S.phase = 'reveal';
    await twFinish();
    S.ctl = null; S.phase = 'idle';
    const reply = TW.full; twReset(null);
    if (S.turn !== turn) return;
    const aMsg = { sender: 'assistant', text: reply, mode: chat.mode, timestamp: new Date().toISOString() };
    if (images[0]) { aMsg.image = images[0].url; aMsg.prompt = images[0].prompt; }
    if (tools.length) aMsg.tools = tools;
    if (done.truncated) aMsg.truncated = true;
    chat.messages.push(aMsg);
    if (done.chat_name && !DEFAULT_TITLES.includes(done.chat_name)) chat.name = done.chat_name;
    chat.updated_at = new Date().toISOString();
    setBusy(false); S.turn = null;
    if (S.chat === chat) {
        renderHeader();
        const p = $('pending'); if (p) p.outerHTML = messageHTML(aMsg, chat.messages.length - 1, true); else renderThread(true);
        const um = qs('.msg.user[data-i="' + userIdx + '"]'); if (um) um.classList.remove('last');
        hydrate($('thread'));
        scrollToBottom();
        if (done.user_index !== undefined && done.user_index !== userIdx) resyncLater(cid, userIdx, null, 0);
    }
    upsertSummary(summaryOf(chat)); cacheList(); cacheChat(chat); renderList();
    if (DEFAULT_TITLES.includes(chat.name) && chat.messages.length <= 2) autoTitle(cid);
}

// Reads a text/event-stream response and calls handle(obj) for every "data:" frame.
async function readSSE(res, handle) {
    let buf = '';
    const feed = chunk => {
        buf += chunk;
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, k); buf = buf.slice(k + 2);
            const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
            if (!data) continue;
            let ev = null;
            try { ev = JSON.parse(data); } catch (e) { /* ignore a broken frame */ }
            if (ev) handle(ev);
        }
    };
    if (res.body && res.body.getReader) {
        const reader = res.body.getReader(), dec = new TextDecoder();
        for (; ;) {
            const { value, done: end } = await reader.read();
            if (end) break;
            feed(dec.decode(value, { stream: true }));
        }
        feed(dec.decode() + '\n\n');
    } else feed((await res.text()) + '\n\n');
}

// "Continue generating": the reply hit the length limit, ask the server to carry on and
// append the new text to the SAME message.
async function continueReply() {
    if (S.busy || !S.chat || !S.user) return;
    const chat = S.chat, cid = chat.chat_id, idx = chat.messages.length - 1, m = chat.messages[idx];
    if (!m || m.sender !== 'assistant' || !m.truncated) return;
    const el = qs('.msg.assistant[data-i="' + idx + '"]'); if (!el) return;
    const oldText = m.text;
    let content = qs('.content', el);
    if (!content) { content = document.createElement('div'); content.className = 'content md'; qs('.body', el).insertBefore(content, qs('.actions-row', el)); }
    const row = qs('.cont-row', el); if (row) row.remove();
    el.classList.add('streaming'); el.setAttribute('aria-busy', 'true');
    setBusy(true); S.phase = 'net'; S.stick = true;
    const turn = S.turn = { cid, userIdx: idx - 1, aborted: false, silent: false };
    twReset(content); TW.full = oldText; TW.shown = oldText.length;
    const body = { continue: true, mode: chat.mode, chat_id: cid, tz: tzName() };
    if (S.model && S.model !== 'auto') body.model = S.model;
    const persona = personaFor(chat); if (persona && persona.id) body.personality_id = persona.id;
    const ctl = S.ctl = new AbortController();
    let done = null, errorText = null;
    progress(true);
    try {
        const res = await fetch(API + '/api/compound/stream', { method: 'POST', credentials: 'include', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
            let d = null; try { d = await res.json(); } catch (e) { }
            if (res.status === 401) { sessionLost(); return; }
            errorText = (d && d.error) || 'The server hit a problem. Please try again.';
        } else {
            await readSSE(res, ev => {
                if (typeof ev.token === 'string') { TW.full += ev.token; twKick(); }
                if (ev.done) done = ev;
                if (ev.error) errorText = String(ev.error);
            });
        }
    } catch (e) {
        if (!(e && e.name === 'AbortError')) { setConn('off'); errorText = 'The connection dropped before the reply finished.'; }
    }
    progress(false);
    const restore = () => { S.ctl = null; S.phase = 'idle'; twReset(null); setBusy(false); S.turn = null; };
    if (turn.aborted || errorText || !done) {
        restore();
        if (S.chat === chat) {
            m.text = oldText; renderThread(true);
            if (errorText) toast(errorText, 'err');
        }
        if (turn.aborted || !errorText) resyncLater(cid, idx - 1, null, 3500);
        return;
    }
    S.phase = 'reveal';
    await twFinish();
    const full = TW.full; restore();
    if (S.chat !== chat) return;
    m.text = full;
    if (done.truncated) m.truncated = true; else delete m.truncated;
    chat.updated_at = new Date().toISOString();
    const cur = qs('.msg.assistant[data-i="' + idx + '"]');
    if (cur) cur.outerHTML = messageHTML(m, idx, true); else renderThread(true);
    hydrate($('thread')); scrollToBottom();
    upsertSummary(summaryOf(chat)); cacheList(); cacheChat(chat); renderList();
}

async function autoTitle(cid) {
    try {
        const r = await api('/api/compound/title', { method: 'POST', body: { chat_id: cid }, noAuthRedirect: true });
        const name = r && (r.name || r.title || r.chat_name);
        if (name && !DEFAULT_TITLES.includes(name)) {
            const s = S.chats.find(c => c.chat_id === cid); if (s) s.name = name;
            if (S.chat && S.chat.chat_id === cid) { S.chat.name = name; renderHeader(); }
            cacheList(); renderList();
        }
    } catch (e) { /* titles are a nicety */ }
}

// After an abort or interruption the server may or may not have saved the turn. Ask it.
function resyncLater(cid, userIdx, text, delay) {
    const run = async () => {
        if (!S.user || S.busy || !S.chat || S.chat.chat_id !== cid) return;
        try {
            const r = await api('/api/ai-chats/' + encodeURIComponent(cid), { noAuthRedirect: true });
            if (S.busy || !S.chat || S.chat.chat_id !== cid) return;
            const server = r.chat.messages || [], local = S.chat.messages || [];
            const changed = server.length !== local.length || (server.length && local.length && server[server.length - 1].text !== local[local.length - 1].text);
            if (changed) {
                S.chat = r.chat; renderHeader(); renderThread();
                if (text && server[userIdx] && server[userIdx].text === text && $('input').value === text) { $('input').value = ''; autoGrow(); updateSendState(); }
                upsertSummary(summaryOf(S.chat)); cacheList(); cacheChat(S.chat); renderList();
            }
        } catch (e) { /* ignore */ }
    };
    [delay != null ? delay : 3500, 9000].forEach(ms => setTimeout(run, ms));
}

/* ============================================================
   COMPOSER
   ============================================================ */
function focusInput() { const i = $('input'); if (i && !mobileMQ.matches) i.focus({ preventScroll: true }); }
function autoGrow() {
    const t = $('input');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 240) + 'px';
    const n = t.value.length, c = $('char-count');
    c.hidden = n < MAX_LEN * 0.75;
    c.textContent = n.toLocaleString() + ' / ' + MAX_LEN.toLocaleString();
    c.classList.toggle('warn', n > MAX_LEN * 0.94);
    const wb = $('web-btn');
    wb.classList.toggle('auto', !S.webOn && S.settings.autoWeb && FRESH_RE.test(t.value));
}
function setWeb(on) {
    S.webOn = !!on;
    $('web-btn').setAttribute('aria-pressed', S.webOn ? 'true' : 'false');
    autoGrow();
}
function submitComposer() {
    if (S.busy) { abortTurn(); return; }
    send($('input').value);
}
function editLastUser() {
    if (S.busy || !S.chat) return;
    const msgs = S.chat.messages;
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].sender === 'user') { startEdit(i); return; }
}
function startEdit(i) {
    const el = qs('.msg.user[data-i="' + i + '"]'); if (!el || S.busy) return;
    const m = S.chat.messages[i];
    const body = qs('.body', el);
    body.innerHTML = '<div class="edit-box"><textarea aria-label="Edit message" maxlength="' + MAX_LEN + '">' + esc(m.text) + '</textarea>' +
        '<div class="row"><button type="button" class="btn ghost sm" data-act="edit-cancel">Cancel</button><button type="button" class="btn primary sm" data-act="edit-save">Save &amp; resend</button></div></div>';
    const ta = qs('textarea', body); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); qs('[data-act=edit-save]', body).click(); }
        if (e.key === 'Escape') { e.stopPropagation(); renderThread(true); }
    });
    scrollToBottom();
}
function regenerate() {
    if (S.busy || !S.chat) return;
    const msgs = S.chat.messages;
    let a = msgs.length - 1;
    if (a < 1 || msgs[a].sender !== 'assistant') return;
    const u = msgs[a - 1];
    if (!u || u.sender !== 'user') return;
    send(u.text, { replaceFrom: a - 1 });
}

/* thread click delegation */
async function onThreadClick(e) {
    const img = e.target.closest('.imgcard');
    if (img && !img.classList.contains('broken')) { openLightbox(img.dataset.src, img.dataset.cap); return; }
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    const msgEl = btn.closest('.msg');
    const i = msgEl ? +msgEl.dataset.i : -1;
    const m = i >= 0 && S.chat ? S.chat.messages[i] : null;
    if (act === 'copy' && m) {
        const ok = await copyText(m.text);
        if (ok) { setIcon(btn, 'check'); btn.classList.add('ok'); setTimeout(() => { setIcon(btn, 'copy'); btn.classList.remove('ok'); }, 1400); }
        else toast('Couldn’t copy — select the text and copy it manually.', 'err');
    } else if (act === 'copy-code') {
        const code = qs('pre code', btn.closest('.codeblock'));
        const ok = await copyText(code ? code.textContent : '');
        const label = qs('span', btn);
        if (ok && label) { label.textContent = 'Copied'; setTimeout(() => { label.textContent = 'Copy'; }, 1400); }
    } else if (act === 'preview') {
        const code = qs('pre code', btn.closest('.codeblock'));
        openPreview(code ? code.textContent : '', (qs('.lang', btn.closest('.codeblock')) || {}).textContent);
    } else if (act === 'dl-code') {
        const cb = btn.closest('.codeblock'), code = qs('pre code', cb);
        const lang = ((qs('.lang', cb) || {}).textContent || 'text').toLowerCase();
        const ext = { html: 'html', htm: 'html', svg: 'svg', css: 'css', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', json: 'json', bash: 'sh', sh: 'sh', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', go: 'go', rust: 'rs', php: 'php', ruby: 'rb', yaml: 'yml', yml: 'yml', xml: 'xml', markdown: 'md', md: 'md' }[lang] || 'txt';
        downloadBlob('wizard-ai-code.' + ext, code ? code.textContent : '', 'text/plain;charset=utf-8');
    } else if (act === 'wrap') btn.closest('.codeblock').classList.toggle('wrap');
    else if (act === 'edit') startEdit(i);
    else if (act === 'edit-cancel') renderThread(true);
    else if (act === 'edit-save') {
        const ta = qs('textarea', msgEl); const v = ta.value.trim(); if (!v) return;
        send(v, { replaceFrom: i });
    }
    else if (act === 'regen') regenerate();
    else if (act === 'continue') continueReply();
    else if (act === 'retry') { const l = S.lastSend; if (l) { const em = qs('.msg.error'); if (em) em.remove(); if (S.chat) S.chat.messages = S.chat.messages.slice(0, l.replaceFrom); renderThread(true); send(l.text, { replaceFrom: l.replaceFrom }); } }
    else if (act === 'earlier') showEarlier();
}
function onThreadKey(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('imgcard')) { e.preventDefault(); openLightbox(e.target.dataset.src, e.target.dataset.cap); }
}
document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('.imgcard')) {
        const card = t.closest('.imgcard');
        card.classList.add('broken');
        card.innerHTML = '<span>🖼️ This image is no longer available.</span>';
    }
}, true);

/* ---------- lightbox ---------- */
/* Live preview: the code runs in a sandboxed iframe with NO same-origin access,
   so generated pages can't touch the app, its cookies or the user's account. */
function openPreview(code, lang) {
    const isSvg = /^svg$/i.test(lang || '') || /^\s*<svg[\s>]/i.test(code);
    const doc = isSvg ? '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">' + code : code;
    S.previewCode = code; S.previewExt = isSvg ? 'svg' : 'html';
    const f = $('preview-frame');
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
    f.srcdoc = doc;
    openModal('m-preview');
}
function openLightbox(src, cap) {
    if (!safeImg(src)) return;
    $('lightbox-img').src = src; $('lightbox-img').alt = cap || 'Image';
    $('lightbox-cap').textContent = cap || '';
    const open = $('lightbox-open');
    open.href = src;
    if (src.startsWith('data:')) { // browsers block top-level data: links, so open via a blob URL
        open.removeAttribute('href');
        open.onclick = async ev => { ev.preventDefault(); try { const b = await (await fetch(src)).blob(); window.open(URL.createObjectURL(b), '_blank', 'noopener'); } catch (e) { } };
    } else open.onclick = null;
    openModal('m-lightbox');
}
async function downloadImage(src) {
    try {
        const r = await fetch(src); if (!r.ok) throw new Error('x');
        const b = await r.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'wizard-ai-image.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) { window.open(src, '_blank', 'noopener'); }
}

/* ---------- attachments ---------- */
const MAX_UPLOAD = 16 * 1024 * 1024;
const OK_EXT = /\.(txt|pdf|docx?|xlsx?|csv|md|json|jpe?g|png|webp)$/i;
const IMG_EXT = /\.(jpe?g|png|webp)$/i, MAX_IMGS = 3, MAX_IMG_CHARS = 2400000;
function renderChips() {
    const box = $('attach-chips');
    box.innerHTML = S.attach.map((a, i) => '<span class="achip ' + (a.dataUrl ? 'img ' : '') + (a.state === 'ok' ? 'ok' : a.state === 'bad' ? 'bad' : '') + '">' + (a.dataUrl ? '<img class="thumb" src="' + esc(a.dataUrl) + '" alt="">' : '<i data-icon="' + (a.state === 'bad' ? 'alert' : 'file') + '"></i>') +
        '<span class="n" title="' + esc(a.name) + '">' + esc(a.name) + '</span><button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(a.name) + '"><i data-icon="x"></i></button>' +
        (a.state === 'up' ? '<i class="prog" style="width:' + (a.pct || 0) + '%"></i>' : '') + '</span>').join('');
    hydrate(box);
}
/* Pictures are shrunk in the browser (max 1568px, JPEG) and sent with the next message,
   so the AI can actually see them. Other files go to the knowledge upload below. */
function attachImage(file) {
    if (S.attach.filter(a => a.dataUrl).length >= MAX_IMGS) { toast('You can attach up to ' + MAX_IMGS + ' pictures per message.', 'err'); return; }
    const a = { name: file.name || 'image', state: 'up', pct: 50 };
    S.attach.push(a); renderChips();
    const fail = msg => { const k = S.attach.indexOf(a); if (k >= 0) S.attach.splice(k, 1); renderChips(); toast(msg, 'err'); };
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
        try {
            const scale = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
            let q = 0.85, d = cv.toDataURL('image/jpeg', q);
            while (d.length > MAX_IMG_CHARS && q > 0.4) { q -= 0.15; d = cv.toDataURL('image/jpeg', q); }
            if (d.length > MAX_IMG_CHARS) return fail('That picture is too large. Try a smaller one.');
            a.dataUrl = d; a.state = 'ok'; delete a.pct; renderChips(); updateSendState();
        } catch (e) { fail('Couldn’t read that picture.'); }
        finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail('Couldn’t read that picture.'); };
    img.src = url;
}
function uploadFile(file) {
    if (!S.user) { openAuth('login'); return; }
    if (!S.chat) return;
    if (IMG_EXT.test(file.name || '') || /^image\/(png|jpeg|webp)$/.test(file.type || '')) { attachImage(file); return; }
    if (!OK_EXT.test(file.name)) { toast('That file type isn’t supported (txt, pdf, doc, xls, csv, md, json, jpg, png, webp).', 'err'); return; }
    if (file.size > MAX_UPLOAD) { toast(file.name + ' is larger than 16 MB.', 'err'); return; }
    const a = { name: file.name, state: 'up', pct: 0 };
    S.attach.push(a); renderChips();
    const fd = new FormData(); fd.append('file', file); fd.append('chat_id', S.chat.chat_id);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload'); xhr.withCredentials = true;
    xhr.upload.onprogress = e => { if (e.lengthComputable) { a.pct = Math.round(e.loaded / e.total * 100); renderChips(); } };
    xhr.onerror = () => { a.state = 'bad'; renderChips(); toast('Upload failed — check your connection.', 'err'); };
    xhr.onload = () => {
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch (e) { }
        if (xhr.status === 401) { sessionLost(); return; }
        if (xhr.status === 200 && d.success) { a.state = 'ok'; toast(d.duplicate ? 'That file was already in this chat.' : 'Added to this chat’s knowledge — ask about it.', 'ok'); }
        else { a.state = 'bad'; toast(d.error || 'Upload failed.', 'err'); }
        renderChips();
    };
    xhr.send(fd);
}

/* ---------- voice input ---------- */
let recog = null;
function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const btn = $('mic-btn');
    if (recog) { recog.stop(); return; }
    recog = new SR(); recog.lang = navigator.language || 'en-US'; recog.interimResults = true; recog.continuous = false;
    const base = $('input').value; let finalText = '';
    recog.onresult = ev => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
        $('input').value = (base ? base + ' ' : '') + (finalText + interim).trim(); autoGrow(); updateSendState();
    };
    recog.onend = () => { recog = null; btn.classList.remove('rec'); btn.setAttribute('aria-label', 'Voice input'); };
    recog.onerror = ev => { if (ev.error === 'not-allowed') toast('Microphone permission was denied.', 'err'); };
    try { recog.start(); btn.classList.add('rec'); btn.setAttribute('aria-label', 'Stop voice input'); } catch (e) { recog = null; }
}

/* ============================================================
   AUTH
   ============================================================ */
const A = { mode: 'login', email: '', busy: false };
function authMsg(text, ok) { const m = $('auth-msg'); m.hidden = !text; m.textContent = text || ''; m.classList.toggle('ok', !!ok); }
function setAuthMode(mode) {
    A.mode = mode;
    const su = mode === 'signup', vf = mode === 'verify';
    $('f-first').hidden = $('f-last').hidden = $('f-confirm').hidden = !su;
    $('f-email').hidden = $('f-pass').hidden = vf;
    $('f-code').hidden = !vf;
    $('pass-hint').hidden = !su;
    $('auth-pass').autocomplete = su ? 'new-password' : 'current-password';
    $('auth-title').textContent = su ? 'Create your account' : vf ? 'Check your email' : 'Welcome back';
    $('auth-submit').textContent = su ? 'Send verification code' : vf ? 'Verify & enter' : 'Log in';
    $('auth-switch-text').textContent = su ? 'Already have an account?' : vf ? 'Wrong email?' : 'New here?';
    $('auth-switch').textContent = su ? 'Log in' : vf ? 'Start over' : 'Create an account';
    authMsg('');
}
function openAuth(mode) {
    setAuthMode(mode || 'login');
    $('auth-pass').type = 'password'; setIcon($('pass-eye'), 'eye');
    openModal('m-auth');
    setTimeout(() => { const f = mode === 'signup' ? $('auth-first') : $('auth-email'); f.focus(); }, 40);
}
function authBusy(b) { A.busy = b; const s = $('auth-submit'); s.disabled = b; s.setAttribute('aria-busy', b ? 'true' : 'false'); }
async function submitAuth(ev) {
    ev.preventDefault();
    if (A.busy) return;
    const email = $('auth-email').value.trim().toLowerCase(), pass = $('auth-pass').value;
    authMsg('');
    try {
        if (A.mode === 'login') {
            if (!email || !pass) return authMsg('Enter your email and password.');
            authBusy(true);
            const r = await api('/api/login', { method: 'POST', body: { email, password: pass }, noAuthRedirect: true });
            closeModal('m-auth'); $('auth-pass').value = '';
            await enterApp(r.user);
        } else if (A.mode === 'signup') {
            const first = $('auth-first').value.trim(), last = $('auth-last').value.trim();
            if (!first || !last) return authMsg('Please enter your first and last name.');
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return authMsg('That email address doesn’t look right.');
            if (pass.length < 8) return authMsg('Choose a password with at least 8 characters.');
            if (pass !== $('auth-confirm').value) return authMsg('The two passwords don’t match.');
            authBusy(true);
            const r = await api('/api/register/init', { method: 'POST', body: { email, firstName: first, lastName: last, password: pass }, noAuthRedirect: true });
            A.email = email;
            setAuthMode('verify');
            $('code-hint').textContent = 'We sent a 6-digit code to ' + email + '. It expires in ' + (r.expires_in || 15) + ' minutes.' + (r.dev_code ? '  (dev code: ' + r.dev_code + ')' : '');
            $('auth-code').value = ''; $('auth-code').focus();
            startResendCooldown();
        } else {
            const code = $('auth-code').value.replace(/\D/g, '');
            if (code.length !== 6) return authMsg('Enter the 6-digit code from your email.');
            authBusy(true);
            const r = await api('/api/register/verify', { method: 'POST', body: { email: A.email, code }, noAuthRedirect: true });
            closeModal('m-auth'); $('auth-pass').value = ''; $('auth-confirm').value = '';
            await enterApp(r.user);
            toast('Welcome to Wizard.AI ✨', 'ok');
        }
    } catch (e) { authMsg(errMsg(e)); }
    finally { authBusy(false); }
}
let resendTimer = null;
function startResendCooldown(sec) {
    const b = $('resend-btn'); let left = sec || 30;
    clearInterval(resendTimer); b.disabled = true;
    const tick = () => { if (left <= 0) { clearInterval(resendTimer); b.disabled = false; b.textContent = 'Resend code'; } else { b.textContent = 'Resend code in ' + left + 's'; left--; } };
    tick(); resendTimer = setInterval(tick, 1000);
}
async function resendCode() {
    try {
        const r = await api('/api/resend-code', { method: 'POST', body: { email: A.email }, noAuthRedirect: true });
        authMsg('A new code is on its way.', true);
        if (r.dev_code) $('code-hint').textContent += '  (dev code: ' + r.dev_code + ')';
        startResendCooldown();
    } catch (e) { authMsg(errMsg(e)); if (e.status === 429 && e.data.retry_after) startResendCooldown(Math.min(e.data.retry_after, 3600)); }
}

async function enterApp(user) {
    S.user = user; store.set('user', user);
    renderUser(); showShell();
    S.listLoading = !S.chats.length; renderList();
    await refreshChats(true);
    if (!S.tzSent) { S.tzSent = true; api('/api/user/timezone', { method: 'POST', body: { timezone: tzName() }, noAuthRedirect: true }).catch(() => { }); }
    loadModels();
    api('/api/profile', { noAuthRedirect: true }).then(r => { S.profile = r.profile; }).catch(() => { });
    const last = store.get(lastIdKey(), null);
    const start = S.chats.find(c => c.chat_id === last) || sortedChats()[0];
    if (S.lastSend || S.busy) { renderList(); return; } // user already started typing/sending on the cached view
    if (start) await openChat(start.chat_id);
    else await newChat(true);
}
async function logout() {
    closePops();
    const ok = await confirmBox({ title: 'Log out?', body: 'You’ll need to log in again. Your chats stay safe on the server.', yes: 'Log out' });
    if (!ok) return;
    try { await api('/api/logout', { method: 'POST', noAuthRedirect: true }); } catch (e) { }
    S.user = null; wipeUserData(); closeAllModals();
    $('thread').innerHTML = ''; $('chat-list').innerHTML = '';
    showGate();
}

/* ============================================================
   PROFILE
   ============================================================ */
const PF_LISTS = { education: 'pf-edu', skills: 'pf-skills', interests: 'pf-interests', favorite_topics: 'pf-topics', learning_interests: 'pf-learning', known_topics: 'pf-known' };
const csv = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
function fillProfile(p) {
    p = p || {};
    const set = (id, v) => { const el = $(id); if (el) el.value = v == null ? '' : v; };
    set('pf-full', p.full_name); set('pf-display', p.display_name); set('pf-birthday', p.birthday); set('pf-gender', p.gender);
    set('pf-bio', p.bio); set('pf-phone', p.phone); set('pf-website', p.website); set('pf-greeting', p.custom_greeting);
    set('pf-occupation', p.occupation); set('pf-company', p.company); set('pf-exp', p.experience_years);
    for (const k in PF_LISTS) set(PF_LISTS[k], Array.isArray(p[k]) ? p[k].join(', ') : '');
    $('pf-mode').innerHTML = MODES.map(m => '<option value="' + m.id + '">' + m.emoji + ' ' + m.name + '</option>').join('');
    set('pf-mode', p.preferred_mode || 'JARVIS'); set('pf-style', p.response_style || 'balanced'); set('pf-formal', p.formality_level || 'casual');
    set('pf-emoji', p.emoji_preference === false ? 'false' : 'true'); set('pf-instr', p.custom_instructions);
    set('pf-goals', Array.isArray(p.goals) ? p.goals.map(g => typeof g === 'object' && g ? g.text : g).join('\n') : '');
    set('pf-reminders', Array.isArray(p.reminders) ? p.reminders.join('\n') : '');
    const pct = Math.max(0, Math.min(100, p.profile_completeness || 0));
    $('pf-bar').style.width = pct + '%'; $('pf-pct').textContent = pct + '%';
}
async function openProfile() {
    if (!S.user) return openAuth('login');
    openModal('m-profile'); fillProfile(S.profile);
    try { const r = await api('/api/profile'); S.profile = r.profile; fillProfile(S.profile); } catch (e) { toast(errMsg(e), 'err'); }
}
async function saveProfile() {
    const v = id => $(id).value.trim();
    const lines = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    const body = {
        full_name: v('pf-full') || null, display_name: v('pf-display') || null, birthday: v('pf-birthday') || null, gender: v('pf-gender') || null,
        bio: v('pf-bio') || null, phone: v('pf-phone') || null, website: v('pf-website') || null, custom_greeting: v('pf-greeting') || null,
        occupation: v('pf-occupation') || null, company: v('pf-company') || null, experience_years: v('pf-exp') ? parseInt(v('pf-exp'), 10) : null,
        preferred_mode: $('pf-mode').value || 'JARVIS', response_style: $('pf-style').value, formality_level: $('pf-formal').value,
        emoji_preference: $('pf-emoji').value === 'true', custom_instructions: v('pf-instr') || null, goals: lines('pf-goals'), reminders: lines('pf-reminders')
    };
    for (const k in PF_LISTS) body[k] = csv($(PF_LISTS[k]).value);
    const b = $('pf-save'); b.setAttribute('aria-busy', 'true'); b.disabled = true;
    try {
        const r = await api('/api/profile/update', { method: 'POST', body });
        S.profile = r.profile; fillProfile(S.profile);
        toast('Profile saved', 'ok'); closeModal('m-profile');
    } catch (e) { toast(errMsg(e), 'err'); }
    finally { b.removeAttribute('aria-busy'); b.disabled = false; }
}

/* ============================================================
   STATS & KEYS
   ============================================================ */
async function openStats() {
    if (!S.user) return openAuth('login');
    openModal('m-stats');
    $('stat-grid').innerHTML = '<div class="skel" style="grid-column:1/-1"></div>'; $('stat-kv').innerHTML = '';
    try {
        const d = await api('/api/stats');
        const big = [['Messages', d.messages], ['Chats', d.chats], ['Images', d.images], ['Searches', d.searches], ['Code runs', d.code], ['Files', d.files]];
        $('stat-grid').innerHTML = big.map(([l, n]) => '<div class="stat"><b>' + esc(Number(n || 0).toLocaleString()) + '</b><span>' + l + '</span></div>').join('');
        const kv = [['Memories', d.memories], ['Documents', d.documents], ['API keys', d.api_keys],
        ['Average reply time', d.avg_response_time != null ? d.avg_response_time + 's' : '—'], ['Fastest reply', d.fastest_response != null ? d.fastest_response + 's' : '—'],
        ['Account created', d.account_created || '—'], ['Last login', d.last_login || '—']];
        $('stat-kv').innerHTML = kv.map(([l, n]) => '<div><span>' + l + '</span><span>' + esc(n == null ? 0 : n) + '</span></div>').join('');
    } catch (e) { $('stat-grid').innerHTML = '<div class="list-empty" style="grid-column:1/-1">' + esc(errMsg(e)) + '</div>'; }
}
async function openKeys() {
    if (!S.user) return openAuth('login');
    openModal('m-keys');
    const box = $('keys-list'); box.innerHTML = '<div class="skel"></div>';
    try {
        const keys = await api('/api/keys');
        const list = Array.isArray(keys) ? keys : (keys.keys || []);
        box.innerHTML = list.length ? list.map(k => {
            const key = String(k.key || '');
            const masked = key.length > 14 ? key.slice(0, 7) + '••••••••' + key.slice(-4) : '••••••••';
            return '<div class="krow"><div style="flex:1;min-width:0"><b>' + esc(k.name || 'Key') + '</b><br><code>' + esc(masked) + '</code></div>' +
                '<span class="muted small">' + (k.requests || 0) + ' requests</span><span class="badge" style="margin:0">' + (k.is_active === false ? 'Revoked' : 'Active') + '</span></div>';
        }).join('') : '<div class="list-empty">No API keys yet. Create one in the Developer Hub.</div>';
    } catch (e) { box.innerHTML = '<div class="list-empty">' + esc(errMsg(e)) + '</div>'; }
}

/* ============================================================
   PERSONALITIES
   ============================================================ */
const PS = { tab: 'featured', editing: null, seq: 0 };
async function openPersonas(tab) {
    openModal('m-personas'); setPersonaTab(tab || PS.tab);
}
async function setPersonaTab(tab) {
    PS.tab = tab;
    qsa('#persona-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const grid = $('persona-grid'); const seq = ++PS.seq;
    grid.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    try {
        let list = await api('/api/personalities/' + tab, { noAuthRedirect: tab !== 'mine' });
        if (seq !== PS.seq) return;
        list = Array.isArray(list) ? list : [];
        const cur = personaFor(S.chat);
        let html = '';
        if (cur) html += '<button type="button" class="pcard" data-clear><span class="pe">' + esc(modeOf(S.chat.mode).emoji) + '</span><b>Back to ' + esc(modeOf(S.chat.mode).name) + '</b><small>Stop using “' + esc(cur.name) + '”</small></button>';
        html += list.map(p => '<div class="pcard" data-pid="' + p.id + '"><span class="pe">' + esc(p.emoji || '🤖') + '</span><b>' + esc(p.name) + '</b><small>by ' + esc(p.creator || 'Anonymous') + (p.is_public ? '' : ' · private') + '</small>' +
            '<p class="pp">' + esc(p.system_prompt || '') + '</p><div class="pm"><span class="grow">' + (p.uses || 0) + ' uses</span>' +
            (tab === 'mine' ? '<button type="button" class="act" data-edit aria-label="Edit"><i data-icon="edit"></i></button><button type="button" class="act" data-del aria-label="Delete"><i data-icon="trash"></i></button>' : '') +
            '<button type="button" class="act" data-like aria-label="Like"><i data-icon="heart"></i><span style="font-size:11px;margin-left:3px">' + (p.likes || 0) + '</span></button>' +
            '<button type="button" class="btn primary sm" data-use>Use</button></div></div>').join('');
        if (!list.length && !cur) html = '<div class="empty-block">' + (tab === 'mine' ? 'You haven’t created a personality yet.<br>Tap “Create” to craft one.' : 'Nothing here yet — be the first to share one!') + '</div>';
        grid.innerHTML = html; hydrate(grid);
        grid._list = list;
    } catch (e) { if (seq === PS.seq) grid.innerHTML = '<div class="empty-block">' + esc(e.status === 401 ? 'Log in to see your personalities.' : errMsg(e)) + '</div>'; }
}
async function usePersona(p) {
    if (!S.chat) return;
    S.personas[S.chat.chat_id] = { id: p.id, name: p.name, emoji: p.emoji || '🤖', greeting: p.greeting || '' };
    store.set('persona', S.personas);
    renderHeader(); if (!(S.chat.messages || []).length) renderEmpty();
    closeModal('m-personas'); toast('Now chatting with ' + p.name + ' ' + (p.emoji || ''), 'ok');
    api('/api/personalities/' + p.id + '/use', { method: 'POST', noAuthRedirect: true }).catch(() => { });
    focusInput();
}
function clearPersona() {
    if (!S.chat) return;
    delete S.personas[S.chat.chat_id]; store.set('persona', S.personas);
    renderHeader(); if (!(S.chat.messages || []).length) renderEmpty();
    closeModal('m-personas'); toast('Back to ' + modeOf(S.chat.mode).name, 'ok');
}
function openPersonaEditor(p) {
    PS.editing = p || null;
    $('pe-title').textContent = p ? 'Edit personality' : 'Craft a personality';
    $('pe-emoji').value = p ? p.emoji || '' : ''; $('pe-name').value = p ? p.name : '';
    $('pe-prompt').value = p ? p.system_prompt || '' : ''; $('pe-greeting').value = p ? p.greeting || '' : '';
    $('pe-public').checked = p ? !!p.is_public : true;
    $('pe-count').textContent = $('pe-prompt').value.length; $('pe-msg').hidden = true;
    openModal('m-persona-edit');
}
async function savePersona(ev) {
    ev.preventDefault();
    const body = { emoji: $('pe-emoji').value.trim() || '🤖', name: $('pe-name').value.trim(), prompt: $('pe-prompt').value.trim(), greeting: $('pe-greeting').value.trim(), is_public: $('pe-public').checked };
    if (!body.name || !body.prompt) { const m = $('pe-msg'); m.hidden = false; m.textContent = 'A name and instructions are required.'; return; }
    const b = $('pe-save'); b.setAttribute('aria-busy', 'true'); b.disabled = true;
    try {
        if (PS.editing) await api('/api/personalities/' + PS.editing.id, { method: 'PATCH', body });
        else await api('/api/personalities', { method: 'POST', body });
        closeModal('m-persona-edit'); toast('Personality saved', 'ok');
        if ($('m-personas').hidden) openModal('m-personas');
        setPersonaTab('mine');
    } catch (e) { const m = $('pe-msg'); m.hidden = false; m.textContent = errMsg(e); }
    finally { b.removeAttribute('aria-busy'); b.disabled = false; }
}
async function onPersonaGridClick(e) {
    if (e.target.closest('[data-clear]')) return clearPersona();
    const card = e.target.closest('.pcard[data-pid]'); if (!card) return;
    const id = +card.dataset.pid; const p = ($('persona-grid')._list || []).find(x => x.id === id); if (!p) return;
    if (e.target.closest('[data-use]')) return usePersona(p);
    if (e.target.closest('[data-edit]')) return openPersonaEditor(p);
    if (e.target.closest('[data-del]')) {
        const ok = await confirmBox({ title: 'Delete “' + p.name + '”?', body: 'This also removes it for anyone using it.', yes: 'Delete', danger: true });
        if (!ok) return;
        try { await api('/api/personalities/' + id, { method: 'DELETE' }); toast('Deleted', 'ok'); if (S.chat && personaFor(S.chat) && personaFor(S.chat).id === id) clearPersona(); setPersonaTab('mine'); } catch (er) { toast(errMsg(er), 'err'); }
        return;
    }
    if (e.target.closest('[data-like]')) {
        const btn = e.target.closest('[data-like]');
        try {
            const r = await api('/api/personalities/' + id + '/like', { method: 'POST' });
            btn.classList.toggle('liked', !!r.liked); qs('span', btn).textContent = r.likes;
        } catch (er) { toast(errMsg(er), 'err'); }
    }
}

/* ============================================================
   CODE & IMAGE STUDIOS
   ============================================================ */
async function runCode() {
    if (!S.user) return openAuth('login');
    const code = $('code-input').value; if (!code.trim()) return;
    const out = $('code-out'), btn = $('code-run');
    out.textContent = 'Running…'; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    const t0 = performance.now();
    try {
        const d = await api('/api/execute', { method: 'POST', body: { code } });
        out.innerHTML = '';
        const add = (txt, cls) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = txt; out.appendChild(s); };
        if (d.error) add('✗ ' + d.error, 'e');
        else {
            if (d.stdout) add(d.stdout);
            if (d.stderr) add((d.stdout ? '\n' : '') + d.stderr, 'e');
            if (!d.stdout && !d.stderr) add('✓ Finished with no output.', 'ok');
        }
        $('code-meta').textContent = 'Ran in ' + Math.round(performance.now() - t0) + ' ms';
    } catch (e) { out.innerHTML = ''; const s = document.createElement('span'); s.className = 'e'; s.textContent = '✗ ' + errMsg(e); out.appendChild(s); }
    finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}
async function makeImage(ev) {
    ev.preventDefault();
    if (!S.user) return openAuth('login');
    const prompt = $('image-prompt').value.trim(); if (!prompt) { toast('Describe the image first.', 'warn'); return; }
    const box = $('image-result'), btn = $('image-go');
    box.innerHTML = '<div class="shim">Conjuring your image…</div>'; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    try {
        const d = await api('/api/generate-image', { method: 'POST', body: { prompt, size: $('image-size').value } });
        if (!d.url || !safeImg(d.url)) throw new Error(d.error || 'No image came back. Try a different description.');
        const src = imgSrc(d.url);
        box.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(prompt) + '"><div class="row"><button type="button" class="btn ghost sm" data-dl><i data-icon="download"></i>Download</button><button type="button" class="btn ghost sm" data-open><i data-icon="external"></i>View full size</button></div>';
        hydrate(box);
        qs('img', box).onclick = () => openLightbox(src, prompt);
        qs('[data-open]', box).onclick = () => openLightbox(src, prompt);
        qs('[data-dl]', box).onclick = () => downloadImage(src);
        qs('img', box).onerror = () => { box.innerHTML = '<div class="list-empty">The image couldn’t be loaded. Try again.</div>'; };
    } catch (e) { box.innerHTML = '<div class="list-empty">' + esc(errMsg(e)) + '</div>'; }
    finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

/* ============================================================
   MODE MENU
   ============================================================ */
function openModeMenu() {
    const c = S.chat; if (!c) return;
    const cur = personaFor(c) ? null : c.mode;
    let html = '<div class="gh">Personality</div>' + MODES.map(m =>
        '<button type="button" role="option" class="opt' + (m.id === cur ? ' cur' : '') + '" data-mode="' + m.id + '" aria-selected="' + (m.id === cur) + '"><span class="oe">' + m.emoji + '</span><span class="ot"><b>' + m.name + '</b><small>' + esc(m.desc) + '</small></span><i data-icon="check" class="tick"></i></button>').join('');
    html += '<div class="gh">Community</div><button type="button" class="opt" data-browse><span class="oe">🎭</span><span class="ot"><b>Browse personalities</b><small>Use or craft custom characters</small></span></button>';
    const m = $('mode-menu'); m.innerHTML = html; hydrate(m);
    openPop(m, $('mode-btn'), {});
}
function renderModelBtn() {
    const t = S.tiers.find(x => x.id === S.model);
    if (!t) S.model = 'auto';
    $('model-emoji').textContent = t ? t.emoji : '✨';
    $('model-name').textContent = t ? t.label : 'Auto';
}
function openModelMenu() {
    const opts = [{ id: 'auto', emoji: '✨', label: 'Auto', desc: 'Picks the best model for each message' }].concat(S.tiers);
    $('model-menu').innerHTML = '<div class="gh">Model</div>' + opts.map(t =>
        '<button type="button" role="option" class="opt' + (t.id === S.model ? ' cur' : '') + '" data-model="' + esc(t.id) + '" aria-selected="' + (t.id === S.model) + '"><span class="oe">' + t.emoji + '</span><span class="ot"><b>' + esc(t.label) + '</b><small>' + esc(t.desc) + '</small></span><i data-icon="check" class="tick"></i></button>').join('');
    hydrate($('model-menu'));
    openPop($('model-menu'), $('model-btn'), {});
}
function setModel(id) { S.model = id; store.set('model', id); closePops(); renderModelBtn(); toast(id === 'auto' ? 'Model: Auto' : 'Model: ' + (S.tiers.find(x => x.id === id) || {}).label); }
function loadModels() {
    api('/api/compound/models', { noAuthRedirect: true }).then(r => { S.tiers = (r && r.tiers) || []; renderModelBtn(); }).catch(() => { });
}
async function setMode(id) {
    const c = S.chat; if (!c) return;
    closePops();
    if (personaFor(c)) { delete S.personas[c.chat_id]; store.set('persona', S.personas); }
    c.mode = id; renderHeader();
    const s = S.chats.find(x => x.chat_id === c.chat_id); if (s) s.mode = id;
    if (!(c.messages || []).length) renderEmpty();
    api('/api/ai-chats/' + encodeURIComponent(c.chat_id), { method: 'PATCH', body: { mode: id } }).catch(e => toast(errMsg(e), 'err'));
}

/* ============================================================
   COMMAND PALETTE
   ============================================================ */
const PAL = { items: [], sel: 0, seq: 0, hits: [] };
function palActions() {
    const A_ = [
        { label: 'New chat', sub: 'Start a fresh conversation', icon: 'plus', kw: 'new chat start', run: () => newChat() },
        { label: 'Toggle sidebar', icon: 'sidebar', kw: 'sidebar hide show collapse', run: toggleSidebar },
        { label: 'Rename this chat', icon: 'edit', kw: 'rename title', run: () => S.chat && renameChat(S.chat.chat_id) },
        { label: 'Export this chat', sub: 'Download as Markdown', icon: 'download', kw: 'export download markdown', run: () => S.chat && exportChat(S.chat.chat_id) },
        { label: 'Clear this chat', icon: 'trash', kw: 'clear delete messages', run: () => S.chat && clearChat(S.chat.chat_id) },
        { label: 'Image studio', icon: 'image', kw: 'image generate picture', run: () => openModal('m-image') },
        { label: 'Python sandbox', icon: 'terminal', kw: 'code python run sandbox', run: () => openModal('m-code') },
        { label: 'Personalities', icon: 'users', kw: 'personality persona character', run: () => openPersonas() },
        { label: 'Profile', icon: 'user', kw: 'profile about me', run: openProfile },
        { label: 'Usage & stats', icon: 'bar-chart', kw: 'stats usage', run: openStats },
        { label: 'API keys', icon: 'key', kw: 'api keys developer', run: openKeys },
        { label: 'Settings', icon: 'settings', kw: 'settings preferences', run: () => openSettings() },
        { label: 'Keyboard shortcuts', icon: 'keyboard', kw: 'help shortcuts keys', run: () => openModal('m-help') },
        { label: 'What’s new', icon: 'book', kw: 'updates changelog', run: () => openModal('m-updates') },
        { label: 'Log out', icon: 'logout', kw: 'logout sign out', run: logout }
    ];
    MODES.forEach(m => A_.push({ label: 'Switch to ' + m.name, sub: m.desc, emoji: m.emoji, kw: 'mode personality ' + m.name, run: () => setMode(m.id) }));
    return A_;
}
function palBuild() {
    const q = $('pal-input').value.trim();
    const items = [];
    const chats = sortedChats().map(c => ({ group: 'Chats', label: c.name || 'New chat', sub: c.preview || '', emoji: c.emoji || '💬', s: q ? Math.max(fuzzy(q, c.name), fuzzy(q, c.preview) - 6) : 0, run: () => openChat(c.chat_id) })).filter(x => x.s >= 0);
    const acts = palActions().map(a => Object.assign(a, { group: 'Actions', s: q ? Math.max(fuzzy(q, a.label), fuzzy(q, a.kw) - 4) : 0 })).filter(x => x.s >= 0);
    if (q) { chats.sort((a, b) => b.s - a.s); acts.sort((a, b) => b.s - a.s); }
    const hits = PAL.hits.filter(h => h.snippet).map(h => ({ group: 'In messages', label: h.name, sub: h.snippet, emoji: h.emoji || '💬', run: () => openChat(h.chat_id, { scrollTo: h.index }) }));
    items.push(...(q ? chats.slice(0, 6) : chats.slice(0, 5)), ...acts.slice(0, q ? 8 : 7), ...hits.slice(0, 5));
    PAL.items = items; PAL.sel = Math.min(PAL.sel, Math.max(0, items.length - 1));
    let html = '', g = '';
    items.forEach((it, i) => {
        if (it.group !== g) { g = it.group; html += '<div class="pal-g">' + g + '</div>'; }
        html += '<button type="button" class="pal-item' + (i === PAL.sel ? ' on' : '') + '" role="option" data-i="' + i + '">' + (it.emoji ? '<span class="pe">' + esc(it.emoji) + '</span>' : '<i data-icon="' + it.icon + '"></i>') +
            '<span class="pt"><span>' + highlightTerm(it.label, q) + '</span>' + (it.sub ? '<small>' + (it.group === 'In messages' ? highlightTerm(it.sub, q) : esc(it.sub)) + '</small>' : '') + '</span></button>';
    });
    if (!items.length) html = '<div class="list-empty">Nothing found for “' + esc(q) + '”.</div>';
    const list = $('pal-list'); list.innerHTML = html; hydrate(list);
}
const palSearch = debounce(async () => {
    const q = $('pal-input').value.trim(); const seq = ++PAL.seq;
    if (q.length < 2) { PAL.hits = []; palBuild(); return; }
    try { const r = await api('/api/ai-chats/search?q=' + encodeURIComponent(q), { noAuthRedirect: true }); if (seq === PAL.seq) { PAL.hits = r.results || []; palBuild(); } } catch (e) { }
}, 260);
function openPalette() {
    if (!S.user) return;
    $('pal-input').value = ''; PAL.sel = 0; PAL.hits = []; palBuild(); openModal('m-palette'); $('pal-input').focus();
}
function palRun(i) { const it = PAL.items[i]; if (!it) return; closeModal('m-palette'); setTimeout(it.run, 30); }
function palMove(d) {
    if (!PAL.items.length) return;
    PAL.sel = (PAL.sel + d + PAL.items.length) % PAL.items.length;
    qsa('.pal-item').forEach((b, i) => b.classList.toggle('on', i === PAL.sel));
    const on = qs('.pal-item.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}

/* ============================================================
   SETTINGS
   ============================================================ */
function openSettings() {
    $('set-enter').checked = !!S.settings.enterSends; $('set-autoweb').checked = !!S.settings.autoWeb;
    $('set-motion').checked = !!S.settings.calm; $('set-density').value = S.settings.density || 'cozy';
    openModal('m-settings');
}

/* ============================================================
   STARFIELD
   ============================================================ */
function initStars() {
    const cv = $('starfield'); if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d'); let W = 0, H = 0, stars = [], raf = 0, running = false;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    function size() {
        W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const n = Math.min(150, Math.floor(W * H / 9000));
        stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + .25, a: Math.random() * .6 + .2, p: Math.random() * 6.28, s: Math.random() * .6 + .2, g: Math.random() < .18 }));
    }
    function frame(t) {
        ctx.clearRect(0, 0, W, H);
        for (const s of stars) {
            const a = s.a * (.55 + .45 * Math.sin(t / 1000 * s.s + s.p));
            ctx.globalAlpha = a; ctx.fillStyle = s.g ? '#e8c97a' : '#d4d0e8';
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
            s.y -= s.s * .03; if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
        }
        raf = running ? requestAnimationFrame(frame) : 0;
    }
    function start() { if (running || reduceMotion() || document.hidden) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); raf = 0; }
    size(); start();
    addEventListener('resize', debounce(() => { size(); }, 200));
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    window.__stars = { start, stop, refresh: () => reduceMotion() ? stop() : start() };
}

/* ============================================================
   EVENTS
   ============================================================ */
function bind() {
    // gate
    $('gate-login').onclick = () => openAuth('login');
    $('gate-signup').onclick = () => openAuth('signup');
    // auth
    $('auth-form').addEventListener('submit', submitAuth);
    $('auth-switch').onclick = () => { const m = A.mode; if (m === 'login') setAuthMode('signup'); else setAuthMode('login'); };
    $('resend-btn').onclick = resendCode;
    $('pass-eye').onclick = () => { const p = $('auth-pass'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; setIcon($('pass-eye'), show ? 'eye-off' : 'eye'); $('pass-eye').setAttribute('aria-label', show ? 'Hide password' : 'Show password'); };
    $('auth-code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6 && !A.busy) $('auth-form').requestSubmit(); });

    // sidebar
    $('new-chat-btn').onclick = () => newChat();
    $('collapse-btn').onclick = toggleSidebar;
    $('menu-btn').onclick = toggleSidebar;
    $('scrim').onclick = closeDrawer;
    $('chat-filter').addEventListener('input', e => {
        S.filter = e.target.value; S.hits = []; renderList();
        const q = S.filter.trim(), seq = ++S.searchSeq;
        if (q.length >= 2) setTimeout(async () => {
            if (seq !== S.searchSeq) return;
            try { const r = await api('/api/ai-chats/search?q=' + encodeURIComponent(q), { noAuthRedirect: true }); if (seq === S.searchSeq) { S.hits = r.results || []; renderList(); } } catch (er) { }
        }, 280);
    });
    $('chat-filter').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; S.filter = ''; S.hits = []; renderList(); e.target.blur(); e.stopPropagation(); } });
    $('chat-list').addEventListener('click', e => {
        const more = e.target.closest('[data-more]'), item = e.target.closest('.chat-item'); if (!item) return;
        if (more) { e.stopPropagation(); S.menuChatId = item.dataset.id; openPop($('item-menu'), more, { alignRight: true }); return; }
        openChat(item.dataset.id, { scrollTo: item.dataset.index });
    });
    $('chat-list').addEventListener('keydown', e => {
        const item = e.target.closest('.chat-item'); if (!item || e.target !== item) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(item.dataset.id, { scrollTo: item.dataset.index }); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const all = qsa('.chat-item'); const k = all.indexOf(item) + (e.key === 'ArrowDown' ? 1 : -1); if (all[k]) all[k].focus(); }
        if (e.key === 'F2') { renameChat(item.dataset.id); }
        if (e.key === 'Delete') { deleteChat(item.dataset.id); }
    });
    $('chat-list').addEventListener('contextmenu', e => { const item = e.target.closest('.chat-item:not(.hit)'); if (!item) return; e.preventDefault(); S.menuChatId = item.dataset.id; openPop($('item-menu'), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }, {}); });
    $('item-menu').addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return; const id = S.menuChatId; closePops();
        if (b.dataset.act === 'rename') renameChat(id); else if (b.dataset.act === 'export') exportChat(id); else if (b.dataset.act === 'delete') deleteChat(id);
    });
    $('user-btn').onclick = () => openPop($('user-menu'), $('user-btn'), { up: true });
    $('user-menu').addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return; closePops();
        ({
            profile: openProfile, stats: openStats, personalities: () => openPersonas(), keys: openKeys,
            devhub: () => window.open('/ai/devhub/', '_blank', 'noopener'), agents: () => window.open('/ai/agent-studio/', '_blank', 'noopener'),
            settings: openSettings, help: () => openModal('m-help'), updates: () => openModal('m-updates'), logout,
            install: async () => { if (S.deferredInstall) { S.deferredInstall.prompt(); S.deferredInstall = null; $('install-item').hidden = true; } }
        })[b.dataset.act]();
    });

    // top bar
    $('title-btn').onclick = () => S.chat && renameChat(S.chat.chat_id);
    $('mode-btn').onclick = openModeMenu;
    $('model-btn').onclick = openModelMenu;
    $('preview-dl').onclick = () => downloadBlob('wizard-ai-page.' + (S.previewExt || 'html'), S.previewCode || '', 'text/html;charset=utf-8');
    $('preview-reload').onclick = () => { const f = $('preview-frame'), d = f.srcdoc; f.srcdoc = ''; setTimeout(() => { f.srcdoc = d || S.previewCode || ''; }, 30); };
    $('model-menu').addEventListener('click', e => { const b = e.target.closest('[data-model]'); if (b) setModel(b.dataset.model); });
    $('mode-menu').addEventListener('click', e => {
        if (e.target.closest('[data-browse]')) { closePops(); openPersonas(); return; }
        const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode);
    });
    $('palette-btn').onclick = openPalette;
    $('export-btn').onclick = () => S.chat && exportChat(S.chat.chat_id);
    $('conn').onclick = () => { setConn('warn'); fetch(API + '/status', { credentials: 'include' }).then(r => setConn(r.ok ? 'ok' : 'off')).catch(() => setConn('off')); };

    // thread
    $('thread').addEventListener('click', onThreadClick);
    $('thread').addEventListener('keydown', onThreadKey);
    $('sparks').addEventListener('click', e => { const b = e.target.closest('.spark'); if (b) send(b.dataset.q); });
    $('scroller').addEventListener('scroll', () => { S.stick = nearBottom(); updateJump(); }, { passive: true });
    $('jump-btn').onclick = () => { S.stick = true; $('scroller').scrollTo({ top: $('scroller').scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' }); };

    // composer
    const inp = $('input');
    inp.addEventListener('input', () => { autoGrow(); updateSendState(); saveDraftSoon(); });
    inp.addEventListener('keydown', e => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
            const mod = e.ctrlKey || e.metaKey;
            if ((S.settings.enterSends && !e.shiftKey) || mod) { e.preventDefault(); if (!S.busy) submitComposer(); }
        } else if (e.key === 'ArrowUp' && !inp.value) { e.preventDefault(); editLastUser(); }
    });
    inp.addEventListener('paste', e => {
        const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
        if (files.length) { e.preventDefault(); files.forEach(uploadFile); }
    });
    $('composer').addEventListener('submit', e => { e.preventDefault(); submitComposer(); });
    $('send-btn').addEventListener('click', e => { if (S.busy) { e.preventDefault(); abortTurn(); } });
    $('attach-btn').onclick = () => $('file-input').click();
    $('file-input').onchange = e => { Array.from(e.target.files).forEach(uploadFile); e.target.value = ''; };
    $('attach-chips').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { S.attach.splice(+b.dataset.rm, 1); renderChips(); updateSendState(); } });
    $('web-btn').onclick = () => setWeb(!S.webOn);
    $('image-btn').onclick = () => openModal('m-image');
    $('code-btn').onclick = () => openModal('m-code');
    if (window.SpeechRecognition || window.webkitSpeechRecognition) $('mic-btn').onclick = toggleMic; else $('mic-btn').hidden = true;
    let dragN = 0;
    const main = qs('.main');
    main.addEventListener('dragenter', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragN++; $('drop-hint').hidden = false; $('composer').classList.add('drag'); } });
    main.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('drop-hint').hidden = true; $('composer').classList.remove('drag'); } });
    main.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
    main.addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('drop-hint').hidden = true; $('composer').classList.remove('drag'); Array.from(e.dataTransfer.files || []).forEach(uploadFile); });

    // modals
    document.addEventListener('click', e => {
        const c = e.target.closest('[data-close]'); if (c) { const m = c.closest('.modal'); if (m) closeModal(m); return; }
        if (e.target.classList && e.target.classList.contains('modal') && e.target.id !== 'm-confirm') { if (e.target._down) closeModal(e.target); }
        if (openPopEl && !openPopEl.contains(e.target) && !(openPopAnchor && openPopAnchor.contains && openPopAnchor.contains(e.target))) closePops();
    });
    document.addEventListener('mousedown', e => { if (e.target.classList && e.target.classList.contains('modal')) e.target._down = true; }, true);
    document.addEventListener('mouseup', () => setTimeout(() => qsa('.modal').forEach(m => { m._down = false; }), 0), true);
    $('confirm-yes').onclick = () => resolveConfirm(true);
    $('confirm-no').onclick = () => resolveConfirm(false);
    $('rename-form').addEventListener('submit', e => { e.preventDefault(); doRename($('rename-input').value); closeModal('m-rename'); });
    $('snack-undo').onclick = () => { const f = snackUndo; hideSnack(); if (f) f(); };

    // profile
    qsa('#profile-tabs .tab').forEach(t => t.onclick = () => {
        qsa('#profile-tabs .tab').forEach(x => x.classList.toggle('active', x === t));
        qsa('#m-profile .pane').forEach(p => p.classList.toggle('active', p.dataset.pane === t.dataset.tab));
    });
    $('pf-save').onclick = saveProfile;
    // personalities
    qsa('#persona-tabs .tab').forEach(t => t.onclick = () => setPersonaTab(t.dataset.tab));
    $('persona-grid').addEventListener('click', onPersonaGridClick);
    $('persona-new').onclick = () => { if (!S.user) return openAuth('login'); openPersonaEditor(null); };
    $('pe-form').addEventListener('submit', savePersona);
    $('pe-prompt').addEventListener('input', e => { $('pe-count').textContent = e.target.value.length; });
    // code & image
    $('code-run').onclick = runCode;
    $('code-clear').onclick = () => { $('code-input').value = ''; $('code-out').textContent = ''; $('code-meta').textContent = ''; $('code-input').focus(); };
    $('code-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const t = e.target, s = t.selectionStart; t.value = t.value.slice(0, s) + '    ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 4; }
    });
    $('image-form').addEventListener('submit', makeImage);
    $('lightbox-dl').onclick = () => downloadImage($('lightbox-img').src);
    // settings
    $('set-enter').onchange = e => { S.settings.enterSends = e.target.checked; applySettings(); };
    $('set-autoweb').onchange = e => { S.settings.autoWeb = e.target.checked; applySettings(); autoGrow(); };
    $('set-motion').onchange = e => { S.settings.calm = e.target.checked; applySettings(); if (window.__stars) window.__stars.refresh(); };
    $('set-density').onchange = e => { S.settings.density = e.target.value; applySettings(); };
    $('set-export-all').onclick = exportAll;
    $('set-clear-cache').onclick = () => {
        const keep = { user: S.user, settings: S.settings, persona: S.personas };
        store.wipe(); store.set('settings', keep.settings); store.set('persona', keep.persona); store.set('user', keep.user); store.set('chats', S.chats);
        toast('Local cache cleared', 'ok');
    };
    // palette
    $('pal-input').addEventListener('input', () => { PAL.sel = 0; palBuild(); palSearch(); });
    $('pal-input').addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); palRun(PAL.sel); }
    });
    $('pal-list').addEventListener('click', e => { const b = e.target.closest('.pal-item'); if (b) palRun(+b.dataset.i); });
    $('pal-list').addEventListener('mousemove', e => { const b = e.target.closest('.pal-item'); if (b && +b.dataset.i !== PAL.sel) { PAL.sel = +b.dataset.i; qsa('.pal-item').forEach((x, i) => x.classList.toggle('on', i === PAL.sel)); } });

    // keyboard
    document.addEventListener('keydown', e => {
        const mod = e.ctrlKey || e.metaKey;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
        if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('m-palette').hidden) openPalette(); else closeModal('m-palette'); return; }
        if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); newChat(); return; }
        if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); return; }
        if (e.key === 'Escape') {
            if (openPopEl) { closePops(); return; }
            const m = topModal(); if (m) { if (m.id === 'm-confirm') resolveConfirm(false); else closeModal(m); return; }
            if (S.busy) { abortTurn(); return; }
            if ($('shell').classList.contains('drawer')) closeDrawer();
            return;
        }
        if (typing || mod || e.altKey || modalStack.length || !S.user) return;
        if (e.key === '/') { e.preventDefault(); $('input').focus(); }
        else if (e.key === '?') { e.preventDefault(); openModal('m-help'); }
    });
    // focus trap inside modals
    document.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const m = topModal(); if (!m) return;
        const f = qsa('button:not([disabled]):not([hidden]), input:not([hidden]):not([disabled]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])', m).filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    // misc
    addEventListener('resize', closePops);
    $('scroller').addEventListener('scroll', closePops, { passive: true });
    $('chat-list').addEventListener('scroll', closePops, { passive: true });
    addEventListener('online', () => { setConn('ok'); if (S.user) refreshChats(true); });
    addEventListener('offline', () => setConn('off'));
    mobileMQ.addEventListener && mobileMQ.addEventListener('change', () => { closeDrawer(); applySettings(); });
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.deferredInstall = e; const i = $('install-item'); if (i) i.hidden = false; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user && !S.busy) { refreshChats(true); } });
    setInterval(() => { if (document.hidden || !S.user || $('shell').hidden) return; fetch(API + '/status', { credentials: 'include' }).then(r => { if (r.ok) { if (S.offline) setConn('ok'); } else setConn('warn'); }).catch(() => setConn('off')); }, 60000);
    addEventListener('beforeunload', e => { if (S.busy && S.phase === 'net') { e.preventDefault(); e.returnValue = ''; } });
}

/* ---------- desktop (Electron) menu hooks ---------- */
function bindElectron() {
    const E = window.electronAPI; if (!E) return;
    const on = (name, fn) => { try { if (typeof E[name] === 'function') E[name](fn); } catch (e) { } };
    on('onNewChat', () => newChat());
    on('onClearChat', () => S.chat && clearChat(S.chat.chat_id));
    on('onOpenImageGen', () => openModal('m-image'));
    on('onOpenCode', () => openModal('m-code'));
    on('onUploadFile', () => $('file-input').click());
    on('onViewProfile', openProfile);
    on('onViewStats', openStats);
    on('onChangeMode', mode => { const id = typeof mode === 'string' ? mode.replace(/ Mode$/i, '').trim() : ''; const m = MODES.find(x => x.id.toLowerCase() === id.toLowerCase()); if (m) setMode(m.id); });
    on('onToggleSearch', en => setWeb(!!en));
    on('onOpenSettings', () => openSettings());
    on('onExportChat', () => S.chat && exportChat(S.chat.chat_id));
    on('onBrowsePersonalities', () => openPersonas());
    on('onOpenAgentStudio', () => window.open('/ai/agent-studio/', '_blank'));
    on('onOpenDevHub', () => window.open('/ai/devhub/', '_blank'));
    on('onOpenAdmin', () => window.open('/ai/admin/', '_blank'));
    on('onUpdateStatus', (ev, d) => { const x = d || ev; if (!x) return; if (x.status === 'downloading') toast('Downloading update v' + x.version + '…', 'ok'); else if (x.status === 'downloaded') toast('Update ready — restart to install.', 'ok', 6000); });
}

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
    hydrate(document); applySettings(); initStars(); bind(); bindElectron();
    autoGrow(); updateSendState();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => { });

    const cachedUser = store.get('user', null), cachedChats = store.get('chats', null);
    if (cachedUser && Array.isArray(cachedChats)) {
        // stale-while-revalidate: show what we had instantly
        S.user = cachedUser; S.chats = cachedChats; renderUser(); showShell(); renderList();
        const last = store.get(lastIdKey(), null);
        const lc = last && store.get('c.' + last, null);
        if (lc) { S.chat = lc; renderHeader(); renderThread(); restoreDraft(); }
    }
    try {
        const r = await api('/api/check-auth', { noAuthRedirect: true });
        await enterApp(r.user);
    } catch (e) {
        if (e.status === 401 || e.status === 403) { S.user = null; wipeUserData(); showGate(); }
        else if (!cachedUser) showGate('We couldn’t reach the Wizard.AI server. Check your connection, then try again.');
        else showBanner('Can’t reach the server right now — showing your saved chats.', true);
    }
    hideBoot();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
window.__wizard = { S, md, send, openChat };
})();
