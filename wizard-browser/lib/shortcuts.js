'use strict';
// Keyboard shortcuts. Matched in the main process on both the browser UI and every web page, because
// key presses inside a web page never reach the UI. Only combos with Ctrl/Alt/F-keys are claimed, so
// typing, and Ctrl+C / V / X / A / Z inside pages, are untouched.

function matchShortcut(input) {
    if (!input || input.type !== 'keyDown') return null;
    const k = String(input.key || '');
    const key = k.length === 1 ? k.toLowerCase() : k;
    const ctrl = !!(input.control || input.meta), shift = !!input.shift, alt = !!input.alt;

    if (ctrl && !alt) {
        if (!shift) {
            switch (key) {
                case 't': return 'new-tab';
                case 'w': return 'close-tab';
                case 'l': return 'focus-omnibox';
                case 'k': return 'palette';
                case ' ': return 'conjure';
                case 'r': return 'reload';
                case 'f': return 'find';
                case 'd': return 'bookmark';
                case 'h': return 'history';
                case 'j': return 'downloads';
                case 'p': return 'print';
                case ',': return 'settings';
                case 'Tab': return 'next-tab';
                case '=': case '+': return 'zoom-in';
                case '-': return 'zoom-out';
                case '0': return 'zoom-reset';
                case 'F5': return 'hard-reload';
                case '9': return 'tab-last';
                default:
                    if (/^[1-8]$/.test(key)) return 'tab-' + key;
                    return null;
            }
        }
        switch (key) {
            case 't': return 'reopen-tab';
            case 'n': return 'new-private-tab';
            case 'r': return 'hard-reload';
            case 'i': return 'devtools';
            case 'o': return 'bookmarks';
            case 'b': return 'bookmarks-bar';
            case 'f': return 'autofill';
            case 'Tab': return 'prev-tab';
            case '+': return 'zoom-in';
            default: return null;
        }
    }
    if (ctrl && alt && !shift && /^[1-9]$/.test(key)) return 'workspace-' + key;
    if (alt && !ctrl && !shift) {
        if (key === 'ArrowLeft') return 'back';
        if (key === 'ArrowRight') return 'forward';
        if (key === 'Home') return 'home';
    }
    if (!ctrl && !alt && !shift) {
        if (key === 'F5') return 'reload';
        if (key === 'F6') return 'focus-omnibox';
        if (key === 'F11') return 'fullscreen';
        if (key === 'F12') return 'devtools';
    }
    return null;
}

module.exports = { matchShortcut };
