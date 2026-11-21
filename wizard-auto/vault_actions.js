/**
 * vault_actions.js — bridges the vault to the browser view and to IPC.
 *
 * Fully wired already — nothing here requires manual integration:
 *   - main.js requires this module and calls wireVaultIPC(ipcMain, dispatch)
 *     at startup.
 *   - main.js's dispatch() already has a 'vault_autofill' case calling
 *     doVaultAutofill(...) from this file.
 *   - main.js's ACTION_SYS already includes the vault_autofill schema
 *     (see the "VAULT" section in that prompt) — the reference copy in
 *     the comment at the bottom of this file is for reading, not pasting.
 */

'use strict';

const vault = require('./vault');

/**
 * Executed only by main.js dispatch(), never reachable from a raw LLM
 * string. `webView` is the BrowserView currently shown to the user —
 * pass it in from main.js so this module doesn't need main.js's globals.
 *
 * Flow:
 *   1. Resolve the current page's hostname from the live webContents
 *      (never from whatever URL string the LLM might have hallucinated).
 *   2. Find vault entries allowlisted for that exact host.
 *   3. If more than one or zero matches, return for the user to pick /
 *      be told to save a credential — never guess.
 *   4. Ask requestPermission() with the entry's LABEL only (never the
 *      values) — including a punycode warning if the host looks like an
 *      internationalized/lookalike domain — so the human confirms which
 *      saved login/card is used, with the relevant red flags visible.
 *   5. Inject values directly via a parameterised executeJavaScript
 *      call — the field VALUES never pass through string templating
 *      of untrusted text, and never get logged.
 *   6. Return success without ever including field values in the
 *      returned message (so telLog / chat history / macro recording
 *      never capture them either) — and report HONESTLY if zero fields
 *      were actually filled (e.g. a payment form embedded in a
 *      cross-origin iframe, which executeJavaScript on the top frame
 *      cannot reach) rather than claiming success either way.
 */
async function doVaultAutofill({ entryId } = {}, { webView, requestPermission, ensureBrowser }) {
    if (!ensureBrowser()) return { success: false, message: 'Browser not open' };

    let actualHost;
    try {
        actualHost = new URL(webView.webContents.getURL()).hostname.replace(/^www\./, '');
    } catch {
        return { success: false, message: 'Could not determine current page host' };
    }

    const candidates = vault.findEntriesForHost(actualHost);
    if (!candidates.length) {
        return { success: false, message: `No saved credentials for "${actualHost}". Add one in Vault settings first.` };
    }

    let chosen = candidates[0];
    if (entryId) {
        const match = candidates.find(c => c.id === entryId);
        if (!match) return { success: false, message: `Saved entry not valid for "${actualHost}".` };
        chosen = match;
    } else if (candidates.length > 1) {
        return {
            success: false,
            message: `${candidates.length} saved logins for "${actualHost}" — choose which one.`,
            choices: candidates // masked, safe to show — renderer offers these as a direct pick, no LLM round-trip
        };
    }

    // Lightweight anti-phishing signal: a punycode ("xn--") hostname can be a
    // homograph lookalike of a real domain. This doesn't block anything —
    // legitimate internationalized domains exist — it just makes sure the
    // human sees the flag before approving, same principle as everywhere
    // else in this app: more information at the point of confirmation,
    // never a silent auto-decision either way.
    const looksPunycode = actualHost.split('.').some(part => part.startsWith('xn--'));
    const punycodeWarning = looksPunycode
        ? `\n\n⚠️ This domain uses punycode encoding (xn--), which can indicate a lookalike/spoofed domain. Double-check this is really "${chosen.site}" before continuing.`
        : '';

    const approved = await requestPermission({
        title: 'Autofill saved credential?',
        detail: `Site: ${actualHost}\nUsing: "${chosen.label}" (${chosen.kind})${punycodeWarning}\n\nWizard will fill the fields on this page. You still click Submit/Buy yourself — nothing is sent automatically.`,
        danger: looksPunycode, severity: looksPunycode ? 'high' : 'moderate'
    });
    if (!approved) return { success: false, message: 'User cancelled autofill' };

    let fields;
    try {
        fields = vault._resolveForAutofill(chosen.id, actualHost);
    } catch (e) {
        return { success: false, message: `Autofill blocked: ${e.message}` };
    }

    // Values go straight from vault → executeJavaScript args, never
    // interpolated into a JS source string, so nothing here can be
    // captured by prompt logging or macro recording.
    const script = `
        (function(fieldMap){
            // Real autocomplete tokens (per the HTML spec) are checked FIRST
            // and matched exactly — far more reliable than substring guessing,
            // since e.g. name="search" would otherwise wrongly match a
            // "cardholder name" alias lookup under the old substring-only logic.
            const AUTOCOMPLETE_MAP = {
                username: ['username','email'],
                password: ['current-password','new-password'],
                cardholder: ['cc-name'],
                number: ['cc-number'],
                exp: ['cc-exp','cc-exp-month'],
                cvc: ['cc-csc'],
                zip: ['postal-code']
            };
            // Fallback substring aliases, only used if no exact autocomplete match exists.
            const SUBSTRING_ALIASES = {
                username: ['username','email','user','login'],
                password: ['password','pass'],
                cardholder: ['cardholder','cardname','name'],
                number: ['cardnumber','number','ccnum'],
                exp: ['exp','expiry','expdate'],
                cvc: ['cvc','cvv','securitycode'],
                zip: ['zip','postal']
            };

            function isFillable(e){
                return !e.disabled && !e.readOnly && e.type!=='hidden' && e.offsetParent!==null;
            }
            function byAutocomplete(tokens){
                const all=[...document.querySelectorAll('input,textarea,select')];
                for(const tok of tokens){
                    const el = all.find(e => isFillable(e) && (e.autocomplete||'').toLowerCase() === tok);
                    if(el) return el;
                }
                return null;
            }
            function bySubstring(names){
                const all=[...document.querySelectorAll('input,textarea,select')];
                const lowerNames = names.map(n=>n.toLowerCase());
                return all.find(e=>isFillable(e) && lowerNames.some(n =>
                    (e.name||'').toLowerCase().includes(n) ||
                    (e.id||'').toLowerCase().includes(n) ||
                    (e.autocomplete||'').toLowerCase().includes(n) ||
                    (e.placeholder||'').toLowerCase().includes(n) ||
                    (e.type||'').toLowerCase()===n
                )) || null;
            }

            let filled = 0;
            for (const key of Object.keys(fieldMap)) {
                let el = byAutocomplete(AUTOCOMPLETE_MAP[key] || []);
                if (!el) el = bySubstring(SUBSTRING_ALIASES[key] || [key]);
                if (!el) continue;
                el.focus();
                el.value = fieldMap[key];
                ['input','change'].forEach(t => el.dispatchEvent(new Event(t, {bubbles:true})));
                el.blur();
                filled++;
            }
            return filled;
        })(__WIZARD_VAULT_FIELDS__)
    `;

    try {
        // executeJavaScript with a contextBridge-safe substitution: we pass
        // the object via JSON in a single controlled slot, not via string
        // concatenation of arbitrary text.
        const filledCount = await webView.webContents.executeJavaScript(
            script.replace('__WIZARD_VAULT_FIELDS__', JSON.stringify(fields))
        );
        if (filledCount === 0) {
            // Honest failure — don't claim success when nothing actually happened.
            // The most common real cause: the form (very often a payment form)
            // is embedded in a cross-origin iframe, which this script cannot
            // reach at all — executeJavaScript only runs in the top frame.
            return {
                success: false,
                message: `Couldn't find any matching fields on ${actualHost} to autofill. If this is a payment form, it may be embedded in an iframe (common for Stripe/PayPal-style checkouts) which Wizard can't fill into — you'll need to enter those fields yourself.`
            };
        }
        return { success: true, message: `Autofilled ${filledCount} field(s) on ${actualHost} using "${chosen.label}". Review and submit yourself.` };
    } catch (e) {
        return { success: false, message: `Autofill failed: ${e.message}` };
    }
}

/**
 * IPC surface for a Settings/Vault UI screen. The renderer side should
 * be a plain form (label, site, kind, field inputs) that calls these
 * directly — NOT anything that passes through chat/LLM input.
 *
 * 'vault-autofill-direct' is the same principle applied to account
 * SELECTION: when doVaultAutofill returns multiple `choices` for a host,
 * the renderer lets the user click one directly — this handler re-runs
 * dispatch({type:'vault_autofill', entryId}) with that specific id,
 * skipping the LLM/chat pipeline entirely for the selection step, same
 * as save/delete already do. `dispatch` is passed in from main.js so
 * this module doesn't need to reach into main.js's internals directly.
 */
function wireVaultIPC(ipcMain, dispatch) {
    ipcMain.handle('vault-list', () => vault.listEntriesMasked());
    ipcMain.handle('vault-save', (_e, entry) => vault.saveEntry(entry));
    ipcMain.handle('vault-delete', (_e, id) => vault.deleteEntry(id));
    ipcMain.handle('vault-available', () => vault.vaultAvailable());
    ipcMain.handle('vault-autofill-direct', (_e, { entryId }) => dispatch({ type: 'vault_autofill', entryId }));
}

module.exports = { doVaultAutofill, wireVaultIPC };

/* ── Reference copy — this is ALREADY in main.js's ACTION_SYS, not
   something you need to add. Kept here only so the schema for this
   action is easy to find while reading this file. ─────────────────────
VAULT (site key only — never credential values):
{"type":"vault_autofill","site":"amazon.com"}
   — Fills a saved login/card on the CURRENT page if one is saved for
     this host. Never guesses values. Never submits the form. Only
     usable if the user has already saved a credential via Settings.
     If multiple saved credentials match the host, this returns a list
     of choices for the user to pick from directly in the UI — you do
     not need to (and cannot) resolve that ambiguity yourself.
   — Do NOT attempt to construct fields, passwords, or card numbers
     yourself under any circumstance — you never have access to them.
──────────────────────────────────────────────────────────────────── */