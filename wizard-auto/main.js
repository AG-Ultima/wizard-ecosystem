/**
 * Wizard Autopilot — main.js (v3.3.0)
 *
 * v3.3 FIXES OVER v3.2:
 *   — THREE-TIER command parsing:
 *       1. Deterministic direct-action detection (make/create/write X → fs_write)
 *       2. Robust LLM parse: 3 retry strategies + balanced-brace JSON extraction
 *       3. Hard fallback that never gives up on a clear action request
 *   — ACTION_SYS prompt massively shortened for ministral-14b reliability
 *   — JSON extractor handles markdown fences, extra prose, mismatched braces
 *   — Better logging: raw LLM response surfaced on parse failure
 *   — Fast-path now RETURNS the action for clear "make X" commands (no LLM needed)
 *
 * Retained from v3.1/3.2:
 *   — No hardcoded usernames in prompts
 *   — App-data scratch dir
 *   — Downloads default for generated files
 *   — Real absolute paths in responses
 *   — Chat hallucination safety net
 *
 * Provider: Mistral ministral-14b-2512. Fallback: Wizard AI.
 * Hotkey: Ctrl+Shift+A (Win/Linux) | Cmd+Shift+A (Mac)
 */

'use strict';

const {
    app, BrowserWindow, BrowserView,
    ipcMain, shell, clipboard, Notification,
    globalShortcut, screen: eScreen, dialog, nativeTheme,
    Tray, Menu, nativeImage
} = require('electron');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const https = require('https');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const vaultLib = require('./vault');
const { doVaultAutofill, wireVaultIPC } = require('./vault_actions');
const accountLib = require('./account');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const TOP_H = 48;
const WIZ_BAR_H = 56;
const OV_W = 740;
const OV_MIN_H = 76;
const OV_MAX_H = 680;

const VERSION = '3.3.0';

let _appDataDir = null;
function APP_DATA_DIR() {
    if (_appDataDir) return _appDataDir;
    try {
        _appDataDir = app.getPath('userData');
    } catch {
        _appDataDir = path.join(os.homedir(), '.wizard');
    }
    try { fs.mkdirSync(_appDataDir, { recursive: true }); } catch { }
    return _appDataDir;
}

function MEM_FILE() { return path.join(APP_DATA_DIR(), 'memory.json'); }
function MACRO_DIR() { return path.join(APP_DATA_DIR(), 'macros'); }
function TELE_FILE() { return path.join(APP_DATA_DIR(), 'telemetry.jsonl'); }
function SCHEDULE_FILE() { return path.join(APP_DATA_DIR(), 'schedule.json'); }
function CLIP_FILE() { return path.join(APP_DATA_DIR(), 'clipboard_history.json'); }
function SCRATCH_DIR() { return path.join(APP_DATA_DIR(), 'scratch'); }

const PLUGIN_DIR = path.join(os.homedir(), 'WizardPlugins');
const AHK_TRIGGER = () => path.join(APP_DATA_DIR(), 'ahk_trigger');

// ─────────────────────────────────────────────────────────────────────────────
// LAZY DEPS
// ─────────────────────────────────────────────────────────────────────────────
let _nut = null, _docx = null, _pdfParse = null, _mammoth = null;

function getNut() {
    if (_nut !== null) return _nut;
    try {
        _nut = require('@nut-tree-fork/nut-js');
        _nut.mouse.config.mouseSpeed = 1500;
        _nut.keyboard.config.autoDelayMs = 0;
    } catch { _nut = false; }
    return _nut;
}
function getDocx() {
    if (_docx !== null) return _docx;
    try { _docx = require('docx'); } catch { _docx = false; }
    return _docx;
}
function getPdfParse() {
    if (_pdfParse !== null) return _pdfParse;
    try { _pdfParse = require('pdf-parse'); } catch { _pdfParse = false; }
    return _pdfParse;
}
function getMammoth() {
    if (_mammoth !== null) return _mammoth;
    try { _mammoth = require('mammoth'); } catch { _mammoth = false; }
    return _mammoth;
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW / TRAY HANDLES
// ─────────────────────────────────────────────────────────────────────────────
let mainWin = null;
let browserWin = null;
let webView = null;
let overlayWin = null;
let tray = null;
let bwListenersAttached = false;

const tabRegistry = new Map();
let activeTabId = null;
let tabIdCounter = 0;

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const MISTRAL_KEY = () => {
    const k = process.env.MISTRAL_KEY;
    if (!k) console.error('[Wizard] MISTRAL_KEY missing from .env — Mistral calls will fail.');
    return k || '';
};
const MISTRAL_HOST = 'api.mistral.ai';
const MISTRAL_PATH = '/v1/chat/completions';
// Three roles, matched to real per-model rate limits — one model for
// everything was wasting the fast tier's huge throughput on trivial calls
// (classification, casual chat) while risking overrunning the complex
// tier's much tighter limit (0.5 RPS) with routine traffic.
const MISTRAL_MODELS = {
    fast: 'ministral-3b-2512',      // 1.3M TPM / 12.5 RPS — classification, casual chat, extraction, short summaries
    complex: 'ministral-14b-2512',  // 937.5K TPM / 0.50 RPS — action parsing, agent loop, error diagnosis, file-search synthesis
    vision: 'ministral-8b-2512'     // 625K TPM / 3.13 RPS — anything with an image attached
};
function resolveModelForRole(role, hasVisionImage) {
    if (hasVisionImage) return MISTRAL_MODELS.vision; // vision forces the vision model regardless of requested role — never send an image to a non-vision model
    return MISTRAL_MODELS[role] || MISTRAL_MODELS.fast;
}

const WIZARD_KEY = () => {
    const k = process.env.WIZARD_API;
    if (!k) console.error('[Wizard] WIZARD_API missing from .env — Wizard AI fallback will fail.');
    return k || '';
};
const WIZARD_HOST = 'arnav0928.pythonanywhere.com';
const WIZARD_PATH = '/v1/chat/completions';
const WIZARD_MODEL = 'wizard-jarvis';

// ─────────────────────────────────────────────────────────────────────────────
// RATE GUARD
// ─────────────────────────────────────────────────────────────────────────────
function makeRateGuard(maxCalls = 500, windowMs = 60000) {
    return {
        windowMs, maxCalls, calls: [],
        isLimited() {
            const now = Date.now();
            this.calls = this.calls.filter(t => now - t < this.windowMs);
            return this.calls.length >= this.maxCalls;
        },
        record() { this.calls.push(Date.now()); }
    };
}
// Per-role guards matched to real limits (RPS * 60s, rounded down for headroom):
const mistralGuards = {
    fast: makeRateGuard(700, 60000),    // 12.5 RPS
    complex: makeRateGuard(28, 60000),  // 0.50 RPS — the tight one
    vision: makeRateGuard(180, 60000)   // 3.13 RPS
};
const wizardGuard = makeRateGuard(200);

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT MEMORY
// ─────────────────────────────────────────────────────────────────────────────
let mem = {
    summaries: [], facts: [], goals: [], sessionCount: 0, preferences: {}, telemetryOptIn: false,
    proactivityLevel: 'off', // 'off' | 'basic' | 'advanced' | 'max' — one dial, mutually exclusive
    lastProactiveAt: 0,
    advancedLog: [], maxLog: [],
    onboardingCompleted: false,
    projects: [], activeProjectId: null
};

function loadMem() {
    try { if (fs.existsSync(MEM_FILE())) mem = { ...mem, ...JSON.parse(fs.readFileSync(MEM_FILE(), 'utf8')) }; } catch { }
    // Migrate from the old three-independent-boolean proactivity system to
    // one mutually-exclusive dial. Highest previously-enabled tier wins,
    // since running two engines at once was the actual problem being fixed.
    if ('proactiveEnabled' in mem || 'advancedProactiveEnabled' in mem || 'maxProactiveEnabled' in mem) {
        if (!mem.proactivityLevel || mem.proactivityLevel === 'off') {
            mem.proactivityLevel = mem.maxProactiveEnabled ? 'max'
                : mem.advancedProactiveEnabled ? 'advanced'
                    : mem.proactiveEnabled ? 'basic' : 'off';
        }
        delete mem.proactiveEnabled; delete mem.advancedProactiveEnabled; delete mem.maxProactiveEnabled;
        saveMem();
    }
    // Migrate goals from plain strings (older format) to {id,text,status,createdAt}
    // objects — status is always user-set, never fabricated/inferred, so
    // anything migrated defaults to 'in_progress' rather than guessing.
    if (Array.isArray(mem.goals) && mem.goals.some(g => typeof g === 'string')) {
        mem.goals = mem.goals.map(g => typeof g === 'string'
            ? { id: crypto.randomUUID(), text: g, status: 'in_progress', createdAt: Date.now() }
            : g);
        saveMem();
    }
}
function saveMem() {
    try { fs.writeFileSync(MEM_FILE(), JSON.stringify(mem, null, 2), 'utf8'); } catch { }
}

// ── Memory CRUD (backs the Memory UI — every read/write here is what the
//    user sees and can edit/delete directly; nothing is hidden from them) ──
function memGetAll() {
    return {
        facts: mem.facts,
        goals: mem.goals || [],
        preferences: mem.preferences,
        summaries: mem.summaries,
        telemetryOptIn: !!mem.telemetryOptIn,
        proactivityLevel: mem.proactivityLevel || 'off',
        advancedLog: mem.advancedLog || [],
        maxLog: mem.maxLog || [],
        onboardingCompleted: !!mem.onboardingCompleted,
        projects: memGetProjects(),
        activeProjectId: mem.activeProjectId || null,
        sessionCount: mem.sessionCount
    };
}
function memAddGoal(text) {
    const t = (text || '').trim();
    if (!t) return FAIL('Empty goal');
    mem.goals = mem.goals || [];
    if (!mem.goals.some(g => g.text === t)) {
        mem.goals.push({ id: crypto.randomUUID(), text: t, status: 'in_progress', createdAt: Date.now(), projectId: mem.activeProjectId || null });
        saveMem();
    }
    return OK('Goal saved');
}
function memEditGoal(index, text) {
    mem.goals = mem.goals || [];
    if (index < 0 || index >= mem.goals.length) return FAIL('Invalid index');
    const t = (text || '').trim();
    if (!t) return memDeleteGoal(index);
    mem.goals[index].text = t; saveMem();
    return OK('Goal updated');
}
function memDeleteGoal(index) {
    mem.goals = mem.goals || [];
    if (index < 0 || index >= mem.goals.length) return FAIL('Invalid index');
    mem.goals.splice(index, 1); saveMem();
    return OK('Goal deleted');
}
/** Status is ALWAYS set by the user clicking a pill in the UI — never
 * inferred or guessed by the model. This is a deliberate honesty
 * constraint: a fabricated "72% done" progress bar with no real subtask
 * data behind it would look precise while meaning nothing. */
function memSetGoalStatus(index, status) {
    mem.goals = mem.goals || [];
    if (index < 0 || index >= mem.goals.length) return FAIL('Invalid index');
    if (!['todo', 'in_progress', 'done'].includes(status)) return FAIL('Invalid status');
    mem.goals[index].status = status; saveMem();
    return OK('Status updated');
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
//   Ties together everything that was previously scattered across flat
//   lists — goals, scheduled tasks, generated files — into named units.
//   At most one project is "active" at a time (mem.activeProjectId). While
//   a project is active:
//     - New goals get tagged with its id (memAddGoal, above)
//     - New scheduled tasks created via chat get tagged with its id
//     - Files written via fs_write/genFile get logged into its files list
//     - worldCtx() surfaces it prominently so the model's context
//       naturally narrows to what you're currently working on, without
//       you having to repeat yourself every message
//   This is purely organizational — no new action type, no new capability,
//   no new confirmation-bypass. It just labels and groups things that
//   already existed.
// ─────────────────────────────────────────────────────────────────────────────
function memGetProjects() {
    return (mem.projects || []).map(p => ({
        ...p,
        goalCount: (mem.goals || []).filter(g => g.projectId === p.id).length,
        taskCount: (scheduledTasks || []).filter(t => t.projectId === p.id).length,
        fileCount: (p.files || []).length
    }));
}
function memCreateProject({ name, description } = {}) {
    const n = (name || '').trim();
    if (!n) return FAIL('Project name is required');
    const project = {
        id: crypto.randomUUID(),
        name: n.slice(0, 80),
        description: (description || '').trim().slice(0, 400),
        status: 'active',
        createdAt: Date.now(),
        files: []
    };
    mem.projects = mem.projects || [];
    mem.projects.push(project);
    saveMem();
    return { success: true, message: `Project "${project.name}" created`, project };
}
function memSetActiveProject(id) {
    if (id !== null && !(mem.projects || []).some(p => p.id === id)) return FAIL('Project not found');
    mem.activeProjectId = id;
    saveMem();
    const p = id ? mem.projects.find(x => x.id === id) : null;
    return OK(p ? `Switched to project "${p.name}"` : 'No active project — working unscoped');
}
function memArchiveProject(id, archived) {
    const p = (mem.projects || []).find(x => x.id === id);
    if (!p) return FAIL('Project not found');
    p.status = archived ? 'archived' : 'active';
    if (archived && mem.activeProjectId === id) mem.activeProjectId = null;
    saveMem();
    return OK(archived ? 'Project archived' : 'Project reactivated');
}
function memDeleteProject(id) {
    mem.projects = (mem.projects || []).filter(p => p.id !== id);
    if (mem.activeProjectId === id) mem.activeProjectId = null;
    // Un-tag anything that belonged to it rather than deleting the goals/tasks themselves —
    // deleting a project should never silently delete your actual goals or scheduled tasks.
    (mem.goals || []).forEach(g => { if (g.projectId === id) g.projectId = null; });
    (scheduledTasks || []).forEach(t => { if (t.projectId === id) t.projectId = null; });
    saveMem();
    saveSchedule();
    return OK('Project deleted — its goals and scheduled tasks were kept, just unassigned');
}
function memRenameProject(id, name, description) {
    const p = (mem.projects || []).find(x => x.id === id);
    if (!p) return FAIL('Project not found');
    if (name !== undefined) p.name = (name || '').trim().slice(0, 80) || p.name;
    if (description !== undefined) p.description = (description || '').trim().slice(0, 400);
    saveMem();
    return OK('Project updated');
}
/** Called after a successful fs_write/genFile while a project is active. */
function memLogProjectFile(name, filePath) {
    if (!mem.activeProjectId) return;
    const p = (mem.projects || []).find(x => x.id === mem.activeProjectId);
    if (!p) return;
    p.files = p.files || [];
    p.files.unshift({ name, path: filePath, createdAt: Date.now() });
    p.files = p.files.slice(0, 100);
    saveMem();
}
function getActiveProject() {
    if (!mem.activeProjectId) return null;
    return (mem.projects || []).find(p => p.id === mem.activeProjectId) || null;
}

/** project_switch dispatch handler — resolves a name (from the LLM, which
 * never sees project ids) to an actual project, or clears the active
 * project if name is empty/null. Never creates a project on a miss. */
function projectSwitchByName({ name } = {}) {
    if (!name || !name.trim()) return memSetActiveProject(null);
    const lower = name.trim().toLowerCase();
    const match = (mem.projects || []).find(p => p.name.toLowerCase() === lower)
        || (mem.projects || []).find(p => p.name.toLowerCase().includes(lower));
    if (!match) return FAIL(`No project matching "${name}" — check Projects in the sidebar, or create it first.`);
    return memSetActiveProject(match.id);
}

function memAddFact(text) {
    const t = (text || '').trim();
    if (!t) return FAIL('Empty fact');
    if (!mem.facts.includes(t)) { mem.facts.push(t); saveMem(); }
    return OK('Fact saved');
}
function memEditFact(index, text) {
    if (index < 0 || index >= mem.facts.length) return FAIL('Invalid index');
    const t = (text || '').trim();
    if (!t) return memDeleteFact(index);
    mem.facts[index] = t; saveMem();
    return OK('Fact updated');
}
function memDeleteFact(index) {
    if (index < 0 || index >= mem.facts.length) return FAIL('Invalid index');
    mem.facts.splice(index, 1); saveMem();
    return OK('Fact deleted');
}
function memSetPreference(key, value) {
    if (!key) return FAIL('No key');
    mem.preferences[key] = value; saveMem();
    return OK('Preference saved');
}
function memDeletePreference(key) {
    if (!(key in mem.preferences)) return FAIL('Not found');
    delete mem.preferences[key]; saveMem();
    return OK('Preference deleted');
}
function memDeleteSummary(index) {
    if (index < 0 || index >= mem.summaries.length) return FAIL('Invalid index');
    mem.summaries.splice(index, 1); saveMem();
    return OK('Summary deleted');
}
function memClearAll() {
    mem = {
        summaries: [], facts: [], goals: [], sessionCount: 0, preferences: {},
        telemetryOptIn: mem.telemetryOptIn,
        proactivityLevel: mem.proactivityLevel, lastProactiveAt: 0,
        advancedLog: [], maxLog: [],
        onboardingCompleted: mem.onboardingCompleted,
        projects: (mem.projects || []).map(p => ({ ...p, files: [] })), // projects survive, but their goal counts naturally reset with the cleared goals array; file history clears too since it's tied to generated content
        activeProjectId: mem.activeProjectId
    };
    saveMem();
    return OK('All memory cleared');
}
const PROACTIVITY_LEVEL_LABELS = { off: 'Proactivity turned off', basic: 'Check-in proactivity enabled', advanced: 'Advanced Proactivity enabled', max: 'Max Proactivity enabled' };
function memSetProactivityLevel(level) {
    if (!['off', 'basic', 'advanced', 'max'].includes(level)) return FAIL('Invalid proactivity level');
    mem.proactivityLevel = level; saveMem();
    return OK(PROACTIVITY_LEVEL_LABELS[level]);
}
function memSetOnboardingCompleted(completed) {
    mem.onboardingCompleted = !!completed; saveMem();
    return OK('Onboarding state updated');
}
function memDeleteMaxLogEntry(index) {
    if (!mem.maxLog || index < 0 || index >= mem.maxLog.length) return FAIL('Invalid index');
    mem.maxLog.splice(index, 1); saveMem();
    return OK('Log entry deleted');
}
function memClearMaxLog() {
    mem.maxLog = []; saveMem();
    return OK('Max Proactivity log cleared');
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO FACT EXTRACTION
//   Runs on every user turn (chat or command) so mem.facts actually fills up
//   from conversation, not just from someone manually typing into the
//   Memory modal. Fire-and-forget from executeCommand — never blocks or
//   delays the real response.
//   - A cheap regex prefilter avoids firing an LLM call on every message;
//     only messages that look like they might state something personal
//     ("I'm 34", "I work as...", "my favorite...") reach the model at all.
//   - The model only extracts what was explicitly stated — instructed not
//     to infer or guess — and a null/failed result silently does nothing.
//   - Whatever it stores lands in the exact same mem.facts array the
//     Memory UI already reads/edits/deletes from, so anything extracted
//     this way is just as visible and removable as a manually-typed fact.
// ─────────────────────────────────────────────────────────────────────────────
async function tryAutoExtractFact(input) {
    if (!input || input.length > 600) return; // long pastes/commands aren't personal statements

    const r = await llmCall({
        role: 'fast',
        sys: `Decide if this message states a durable fact about the user themselves worth remembering long-term — age, name, job, location, a preference, a relationship, etc. — OR a goal/deadline/thing they want to do or achieve (e.g. "wants to learn Spanish", "has a math test next week", "training for a 10k"). Extract it concisely, third person. Only extract something explicitly stated — never infer, guess, or add detail beyond what's said. If nothing durable is stated, or the message is just a command/question with no personal detail, return null for both. Return ONLY JSON: {"fact": "..." or null, "isGoal": true or false}`,
        user: input,
        maxTokens: 60, temp: 0, json: true, timeout: 8000
    });
    if (!r.ok) return;
    const parsed = extractJSON(r.text);
    if (parsed && typeof parsed.fact === 'string' && parsed.fact.trim()) {
        if (parsed.isGoal) memAddGoal(parsed.fact.trim());
        else memAddFact(parsed.fact.trim());
    }
}
function memDeleteAdvancedLogEntry(index) {
    if (!mem.advancedLog || index < 0 || index >= mem.advancedLog.length) return FAIL('Invalid index');
    mem.advancedLog.splice(index, 1); saveMem();
    return OK('Log entry deleted');
}
function memClearAdvancedLog() {
    mem.advancedLog = []; saveMem();
    return OK('Advanced Proactivity log cleared');
}
function memCtx() {
    const parts = [];
    const activeGoals = (mem.goals || []).filter(g => g.status !== 'done');
    const activeProj = getActiveProject();
    if (activeProj) {
        const projGoals = activeGoals.filter(g => g.projectId === activeProj.id);
        const otherGoals = activeGoals.filter(g => g.projectId !== activeProj.id);
        if (projGoals.length) parts.push(`Goals for the active project "${activeProj.name}" (weight these highest — directly relevant to what the user is currently working on): ` + projGoals.slice(0, 10).map(g => `${g.text}${g.status === 'todo' ? ' [not started yet]' : ''}`).join('; '));
        if (otherGoals.length) parts.push('Other user goals (unrelated to the active project, still real): ' + otherGoals.slice(0, 5).map(g => g.text).join('; '));
    } else if (activeGoals.length) {
        parts.push('User goals (weight these highly — the user explicitly stated these as things they want to do/achieve): ' + activeGoals.slice(0, 10).map(g => `${g.text}${g.status === 'todo' ? ' [not started yet]' : ''}`).join('; '));
    }
    if (mem.facts.length) parts.push('User facts: ' + mem.facts.slice(0, 10).join('; '));
    if (Object.keys(mem.preferences).length) parts.push('User preferences: ' + JSON.stringify(mem.preferences));
    if (mem.summaries.length) parts.push('Past sessions:\n' + mem.summaries.slice(0, 3).join('\n'));
    return parts.join('\n');
}
async function summariseSession(hist) {
    if (hist.length < 4) return;
    const r = await llmCall({
        role: 'fast',
        sys: 'Extract a 1-2 sentence summary of key user preferences, recurring tasks, or important facts. Be specific and brief.',
        user: hist.slice(-16).map(h => `${h.role}: ${h.content.slice(0, 120)}`).join('\n'),
        maxTokens: 120, temp: 0.3, timeout: 10000
    });
    if (r.ok) {
        mem.summaries.unshift(r.text.trim());
        mem.summaries = mem.summaries.slice(0, 10);
        mem.sessionCount++;
        saveMem();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROACTIVITY ENGINE
//   - Runs ONLY on a local interval timer. Never triggered by, or reachable
//     from, any network event.
//   - Runs ONLY if the user explicitly turned it on in the Memory UI
//     (mem.proactiveEnabled). Default is OFF.
//   - Only ever draws on what's already in mem.facts/mem.summaries/
//     mem.preferences — i.e. things the user told Wizard directly. It does
//     not browse, does not check email/calendar/etc, does not act on
//     anything — it can only SURFACE A SUGGESTION as a chat message. The
//     user reads it like any other message and decides whether to act.
//   - Rate-limited to at most once per PROACTIVE_MIN_GAP_MS so it can't spam.
// ─────────────────────────────────────────────────────────────────────────────
const PROACTIVE_MIN_GAP_MS = 45 * 60 * 1000; // at most once every 45 min — basic engine only, unchanged
let proactiveTimer = null;
let advancedProactiveTimer = null;
let maxProactiveTimer = null;

function startProactiveEngine() {
    if (!proactiveTimer) {
        proactiveTimer = setInterval(() => { tryProactiveCheckin().catch(() => { }); }, 5 * 60 * 1000);
    }
    if (!advancedProactiveTimer) {
        // Faster tick than the basic engine — with no hardcoded frequency cap
        // left in tryAdvancedProactiveCheckin, the model itself decides on
        // every check whether to speak; this just controls how often it
        // gets asked, which is a mechanical necessity, not a decision-limit.
        advancedProactiveTimer = setInterval(() => { tryAdvancedProactiveCheckin().catch(() => { }); }, 2 * 60 * 1000);
    }
    if (!maxProactiveTimer) {
        maxProactiveTimer = setInterval(() => { tryMaxProactiveCheckin().catch(() => { }); }, 2 * 60 * 1000);
    }
}
function stopProactiveEngine() {
    if (proactiveTimer) { clearInterval(proactiveTimer); proactiveTimer = null; }
    if (advancedProactiveTimer) { clearInterval(advancedProactiveTimer); advancedProactiveTimer = null; }
    if (maxProactiveTimer) { clearInterval(maxProactiveTimer); maxProactiveTimer = null; }
}

async function tryProactiveCheckin() {
    if (mem.proactivityLevel !== 'basic') return;
    if (!mem.facts.length && !mem.summaries.length) return; // nothing to draw on
    const now = Date.now();
    if (now - (mem.lastProactiveAt || 0) < PROACTIVE_MIN_GAP_MS) return;
    // Only surface something if a window is actually open to receive it —
    // never wake the machine or act while the user isn't present.
    const target = (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) ? mainWin
        : (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) ? overlayWin : null;
    if (!target) return;

    const ctx = memCtx();
    if (!ctx) return;

    const r = await llmCall({
        role: 'fast',
        sys: `You generate a single short, low-key check-in message for a user, based ONLY on facts/preferences/summaries they previously told an assistant. Rules:
- Reference only what's in the provided context — never invent tasks, dates, or facts not present.
- One or two sentences max.
- Frame it as a gentle nudge or question, not a demand.
- If nothing in the context is worth surfacing right now, respond with exactly: SKIP
- Never mention that you are an AI generating this on a timer.`,
        user: `Stored context:\n${ctx}\n\nWrite the check-in, or SKIP.`,
        maxTokens: 100, temp: 0.6, timeout: 15000
    });

    if (!r.ok) return;
    const text = r.text.trim();
    if (!text || /^skip\.?$/i.test(text)) return;

    mem.lastProactiveAt = now;
    saveMem();
    target.webContents.send('proactive-message', { message: text });
    pushHistToWindow(target, 'assistant', text);
    telLog('proactive_checkin', {});
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED PROACTIVITY ENGINE
//   A stronger, opt-in-with-warning mode. Differences from the basic engine
//   above: it can fire at unpredictable intervals ("at will") rather than a
//   fixed cadence, and — unlike the basic engine, which can only ever send a
//   text message — it may take ONE action before composing its message.
//
//   That action capability is intentionally boxed in, not just by prompt
//   instructions (which an LLM can get wrong) but structurally in code:
//     - The model may only request 'write_file' or 'set_reminder'. Any
//       other action type it returns is silently ignored — there is no
//       code path from this function into dispatch(), shell_exec,
//       fs_delete, fs_move, vault_autofill, browser_*, or run_script.
//     - 'write_file' NEVER uses a path the model supplies. Output always
//       lands in a dedicated ADV_PROACTIVE_DIR, with a timestamped
//       filename WE generate — so it can never overwrite an existing
//       user file, escape the sandbox folder, or collide with anything.
//     - Still draws only on mem.facts/mem.summaries/mem.goals — never
//       browses, never reads arbitrary disk files, never touches network
//       state, never reads the clipboard (clipboard routinely holds
//       passwords/OTP codes — that stays out categorically, not just by
//       default).
//     - NO hardcoded daily cap, minimum gap, or random-chance gate — by
//       explicit design, the model itself is the only thing deciding
//       whether now is a good moment to say something. The code checks in
//       with the model on a fixed poll interval (a mechanical necessity —
//       something has to trigger the check), but every actual decision
//       to speak or stay silent is the model's, not a timer's.
//     - Every firing is appended to mem.advancedLog (visible + deletable
//       in the Memory UI) so nothing it does is invisible to the user
//       after the fact, even though — by design — nothing was confirmed
//       before the fact.
// ─────────────────────────────────────────────────────────────────────────────
const ADV_ALLOWED_EXT = new Set(['docx', 'md', 'txt', 'pdf']);

function ADV_PROACTIVE_DIR() { return path.join(os.homedir(), 'Downloads', 'Wizard Proactive Files'); }

async function tryAdvancedProactiveCheckin() {
    if (mem.proactivityLevel !== 'advanced') return;
    if (!mem.facts.length && !mem.summaries.length && !(mem.goals && mem.goals.length)) return;

    const target = (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) ? mainWin
        : (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) ? overlayWin : null;
    if (!target) return;

    // worldCtx() includes memCtx() (goals/facts/preferences/summaries) PLUS
    // time of day, open browser tabs, recent conversation, OS/app state —
    // this used to be memCtx() alone, which is why this engine skewed
    // toward only ever talking about goals: goals were nearly the only
    // thing it actually had to look at. Broader context = broader range of
    // things it can genuinely notice, not just a goal-nagging machine.
    const ctx = worldCtx();
    if (!ctx) return;

    const recentLog = (mem.advancedLog || []).slice(0, 5).map(l => `- ${l.message}`).join('\n');

    const r = await llmCall({
        role: 'fast',
        sys: `You are Wizard's advanced proactivity engine. YOU decide entirely — there is no timer, cap, or probability gate above you deciding this for you. You are checked in with periodically, and each time, you independently decide whether something proactive would genuinely help the user right now.

Your context below covers MORE than just goals — facts, preferences, session summaries, open browser tabs, time of day, recent conversation. Goals deserve real weight since the user explicitly stated them as things they want to achieve, but they are not the only thing worth commenting on: a fact, a preference, something from recent conversation, or the current time/context can all be a genuine, grounded reason to speak up. Don't default to goal-reminders as your only move.

You may optionally take ONE action before sending your message. Available actions:
- write_file: create a small helpful file (e.g. a study guide, checklist, or reference doc) related to something the user told the assistant about. Format: {"type":"write_file","ext":"docx|md|txt","filename":"short-kebab-name","topic":"what the file should contain, in detail"}
- set_reminder: remind the user of something later. Format: {"type":"set_reminder","message":"...","minutes":N}
- (or no action at all — just a message)

These are illustrative only, not a script to follow. Use your judgment for what's actually useful given THIS user's actual context; do not treat any specific scenario as a template to repeat.

Because nothing else is gating your frequency, use real judgment about restraint: firing constantly with nothing genuinely new to say would be worse than useful, even though nothing technically stops you. The bar is "this is genuinely worth interrupting them for," not "I technically have something to say."

HALLUCINATION IS THE MOST IMPORTANT FAILURE MODE TO AVOID HERE — more so than in a normal chat reply, because the user did not ask a question that grounds your answer; you are the one deciding to speak, so everything you say must be traceable to something actually present in the context below. Before writing your message, identify the SPECIFIC line in the context that justifies it. If you cannot point to one, the correct output is {"message":null,"action":null} — do not soften this into a vague-but-plausible-sounding message instead; vague-but-plausible IS the hallucination failure mode.

STRICT RULES:
- NEVER invent a task, deadline, goal, fact, or detail not present verbatim (or very close to it) in the context below. Do not add specifics — numbers, dates, names — that aren't actually there.
- NEVER repeat a suggestion that resembles one of your recent past messages (shown below) — vary what you surface.
- If nothing in the context genuinely warrants proactive action right now, respond with EXACTLY: {"message":null,"action":null} — and do this often; silence is a valid and expected outcome most of the time, more often than not.
- Message must be 1-3 sentences, low-key, never demanding.
- Never mention that you are an AI, a background process, or that you're running on a timer.
- Return ONLY valid JSON: {"message": "..." or null, "action": {...} or null}`,
        user: `Context:\n${ctx}\n\nYour own recent proactive messages (avoid repeating these):\n${recentLog || '(none yet)'}\n\nDecide, and respond with the JSON.`,
        maxTokens: 300, temp: 0.4, json: true, timeout: 20000
    });

    if (!r.ok) return;
    const parsed = extractJSON(r.text);
    if (!parsed || !parsed.message) return; // model chose to skip, or failed to parse — either way, do nothing

    let actionResult = null;
    const action = parsed.action;

    if (action && action.type === 'write_file' && ADV_ALLOWED_EXT.has(action.ext)) {
        try {
            const dir = ADV_PROACTIVE_DIR();
            await fsp.mkdir(dir, { recursive: true });
            const safeName = safeFilename(action.filename || action.topic || 'wizard-note');
            // Timestamped filename we generate ourselves — never the model's path,
            // never able to collide with or overwrite an existing file.
            const filename = `${safeName}-${Date.now()}.${action.ext}`;
            const targetPath = path.join(dir, filename);
            actionResult = await genFile({ topic: action.topic || parsed.message, ext: action.ext, filename, targetPath });
        } catch (e) {
            actionResult = FAIL(`Advanced proactivity file creation failed: ${e.message}`);
        }
    } else if (action && action.type === 'set_reminder' && action.message) {
        const mins = Math.max(1, Math.min(1440, Number(action.minutes) || 30));
        actionResult = await doReminder({ message: action.message, ms: mins * 60000 });
    }
    // Any other action.type (or malformed action) is silently dropped —
    // there is deliberately no fallback path into dispatch() here.

    mem.advancedLog = mem.advancedLog || [];
    mem.advancedLog.unshift({
        ts: Date.now(),
        message: parsed.message,
        actionType: action?.type || null,
        actionResult: actionResult ? actionResult.message : null
    });
    mem.advancedLog = mem.advancedLog.slice(0, 30);
    saveMem();

    target.webContents.send('proactive-message', {
        message: parsed.message,
        advanced: true,
        result: actionResult
    });
    pushHistToWindow(target, 'assistant', parsed.message);
    telLog('advanced_proactive', { hadAction: !!action });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAX PROACTIVITY
//   The broadest-capability proactivity tier. Unlike Advanced Proactivity
//   above (hard-capped to write_file/set_reminder only), Max Proactivity
//   gets the FULL dispatch() action vocabulary — EXCEPT a hard denylist
//   enforced in code, not just by instruction:
//
//     - shell_exec, run_script     — arbitrary code execution, never
//                                    autonomous, no permission escape valve.
//     - browser_click, browser_click_nth, browser_type, browser_type_into,
//       browser_js                — there is no discrete "buy"/"submit"
//                                    action anywhere in this app; a
//                                    purchase or form submission can only
//                                    ever happen through one of these. This
//                                    is the actual mechanism by which "never
//                                    let it buy anything" is enforced —
//                                    blocking the only tools capable of
//                                    completing a purchase, since there's
//                                    no way to tell "click a normal link"
//                                    apart from "click Place Order" at the
//                                    code level.
//     - vault_autofill             — filling saved credentials without an
//                                    explicit request is a bigger privacy
//                                    step than anything else on the allowed
//                                    list; excluded as a deliberate,
//                                    separate judgment call.
//     - macro_replay               — a saved macro can itself contain ANY
//                                    of the above blocked steps, so
//                                    allowing this would be a loophole
//                                    around the entire denylist.
//
//   Everything else — including fs_delete, fs_move, fs_copy, fs_write
//   overwrite, create_project, schedule_task — stays reachable, but goes
//   through the EXACT SAME requestPermission() modal as a normal command.
//   That modal already brings the main window to the front regardless of
//   what app the user is currently in, so a permission prompt from this
//   engine surfaces the same way it always has — this tier doesn't change
//   how confirmation works, it just changes how much of the action
//   vocabulary can be PROPOSED in the first place.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_PROACTIVITY_DENYLIST = new Set([
    'shell_exec', 'run_script',
    'browser_click', 'browser_click_nth', 'browser_type', 'browser_type_into', 'browser_js',
    'vault_autofill', 'macro_replay'
]);

async function tryMaxProactiveCheckin() {
    if (mem.proactivityLevel !== 'max') return;

    const target = (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) ? mainWin
        : (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) ? overlayWin : null;
    if (!target) return;

    const ctx = worldCtx();
    if (!ctx) return;

    const recentLog = (mem.maxLog || []).slice(0, 5).map(l => `- [${l.actionType || 'message'}] ${l.message}`).join('\n');

    const r = await llmCall({
        role: 'complex',
        sys: ACTION_SYS + `\n\nYou are Wizard's MAX proactivity engine — the broadest-capability proactive tier. Like Advanced Proactivity, YOU decide entirely whether and when to act; there is no timer or cap above your own judgment. Unlike Advanced Proactivity, you may propose ONE action from the FULL vocabulary above (not just write_file/set_reminder) if it would genuinely help — creating projects, organizing/moving/deleting files, reading/searching files, checking system info, opening (not interacting with) a browser page, scheduling a task, and so on.

The following action types are NEVER available to you, full stop, regardless of how helpful they'd seem: shell_exec, run_script, browser_click, browser_click_nth, browser_type, browser_type_into, browser_js, vault_autofill, macro_replay. Do not propose them — they will be rejected unconditionally if you do.

Anything you DO propose that would normally ask the user's permission (deleting, overwriting, moving files, creating a project, etc.) STILL asks permission exactly as normal — you are not bypassing confirmation, you're only deciding what to PROPOSE. The user will see a themed confirmation prompt before anything actually happens.

HALLUCINATION IS THE MOST IMPORTANT FAILURE MODE — you are speaking/acting unprompted, so everything must be traceable to something actually present in the context, never invented. If you cannot point to a specific real reason in the context, output null for both message and action; this should be the common case, not the exception.

STRICT RULES:
- NEVER invent a task, deadline, goal, fact, or file that isn't actually present in the context.
- NEVER repeat a suggestion resembling one of your recent actions/messages (shown below).
- Respond ONLY with: {"message": "..." or null, "action": {...single action from the vocabulary above, or null}}
- If nothing genuinely warrants action right now, respond with EXACTLY {"message":null,"action":null} — expect this to be the outcome most of the time.
- Message must be 1-3 sentences, low-key, never demanding, never mentioning you're an AI/background process/timer.`,
        user: `Context:\n${ctx}\n\nYour own recent actions/messages (avoid repeating these):\n${recentLog || '(none yet)'}\n\nDecide, and respond with the JSON.`,
        maxTokens: 500, temp: 0.35, json: true, timeout: 25000
    });

    if (!r.ok) return;
    const parsed = extractJSON(r.text);
    if (!parsed || !parsed.message) return;

    let actionResult = null;
    const action = parsed.action;

    if (action && action.type) {
        if (MAX_PROACTIVITY_DENYLIST.has(action.type)) {
            // Structural block — logged, but never executed, regardless of
            // what the model proposed or how it justified it.
            actionResult = FAIL(`Blocked: "${action.type}" is not available to Max Proactivity.`);
        } else {
            actionResult = await dispatch(action); // full dispatch — permission gates fire exactly as normal for anything that needs one
        }
    }

    mem.maxLog = mem.maxLog || [];
    mem.maxLog.unshift({
        ts: Date.now(),
        message: parsed.message,
        actionType: action?.type || null,
        actionResult: actionResult ? actionResult.message : null
    });
    mem.maxLog = mem.maxLog.slice(0, 30);
    saveMem();

    target.webContents.send('proactive-message', {
        message: parsed.message,
        tier: 'max',
        result: actionResult
    });
    pushHistToWindow(target, 'assistant', parsed.message);
    telLog('max_proactive', { hadAction: !!action, actionType: action?.type || null });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED TASKS
//   User-authored, calendar-style recurring/one-off tasks — different trust
//   model from Advanced Proactivity above: the USER decided what happens and
//   when, not the model improvising. That earns it a slightly bigger action
//   set, but the same hard line still applies: scheduled tasks can inform,
//   remind, and generate content — they can NEVER click/submit/buy, delete,
//   move, run shell/scripts, or touch the vault/browser interactively.
//   Recurring + unattended + destructive stays off the table even for
//   something the user explicitly set up, because "I set this up three
//   weeks ago and forgot" is a real failure mode for anything with a
//   bigger blast radius than a reminder or a generated file.
//
//   Fires via OS notification (works even if no window is open/visible —
//   unlike Advanced Proactivity, which requires a visible window) AND
//   appends a chat message to whichever window(s) exist, so it's visible
//   next time you open the app even if you missed the notification.
// ─────────────────────────────────────────────────────────────────────────────
let scheduledTasks = [];
const SCHED_ALLOWED_EXT = ADV_ALLOWED_EXT; // reuse the same safe-file-extension allowlist
const SCHED_MIN_INTERVAL_MIN = 5;           // floor, so an interval task can't be set to hammer every few seconds
const SCHED_MAX_INTERVAL_MIN = 10080;       // 1 week ceiling

function loadSchedule() {
    try { if (fs.existsSync(SCHEDULE_FILE())) scheduledTasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE(), 'utf8')); }
    catch { scheduledTasks = []; }
}
function saveSchedule() {
    try { fs.writeFileSync(SCHEDULE_FILE(), JSON.stringify(scheduledTasks, null, 2), 'utf8'); } catch { }
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** Computes the next epoch-ms run time for a recurrence, given "now". */
function computeNextRun(recurrence, fromMs = Date.now()) {
    const from = new Date(fromMs);
    if (recurrence.kind === 'once') {
        const dt = new Date(`${recurrence.date}T${recurrence.time}:00`);
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }
    if (recurrence.kind === 'interval') {
        const mins = Math.max(SCHED_MIN_INTERVAL_MIN, Math.min(SCHED_MAX_INTERVAL_MIN, Number(recurrence.intervalMinutes) || 60));
        return fromMs + mins * 60000;
    }
    if (recurrence.kind === 'daily') {
        const [h, m] = (recurrence.time || '09:00').split(':').map(Number);
        const next = new Date(from);
        next.setHours(h || 0, m || 0, 0, 0);
        if (next.getTime() <= fromMs) next.setDate(next.getDate() + 1);
        return next.getTime();
    }
    if (recurrence.kind === 'weekly') {
        const [h, m] = (recurrence.time || '09:00').split(':').map(Number);
        const targetDow = Math.max(0, Math.min(6, Number(recurrence.dayOfWeek) || 0));
        const next = new Date(from);
        next.setHours(h || 0, m || 0, 0, 0);
        let diff = (targetDow - next.getDay() + 7) % 7;
        if (diff === 0 && next.getTime() <= fromMs) diff = 7;
        next.setDate(next.getDate() + diff);
        return next.getTime();
    }
    return null;
}

function describeRecurrence(recurrence) {
    if (recurrence.kind === 'once') return `once on ${recurrence.date} at ${recurrence.time}`;
    if (recurrence.kind === 'interval') return `every ${recurrence.intervalMinutes} min`;
    if (recurrence.kind === 'daily') return `daily at ${recurrence.time}`;
    if (recurrence.kind === 'weekly') return `every ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][recurrence.dayOfWeek] || '?'} at ${recurrence.time}`;
    return 'unknown schedule';
}

function scheduleValidate({ label, message, recurrence, fileAction }) {
    if (!message || !message.trim()) return 'A message/reminder text is required.';
    if (!recurrence || !['once', 'daily', 'weekly', 'interval'].includes(recurrence.kind)) return 'Invalid recurrence type.';
    if ((recurrence.kind === 'once' || recurrence.kind === 'daily' || recurrence.kind === 'weekly') && !/^\d{1,2}:\d{2}$/.test(recurrence.time || '')) return 'Time must be HH:MM.';
    if (recurrence.kind === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(recurrence.date || '')) return 'Date must be YYYY-MM-DD for a one-time task.';
    if (recurrence.kind === 'weekly' && (recurrence.dayOfWeek === undefined || recurrence.dayOfWeek < 0 || recurrence.dayOfWeek > 6)) return 'dayOfWeek must be 0-6.';
    if (fileAction && !SCHED_ALLOWED_EXT.has(fileAction.ext)) return `File type must be one of: ${[...SCHED_ALLOWED_EXT].join(', ')}.`;
    return null;
}

function scheduleCreate({ label, message, recurrence, fileAction }) {
    const err = scheduleValidate({ label, message, recurrence, fileAction });
    if (err) return FAIL(err);
    const nextRunAt = computeNextRun(recurrence);
    if (!nextRunAt) return FAIL('Could not compute a next run time for this schedule.');
    const task = {
        id: crypto.randomUUID(),
        label: (label || message).slice(0, 80),
        message: message.trim(),
        recurrence,
        fileAction: fileAction ? { ext: fileAction.ext, topic: (fileAction.topic || message).slice(0, 400) } : null,
        enabled: true,
        nextRunAt,
        lastRunAt: null,
        lastResult: null,
        createdAt: Date.now(),
        projectId: mem.activeProjectId || null
    };
    scheduledTasks.push(task);
    saveSchedule();
    return { success: true, message: `Scheduled: "${task.label}" — ${describeRecurrence(recurrence)}`, task };
}

function scheduleList() {
    return scheduledTasks.map(t => ({ ...t, recurrenceDesc: describeRecurrence(t.recurrence) }));
}
function scheduleToggle(id, enabled) {
    const t = scheduledTasks.find(x => x.id === id);
    if (!t) return FAIL('Task not found');
    t.enabled = !!enabled;
    saveSchedule();
    return OK(t.enabled ? 'Task enabled' : 'Task paused');
}
function scheduleDelete(id) {
    const idx = scheduledTasks.findIndex(x => x.id === id);
    if (idx === -1) return FAIL('Task not found');
    scheduledTasks.splice(idx, 1);
    saveSchedule();
    return OK('Task deleted');
}

async function fireScheduledTask(task) {
    let fileResult = null;
    if (task.fileAction) {
        try {
            const dir = path.join(os.homedir(), 'Downloads', 'Wizard Scheduled Files');
            await fsp.mkdir(dir, { recursive: true });
            const filename = `${safeFilename(task.label)}-${Date.now()}.${task.fileAction.ext}`;
            fileResult = await genFile({ topic: task.fileAction.topic, ext: task.fileAction.ext, filename, targetPath: path.join(dir, filename) });
        } catch (e) {
            fileResult = FAIL(`Scheduled file generation failed: ${e.message}`);
        }
    }

    const bodyText = task.message + (fileResult ? `\n${fileResult.message}` : '');

    if (Notification.isSupported()) {
        new Notification({ title: `🧙 ${task.label}`, body: task.message }).show();
    }
    const payload = { message: bodyText, label: task.label, result: fileResult };
    mainWin?.webContents.send('scheduled-task-fired', payload);
    overlayWin?.webContents.send('scheduled-task-fired', payload);
    pushHistToWindow(mainWin, 'assistant', bodyText);
    pushHistToWindow(overlayWin, 'assistant', bodyText);

    task.lastRunAt = Date.now();
    task.lastResult = fileResult ? fileResult.message : 'Reminder sent';
    telLog('scheduled_task_fired', { id: task.id, hadFile: !!task.fileAction });

    if (task.recurrence.kind === 'once') {
        scheduledTasks = scheduledTasks.filter(t => t.id !== task.id); // one-time tasks clean themselves up
    } else {
        task.nextRunAt = computeNextRun(task.recurrence, Date.now());
    }
    saveSchedule();
}

let scheduleTimer = null;
function startSchedulerEngine() {
    if (scheduleTimer) return;
    scheduleTimer = setInterval(() => {
        const now = Date.now();
        for (const t of scheduledTasks) {
            if (t.enabled && t.nextRunAt && t.nextRunAt <= now) {
                fireScheduledTask(t).catch(() => { });
            }
        }
    }, 60 * 1000); // 60s resolution — fine for calendar-style tasks, unlike proactivity this needs no randomness
}
function stopSchedulerEngine() {
    if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIPBOARD HISTORY
// ─────────────────────────────────────────────────────────────────────────────
let clipHistory = [];

function loadClipHistory() {
    try { if (fs.existsSync(CLIP_FILE())) clipHistory = JSON.parse(fs.readFileSync(CLIP_FILE(), 'utf8')); } catch { clipHistory = []; }
}
function pushClipHistory(text) {
    if (!text || clipHistory[0]?.text === text) return;
    clipHistory.unshift({ text, ts: Date.now() });
    clipHistory = clipHistory.slice(0, 20);
    try { fs.writeFileSync(CLIP_FILE(), JSON.stringify(clipHistory), 'utf8'); } catch { }
}
function searchClipHistory(q) {
    const lq = q.toLowerCase();
    return clipHistory.filter(c => c.text.toLowerCase().includes(lq));
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND CACHE
// ─────────────────────────────────────────────────────────────────────────────
const cmdCache = new Map();
const UNCACHEABLE = new Set([
    'create_file_ai', 'fs_write', 'fs_delete', 'fs_move', 'fs_copy', 'fs_mkdir',
    'shell_exec', 'run_script', 'create_project', 'read_document', 'fs_read', 'fs_list',
    'set_reminder', 'clipboard_write', 'clipboard_read', 'take_screenshot',
    'browser_screenshot', 'system_info', 'get_time', 'macro_record', 'macro_replay',
    'nut_type', 'nut_key', 'nut_click', 'nut_dbl', 'nut_move', 'nut_drag', 'nut_scroll',
    'vault_autofill', 'schedule_task', 'file_search', 'agent_task', 'browser_click_nth', 'project_create', 'project_switch'
]);

function normalise(s) {
    return s.toLowerCase()
        .replace(/\b(please|can you|could you|just|hey|wizard|quickly|now|asap|would you|kindly)\b/gi, '')
        .replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 5) return 99;
    const d = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1]
                : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    return d[m][n];
}
function cacheGet(input) {
    const k = normalise(input);
    if (cmdCache.has(k)) return cmdCache.get(k);
    if (k.length <= 40) {
        for (const [ck, cv] of cmdCache)
            if (lev(k, ck) <= 2) return cv;
    }
    return null;
}
function cacheSet(input, action) {
    if (UNCACHEABLE.has(action?.type)) return;
    const k = normalise(input);
    cmdCache.set(k, action);
    if (cmdCache.size > 80) cmdCache.delete(cmdCache.keys().next().value);
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEMETRY (local only)
// ─────────────────────────────────────────────────────────────────────────────
function telLog(event, data = {}) {
    if (!mem.telemetryOptIn) return;
    try { fs.appendFileSync(TELE_FILE(), JSON.stringify({ ts: Date.now(), event, ...data }) + '\n', 'utf8'); } catch { }
}

// ─────────────────────────────────────────────────────────────────────────────
// MACROS
// ─────────────────────────────────────────────────────────────────────────────
let macroRecording = null;

function macroStart(name) {
    macroRecording = { name, steps: [], startedAt: Date.now() };
    return OK(`Recording macro "${name}" — issue commands, then say "stop recording"`);
}
function macroStop() {
    if (!macroRecording) return FAIL('No macro is being recorded');
    const { name, steps } = macroRecording;
    try { fs.mkdirSync(MACRO_DIR(), { recursive: true }); } catch { }
    const file = path.join(MACRO_DIR(), `${safeFilename(name)}.json`);
    try {
        fs.writeFileSync(file, JSON.stringify({ name, steps }, null, 2), 'utf8');
        macroRecording = null;
        return OK(`Macro "${name}" saved with ${steps.length} step(s)`);
    } catch (e) { macroRecording = null; return FAIL(`Macro save error: ${e.message}`); }
}
function macroRecord(action) {
    if (macroRecording && !UNCACHEABLE.has(action.type)) macroRecording.steps.push(action);
}
async function macroReplay(name) {
    const file = path.join(MACRO_DIR(), `${safeFilename(name)}.json`);
    if (!fs.existsSync(file)) return FAIL(`Macro "${name}" not found`);
    try {
        const { steps } = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!steps.length) return FAIL('Macro has no steps');
        return executePlan(steps);
    } catch (e) { return FAIL(`Macro replay error: ${e.message}`); }
}
function macroList() {
    try {
        if (!fs.existsSync(MACRO_DIR())) return OK('No macros saved yet');
        const files = fs.readdirSync(MACRO_DIR()).filter(f => f.endsWith('.json'));
        const macros = files.map(f => {
            try { const d = JSON.parse(fs.readFileSync(path.join(MACRO_DIR(), f), 'utf8')); return `"${d.name}" (${d.steps?.length || 0} steps)`; }
            catch { return f; }
        });
        return OK(macros.length ? `Macros:\n${macros.join('\n')}` : 'No macros saved yet');
    } catch { return OK('No macros saved yet'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLUGINS
// ─────────────────────────────────────────────────────────────────────────────
const plugins = [];

function loadPlugins() {
    try {
        if (!fs.existsSync(PLUGIN_DIR)) { fs.mkdirSync(PLUGIN_DIR, { recursive: true }); return; }
        const files = fs.readdirSync(PLUGIN_DIR).filter(f => f.endsWith('.wizard.js'));
        for (const f of files) {
            try {
                const plug = require(path.join(PLUGIN_DIR, f));
                if (plug.name && typeof plug.match === 'function' && typeof plug.handle === 'function') {
                    plugins.push(plug);
                    console.log(`[Plugin] Loaded: ${plug.name}`);
                }
            } catch (e) { console.warn(`[Plugin] Failed to load ${f}: ${e.message}`); }
        }
    } catch { }
}
async function tryPlugins(input) {
    for (const plug of plugins) {
        try { if (plug.match(input)) return await plug.handle(input, dispatch, OK, FAIL); }
        catch (e) { console.warn(`[Plugin] ${plug.name} error: ${e.message}`); }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function withRetry(fn, { retries = 2, baseDelayMs = 400 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fn();
            if (r && r.ok !== false) return r;
            lastErr = r?.err || 'unknown';
        } catch (e) { lastErr = e.message; }
        if (i < retries) await delay(baseDelayMs * Math.pow(2, i));
    }
    return { ok: false, err: lastErr };
}
const delay = ms => new Promise(r => setTimeout(r, ms));
const all = ps => Promise.all(ps);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP POST
// ─────────────────────────────────────────────────────────────────────────────
function httpPost({ hostname, port = 443, path: urlPath, key, body, timeout = 45000 }) {
    return new Promise(resolve => {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        const opts = {
            hostname, port, path: urlPath, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        };
        const req = https.request(opts, res => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                try {
                    const p = JSON.parse(raw);
                    if (res.statusCode === 429) { resolve({ ok: false, err: 'Rate limited (429)', status: 429 }); return; }
                    if (p.error) { resolve({ ok: false, err: p.error.message || JSON.stringify(p.error) }); return; }
                    resolve({ ok: true, text: p.choices?.[0]?.message?.content || '', status: res.statusCode });
                } catch { resolve({ ok: false, err: `JSON parse error (status ${res.statusCode})` }); }
            });
        });
        req.on('error', e => resolve({ ok: false, err: e.message }));
        req.setTimeout(timeout, () => { req.destroy(); resolve({ ok: false, err: 'Timeout' }); });
        req.write(bodyStr);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// MISTRAL — PRIMARY
// ─────────────────────────────────────────────────────────────────────────────
function mistralCallRaw({ sys, user, messages, maxTokens = 1024, temp = 0.2,
    json = false, timeout = 45000, visionImage, role = 'fast' } = {}) {
    const model = resolveModelForRole(role, !!visionImage);
    const guardKey = visionImage ? 'vision' : (MISTRAL_MODELS[role] ? role : 'fast');
    const guard = mistralGuards[guardKey];
    if (guard.isLimited()) return Promise.resolve({ ok: false, err: `Mistral rate limit (${model})` });

    const msgs = messages
        ? [{ role: 'system', content: sys || '' }, ...messages]
        : [{ role: 'system', content: sys || '' }, { role: 'user', content: user || '' }];

    if (visionImage) {
        const lastUser = msgs.slice().reverse().find(m => m.role === 'user');
        if (lastUser) {
            const text = lastUser.content;
            lastUser.content = [
                { type: 'text', text },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${visionImage}` } }
            ];
        }
    }

    const body = {
        model,
        max_tokens: maxTokens,
        temperature: temp,
        messages: msgs,
        ...(json ? { response_format: { type: 'json_object' } } : {})
    };

    guard.record();
    return httpPost({ hostname: MISTRAL_HOST, path: MISTRAL_PATH, key: MISTRAL_KEY(), body, timeout });
}

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD AI — FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
function wizardCallRaw({ sys, user, messages, maxTokens = 1024, temp = 0.2,
    json = false, timeout = 45000 } = {}) {
    if (wizardGuard.isLimited()) return Promise.resolve({ ok: false, err: 'Wizard rate limit' });

    const msgs = messages
        ? [{ role: 'system', content: sys || '' }, ...messages]
        : [{ role: 'system', content: sys || '' }, { role: 'user', content: user || '' }];

    const body = {
        model: WIZARD_MODEL,
        max_tokens: maxTokens,
        temperature: temp,
        messages: msgs,
        ...(json ? { response_format: { type: 'json_object' } } : {})
    };

    wizardGuard.record();
    return httpPost({ hostname: WIZARD_HOST, path: WIZARD_PATH, key: WIZARD_KEY(), body, timeout });
}

// ─────────────────────────────────────────────────────────────────────────────
// llmCall — Mistral primary → Wizard AI fallback
// ─────────────────────────────────────────────────────────────────────────────
async function llmCall(opts) {
    const gr = await withRetry(() => mistralCallRaw(opts), { retries: 2, baseDelayMs: 400 });
    if (gr.ok) return gr;
    console.warn(`[Mistral] failed (${gr.err}), falling back to Wizard AI`);
    const wr = await withRetry(() => wizardCallRaw(opts), { retries: 2, baseDelayMs: 500 });
    return wr;
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING
// ─────────────────────────────────────────────────────────────────────────────
function llmStream({ sys, user, maxTokens = 8192, temp = 0.3, timeout = 90000, role = 'complex' }, onChunk) {
    const model = MISTRAL_MODELS[role] || MISTRAL_MODELS.complex;
    return streamFrom(
        { hostname: MISTRAL_HOST, path: MISTRAL_PATH, key: MISTRAL_KEY(), model },
        { sys, user, maxTokens, temp, timeout }, onChunk
    ).then(r => {
        if (r.ok) return r;
        console.warn('[Mistral stream] failed, falling back to Wizard AI stream');
        return streamFrom(
            { hostname: WIZARD_HOST, path: WIZARD_PATH, key: WIZARD_KEY(), model: WIZARD_MODEL },
            { sys, user, maxTokens, temp, timeout }, onChunk
        );
    });
}

function streamFrom({ hostname, path: urlPath, key, model }, { sys, user, maxTokens, temp, timeout }, onChunk) {
    return new Promise(resolve => {
        const msgs = [
            { role: 'system', content: sys || '' },
            { role: 'user', content: user || '' }
        ];
        const body = JSON.stringify({ model, max_tokens: maxTokens, temperature: temp, stream: true, messages: msgs });
        let full = '', settled = false;
        const done = (ok, err) => { if (!settled) { settled = true; resolve({ ok, text: full, err }); } };

        const req = https.request({
            hostname, port: 443, path: urlPath, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let buf = '';
            res.on('data', chunk => {
                buf += chunk.toString('utf8');
                let nlIdx;
                while ((nlIdx = buf.indexOf('\n')) !== -1) {
                    const line = buf.slice(0, nlIdx).trim();
                    buf = buf.slice(nlIdx + 1);
                    if (!line.startsWith('data:')) continue;
                    const payload = line.slice(5).trim();
                    if (payload === '[DONE]') { done(true); return; }
                    try {
                        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
                        if (delta) { full += delta; try { onChunk?.(delta, full); } catch { } }
                    } catch { }
                }
            });
            res.on('end', () => done(true));
            res.on('error', e => done(false, e.message));
        });
        req.on('error', e => done(false, e.message));
        req.setTimeout(timeout, () => { req.destroy(); done(false, 'Stream timeout'); });
        req.write(body);
        req.end();
    });
}

async function checkForUpdates() {
    try { await llmCall({ role: 'fast', sys: 'Respond in JSON only.', user: `Return {"latest":"${VERSION}","notes":"Up to date."}`, maxTokens: 60, temp: 0, timeout: 8000 }); }
    catch { }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const OK = msg => ({ success: true, message: msg });
const FAIL = msg => ({ success: false, message: msg });
const ENC = s => encodeURIComponent(s);

function safeFilename(t) {
    return (t || 'wizard').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'wizard';
}

function resolvePath(p) {
    if (!p) return p;
    let s = String(p).trim().replace(/^["']|["']$/g, '');
    if (s.startsWith('~')) s = path.join(os.homedir(), s.slice(1));
    const home = os.homedir();
    const tokens = {
        'desktop': path.join(home, 'Desktop'),
        'downloads': path.join(home, 'Downloads'),
        'documents': path.join(home, 'Documents'),
        'pictures': path.join(home, 'Pictures'),
        'music': path.join(home, 'Music'),
        'videos': path.join(home, 'Videos'),
        'user folder': home,
        'home': home,
        'my user folder': home,
        'my home folder': home,
    };
    const lower = s.toLowerCase();
    for (const [k, v] of Object.entries(tokens)) {
        if (lower === k) return v;
        if (lower.startsWith(k + '/') || lower.startsWith(k + '\\')) {
            return path.join(v, s.slice(k.length + 1));
        }
    }
    if (!path.isAbsolute(s) && !/^[A-Za-z]:/.test(s) && !s.startsWith('\\\\')) {
        return path.join(home, s);
    }
    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION SYSTEM
//   Themed in-app modal instead of the native OS dialog.showMessageBox —
//   routed to whichever window (main or overlay) the user is actually
//   looking at, since a command may originate from either. A hard
//   timeout auto-denies rather than hanging forever if a renderer never
//   responds (e.g. window closed mid-prompt).
// ─────────────────────────────────────────────────────────────────────────────
const sessionApprovals = new Set();
const pendingPermissions = new Map();

ipcMain.on('permission-response', (_e, { id, approved }) => {
    const resolver = pendingPermissions.get(id);
    if (resolver) { pendingPermissions.delete(id); resolver(!!approved); }
});

async function requestPermission({ title, detail, danger = false, severity = null, sessionKey = null } = {}) {
    if (sessionKey && sessionApprovals.has(sessionKey)) return true;
    // Three-tier severity, shown to the user as a label so risk is legible
    // at a glance, not just implied by button color:
    //   'moderate' — reversible-ish (overwrite, move, copy, scaffold a project)
    //   'high'     — hard to undo or runs arbitrary code (delete, shell, scripts)
    // If not explicitly set, derive from the legacy `danger` boolean so
    // existing call sites keep working without every one needing an update.
    const resolvedSeverity = severity || (danger ? 'high' : 'moderate');

    // Route to whichever window the user is actually looking at. Both
    // index.html and overlay.html now carry a matching themed
    // 'permission-request' listener, so this is safe in either case —
    // previously this always forced mainWin because overlay.html's
    // listener didn't exist yet.
    let target = (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) ? overlayWin
        : (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) ? mainWin : null;
    if (!target) {
        if (!mainWin || mainWin.isDestroyed()) createMain();
        mainWin.show(); mainWin.focus();
        target = mainWin;
    }

    const id = crypto.randomUUID();
    return new Promise(resolve => {
        pendingPermissions.set(id, resolve);
        target.webContents.send('permission-request', { id, title, detail, danger, severity: resolvedSeverity });
        setTimeout(() => {
            if (pendingPermissions.has(id)) { pendingPermissions.delete(id); resolve(false); }
        }, 120000); // 2 min — auto-deny rather than block a dispatched action forever
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE TYPE MAPS
// ─────────────────────────────────────────────────────────────────────────────
const FTYPES = {
    py: 'Python', js: 'JavaScript', ts: 'TypeScript', jsx: 'React JSX', tsx: 'React TSX',
    cpp: 'C++', c: 'C', cs: 'C#', java: 'Java', rs: 'Rust', go: 'Go', rb: 'Ruby',
    php: 'PHP', swift: 'Swift', kt: 'Kotlin', sh: 'Bash Script', ps1: 'PowerShell', lua: 'Lua',
    html: 'HTML', css: 'CSS', json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML',
    toml: 'TOML', sql: 'SQL', csv: 'CSV', md: 'Markdown', txt: 'Text',
    docx: 'Word Document', pdf: 'PDF',
    svg: 'SVG Image', env: '.env Config', dockerfile: 'Dockerfile',
    'docker-compose.yml': 'Docker Compose', graphql: 'GraphQL Schema',
    proto: 'Protocol Buffer', tf: 'Terraform', makefile: 'Makefile',
    nginx: 'Nginx Config', vue: 'Vue Component', astro: 'Astro Component',
};

function detectExt(s) {
    s = s.toLowerCase();
    for (const ext of Object.keys(FTYPES))
        if (new RegExp(`\\.${ext.replace('.', '\\.')}\\b`).test(s)) return ext;
    const map = {
        py: ['python'], js: ['javascript', 'node script'], ts: ['typescript'],
        jsx: ['react component', 'jsx'], tsx: ['react tsx'],
        cpp: ['c++', 'cpp'], c: ['c file', 'c code'], cs: ['c#', 'csharp'],
        java: ['java '], rs: ['rust '], go: ['golang', 'go file'], rb: ['ruby'],
        php: ['php '], swift: ['swift '], sh: ['bash script', 'shell script'],
        ps1: ['powershell script'], lua: ['lua '],
        html: ['html', 'website', 'web page', 'landing page', 'webpage', 'web site'],
        css: ['stylesheet', 'css file'], json: ['json', 'config file'],
        yaml: ['yaml', 'yml'], sql: ['sql ', 'database query'], md: ['markdown', 'readme'],
        docx: ['word doc', 'word document', 'docx'],
        pdf: ['pdf'], txt: ['text file', 'plain text', 'note'],
        svg: ['svg', 'vector', 'icon', 'illustration'],
        env: ['env file', '.env', 'environment variables', 'dotenv'],
        dockerfile: ['dockerfile', 'docker image', 'container image'],
        graphql: ['graphql', 'gql schema', 'graph ql'],
        tf: ['terraform', 'infra as code', 'iac'],
        vue: ['vue component', 'vue file'],
        astro: ['astro component', 'astro file'],
    };
    for (const [ext, keys] of Object.entries(map))
        if (keys.some(k => s.includes(k))) return ext;
    return 'txt';
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
function worldCtx(hist = []) {
    const bs = getBrowserState();
    const now = new Date().toLocaleString();
    const tabs = tabRegistry.size > 0
        ? `Open tabs (${tabRegistry.size}): ${[...tabRegistry.values()].map(t => `"${t.title || t.url}"`).join(', ')}`
        : null;
    const activeProject = getActiveProject();
    const lines = [
        activeProject ? `ACTIVE PROJECT: "${activeProject.name}"${activeProject.description ? ' — ' + activeProject.description : ''} (new goals, scheduled tasks, and generated files are being tagged to this project automatically)` : null,
        `Time: ${now}`,
        `OS: ${process.platform} ${os.arch()}`,
        `User: ${os.userInfo().username}`,
        `Home: ${os.homedir()}`,
        `Downloads: ${path.join(os.homedir(), 'Downloads')}`,
        `Desktop: ${path.join(os.homedir(), 'Desktop')}`,
        `Documents: ${path.join(os.homedir(), 'Documents')}`,
        `App data: ${APP_DATA_DIR()}`,
        bs.open ? `Browser: OPEN  URL=${bs.url || '…'}  Title="${bs.title || ''}"` : 'Browser: closed',
        tabs,
        macroRecording ? `⚠️ RECORDING MACRO: "${macroRecording.name}" (${macroRecording.steps.length} steps)` : null,
    ].filter(Boolean);
    const recent = hist.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'Wizard'}: ${h.content.slice(0, 140)}`).join('\n');
    if (recent) lines.push('Recent:\n' + recent);
    const mc = memCtx();
    if (mc) lines.push(mc);
    return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────────────────────
const CHAT_SYS_BASE = `You are Wizard Autopilot — an AI assistant AND computer automation tool built by Arnav Gupta as part of the Wizard Ecosystem.

You are smart conversational AI and a powerful automation engine. You have FULL control over the user's computer, filesystem, browser, mouse, keyboard, clipboard, and shell (subject to user confirmation for destructive actions).

Be helpful, concise, and friendly. You run in a spotlight overlay — keep replies brief (1-4 sentences) unless depth is needed. Write in plain conversational prose only — never markdown headers, bold text, or bullet lists in chat replies, even for multi-part answers; that formatting belongs in generated files, not in the chat window. Avoid generic assistant filler ("Glad to help!", "Let me know if...", emoji-decorated call-to-action lists) — respond to what was actually said, specifically, like the rest of this conversation actually happened.

About Wizard Ecosystem: Wizard AI, Wizard Search, Wizard Mail, Wizard Calendar, Wizard Chat — all by Arnav Gupta.
Global hotkey Ctrl/Cmd+Shift+A opens this overlay anywhere.

You do NOT know what files are on the user's disk. If the user asks about files, the system will route to filesystem tools. NEVER make up directory contents. NEVER reply "Done." to a request that involves creating/making/writing files — the system will route those requests away from you to the automation engine.

FILE NAMING RULES (when you DO generate filenames):
- kebab-case for HTML/CSS/JS/web (spiderman-origins.html, my-portfolio.html)
- snake_case for Python (spider_scraper.py)
- Descriptive, short, 3-6 words MAX
- NEVER use random numbers or timestamps unless uniqueness is required
- Match extension to purpose (website → .html, script → .py, doc → .docx)`;

function chatSys(ctx) { return ctx ? `${CHAT_SYS_BASE}\n\nContext:\n${ctx}` : CHAT_SYS_BASE; }

// ─────────────────────────────────────────────────────────────────────────────
// ACTION SCHEMA — SHORT, FOCUSED (ministral-14b friendly)
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_SYS = `You are Wizard Autopilot command parser. Return JSON only — no prose, no markdown fences.

Single action:    {"action":{"type":"...",...},"thinking":"...","response":"..."}
Multi-step plan:  {"action_plan":[{...},{...}],"thinking":"...","response":"..."}

═══ ACTION TYPES ═══

FILESYSTEM (use these for any file operation):
{"type":"fs_write","path":"downloads/foo.html","generate":"<what to write>"}      ← for MAKE/CREATE/BUILD/GENERATE a file
{"type":"fs_write","path":"downloads/foo.html","content":"<raw text>"}            ← when content is literal
{"type":"fs_read","path":"downloads/foo.pdf","analyze":"optional request"}
{"type":"fs_list","path":"downloads"}                                              ← for "what's in X", "list X"
{"type":"fs_delete","path":"~/old","recursive":true}
{"type":"fs_move","from":"a","to":"b"}
{"type":"fs_copy","from":"a","to":"b","recursive":true}
{"type":"fs_mkdir","path":"downloads/newfolder"}
{"type":"fs_search","path":"downloads","pattern":"*.pdf","query":"term"}
{"type":"fs_info","path":"..."}
{"type":"fs_reveal","path":"..."}
{"type":"create_project","base_dir":"downloads","name":"my-portfolio","description":"<description>"}

PROJECTS (organizing goals/tasks/files into named units — never deletes anything):
{"type":"project_create","name":"short project name","description":"optional one-line description"}
   — Use when the user says something like "start a new project called X",
     "let's call this the Y project". This becomes the active project —
     new goals, scheduled tasks, and generated files get tagged to it
     automatically from then on, until they switch or clear it.
{"type":"project_switch","name":"existing project name, or null/empty to go unscoped"}
   — Use for "switch to project X", "go back to working on Y", or "stop
     working on a specific project" (pass name as null/empty for the
     latter). Matches by name against existing projects — if none matches,
     say so in your response rather than silently creating a new one.

AGENT TASK (multi-step, with observation and replanning between steps):
{"type":"agent_task","goal":"<restate the user's full multi-step goal in one sentence>"}
   — Use this INSTEAD of action_plan when the task genuinely needs to
     observe results and adapt — e.g. "run the tests, fix any errors, and
     run them again", "install this package and get it working", anything
     where a step might fail and the right next step depends on HOW it
     failed. Use action_plan instead when the full sequence is already
     fully known and won't need to change based on results (e.g. "open
     youtube then search for X" — no step depends on observing the last
     one). Do not use agent_task for a single simple action.
{"type":"file_search","query":"what to find or ask about across the user's own files"}
   — Searches the CONTENT of the user's files (Documents/Desktop/Downloads
     by default, or a folder they've configured) and answers using what it
     finds, citing filenames. Use this when the user wants to find or ask
     about something across files they don't name a specific path for —
     "find my resume", "what did I write about the Q3 budget", "search my
     files for the flight confirmation". Different from fs_search (which
     matches filenames/patterns, not content) and fs_read (a single file
     the user already named).

SHELL:
{"type":"shell_exec","command":"npm install","cwd":"optional"}
{"type":"run_script","language":"python","code":"print(1)","save_path":"optional"}

BROWSER:
{"type":"browser_open","url":"https://..."}
{"type":"browser_nav","url":"https://..."}
{"type":"browser_click","text":"element text"}
{"type":"browser_click_nth","n":1}
   — Use this for "click the first/second/Nth result/item/product", "click
     the top result", "click the last one", etc. — anything about POSITION
     in a list rather than specific text you can see. n is 1-based; use -1
     for "the last one". Do NOT invent a placeholder description like "the
     first result (e.g., some guessed product name)" and pass it to
     browser_click's text field — you cannot see the page content, so a
     guessed label will never match anything real. Use browser_click_nth
     instead, which resolves position structurally without needing to know
     what's actually on the page.
{"type":"browser_type","text":"...","pressEnter":false}
{"type":"browser_scroll","dir":"up|down","amount":600}
{"type":"browser_read"}
{"type":"search_web","query":"...","engine":"google|duckduckgo|youtube|bing|amazon|github|stackoverflow"}

VAULT (site key only — you never see or handle credential values):
{"type":"vault_autofill","site":"amazon.com"}
   — Fills a saved login/card on the CURRENT browser page if the user has
     saved one for this host. Never submits/buys — human clicks that.
   — NEVER attempt to construct, guess, or output a username, password,
     or card number yourself under any circumstance. You do not have
     access to them and never will.

SCHEDULE (calendar-style recurring/one-off tasks the USER is setting up):
{"type":"schedule_task","label":"short name","message":"what to remind/tell the user","recurrence":{"kind":"daily","time":"08:00"}}
{"type":"schedule_task","label":"...","message":"...","recurrence":{"kind":"weekly","dayOfWeek":1,"time":"18:00"}}
{"type":"schedule_task","label":"...","message":"...","recurrence":{"kind":"once","date":"2026-09-15","time":"09:00"}}
{"type":"schedule_task","label":"...","message":"...","recurrence":{"kind":"interval","intervalMinutes":120}}
   — dayOfWeek: 0=Sun..6=Sat. time is 24h "HH:MM". Only use this when the
     user is clearly asking to set up a recurring/future reminder or task
     ("every day at 8am...", "remind me every Monday...", "in 3 hours,
     remind me...", "once on the 15th at 9am..."). A one-off "remind me in
     25 minutes" style request should still use set_reminder, not this —
     use schedule_task for things with real recurrence or a specific future
     date, not simple short-delay reminders.
   — Optionally include "fileAction":{"ext":"docx|md|txt|pdf","topic":"..."}
     if the user wants something generated when it fires (e.g. "every
     Sunday, make me a weekly summary doc"). Never invent this field if
     the user only asked to be reminded with a message.
   — This creates a task the user explicitly asked for — never schedule
     something on your own initiative via this action type.

SYSTEM:
{"type":"take_screenshot"}
{"type":"system_info"}
{"type":"get_time"}
{"type":"math","expression":"0.15*847","label":"15% of 847"}
{"type":"open_app","app":"notepad|calculator|paint|explorer|cmd|powershell"}
{"type":"clipboard_write","text":"..."}
{"type":"clipboard_read"}
{"type":"set_reminder","message":"...","ms":60000}

═══ PATH RULES ═══
- "~/foo"          → user's home folder
- "downloads/foo"  → user's Downloads folder (DEFAULT for new files)
- "desktop/foo"    → user's Desktop folder
- "documents/foo"  → user's Documents folder
- Absolute paths (C:/..., /...) pass through unchanged
- NEVER invent a username. Only use ~ or the tokens above.

═══ FILENAME RULES ═══
- kebab-case, 3-6 words, descriptive
- NO timestamps, NO random numbers
- Match extension to purpose

═══ EXAMPLES ═══
"make a html website on the name Arnav"
→ {"action":{"type":"fs_write","path":"downloads/arnav.html","generate":"A modern single-page personal website for someone named Arnav — hero with name, about section, skills, contact, dark theme with purple accents, responsive"},"thinking":"Creating Arnav website","response":"Creating arnav.html in your Downloads..."}

"make me an html file about spiderman"
→ {"action":{"type":"fs_write","path":"downloads/spiderman.html","generate":"A single-page website about Spider-Man — hero, origin story, powers, villains, red/blue dark theme"},"thinking":"Creating Spider-Man HTML","response":"Creating spiderman.html in Downloads..."}

"make me a portfolio site"
→ {"action":{"type":"create_project","base_dir":"downloads","name":"portfolio","description":"Photography portfolio with Home hero, Gallery grid, About page, dark theme, responsive"},"thinking":"Scaffolding project","response":"Building portfolio in Downloads..."}

"list my Downloads"
→ {"action":{"type":"fs_list","path":"downloads"},"thinking":"Listing","response":"Listing Downloads..."}

"open youtube"
→ {"action":{"type":"browser_open","url":"https://youtube.com"},"thinking":"Opening","response":"Opening YouTube..."}

"what is 15% of 847"
→ {"action":{"type":"math","expression":"0.15*847","label":"15% of 847"},"thinking":"Calculating","response":"15% of 847 is 127.05"}`;

// ─────────────────────────────────────────────────────────────────────────────
// JSON EXTRACTOR — bulletproof
//   Handles markdown fences, extra prose, mismatched braces, nested strings
// ─────────────────────────────────────────────────────────────────────────────
function extractJSON(text) {
    if (!text || typeof text !== 'string') return null;
    let t = text.trim();
    // Strip markdown fences anywhere
    t = t.replace(/```(?:json)?/gi, '').trim();
    // Try direct parse first
    try { return JSON.parse(t); } catch { }
    // Balanced-brace scan from every '{'
    for (let start = t.indexOf('{'); start !== -1; start = t.indexOf('{', start + 1)) {
        let depth = 0, inStr = false, esc = false, end = -1;
        for (let i = start; i < t.length; i++) {
            const ch = t[i];
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        if (end !== -1) {
            const candidate = t.slice(start, end + 1);
            try { return JSON.parse(candidate); } catch { }
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILESYSTEM EXECUTORS
// ─────────────────────────────────────────────────────────────────────────────
async function fsRead({ path: p, analyze } = {}) {
    if (!p) return FAIL('No file path provided');
    const full = resolvePath(p);
    try {
        const stat = await fsp.stat(full);
        if (stat.isDirectory()) {
            const listing = await fsList({ path: full });
            return { success: true, message: `"${full}" is a directory. Contents:\n${listing.files.map(f => `${f.isDir ? '📁' : '📄'} ${f.name}`).join('\n')}`, isDir: true };
        }
        const ext = path.extname(full).toLowerCase();
        let content = '';

        if (['.txt', '.md', '.json', '.csv', '.js', '.ts', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sh', '.ps1', '.env', '.toml', '.ini', '.cfg', '.jsx', '.tsx', '.vue', '.rs', '.go', '.rb', '.java', '.c', '.cpp', '.h', '.hpp'].includes(ext)) {
            content = await fsp.readFile(full, 'utf8');
        } else if (ext === '.pdf' && getPdfParse()) {
            const buf = await fsp.readFile(full);
            const data = await getPdfParse()(buf);
            content = data.text;
        } else if (ext === '.docx' && getMammoth()) {
            const result = await getMammoth().extractRawText({ path: full });
            content = result.value;
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
            const b64 = (await fsp.readFile(full)).toString('base64');
            if (analyze) {
                const r = await llmCall({ role: 'vision', sys: 'You are a vision model. Answer concisely.', user: analyze, visionImage: b64, maxTokens: 600, temp: 0.3 });
                return r.ok ? OK(r.text.trim()) : FAIL(`Vision: ${r.err}`);
            }
            return { success: true, message: `Image: ${path.basename(full)}`, base64: b64, path: full, size: stat.size };
        } else {
            return FAIL(`Unsupported file type: ${ext} at ${full}`);
        }

        if (analyze) {
            const r = await llmCall({
                role: 'complex',
                sys: 'Answer the user\'s request about this file content. Be concise and specific.',
                user: `File: ${path.basename(full)}\n\nRequest: ${analyze}\n\nContent:\n${content.slice(0, 12000)}`,
                maxTokens: 900, temp: 0.3
            });
            return r.ok ? OK(r.text.trim()) : FAIL(`Analysis: ${r.err}`);
        }

        return { success: true, message: `Read ${full} (${content.length} chars)`, content: content.slice(0, 5000), path: full, size: stat.size, truncated: content.length > 5000 };
    } catch (e) {
        return FAIL(`Read error for "${full}": ${e.message}`);
    }
}

async function fsWrite({ path: p, content, generate, ext: hintExt } = {}) {
    if (!p) return FAIL('No file path provided');
    const full = resolvePath(p);

    const dir = path.dirname(full);
    try { await fsp.mkdir(dir, { recursive: true }); } catch { }

    if (generate && !content) {
        const ext = hintExt || path.extname(full).replace('.', '') || 'txt';
        return genFile({ topic: generate, ext, filename: path.basename(full), targetPath: full });
    }

    if (typeof content !== 'string') return FAIL('No content provided');

    const exists = fs.existsSync(full);
    if (exists) {
        const approved = await requestPermission({
            title: 'Overwrite existing file?',
            detail: `File: ${full}\nSize: ${(fs.statSync(full).size / 1024).toFixed(1)} KB\n\nThis will replace the current content.`,
            danger: true, severity: 'moderate'
        });
        if (!approved) return FAIL('User cancelled overwrite');
    }

    try {
        await fsp.writeFile(full, content, 'utf8');
        try { shell.showItemInFolder(full); } catch { }
        memLogProjectFile(path.basename(full), full);
        return OK(`Written: ${full} (${content.length} bytes)`);
    } catch (e) {
        return FAIL(`Write error for "${full}": ${e.message}`);
    }
}

async function fsDelete({ path: p, recursive = false } = {}) {
    if (!p) return FAIL('No path provided');
    const full = resolvePath(p);
    try {
        const stat = await fsp.stat(full);
        if (stat.isDirectory() && !recursive) return FAIL('Path is a directory — set recursive:true to delete');
        const itemCount = stat.isDirectory() ? fs.readdirSync(full).length : 1;
        const approved = await requestPermission({
            title: 'Delete file/folder?',
            detail: `Path: ${full}\nType: ${stat.isDirectory() ? 'FOLDER' : 'file'}\nItems: ${itemCount}\n\nThis cannot be undone.`,
            danger: true, severity: 'high'
        });
        if (!approved) return FAIL('User cancelled');
        if (stat.isDirectory()) await fsp.rm(full, { recursive: true, force: true });
        else await fsp.unlink(full);
        return OK(`Deleted: ${full}`);
    } catch (e) {
        return FAIL(`Delete error for "${full}": ${e.message}`);
    }
}

async function fsMove({ from, to } = {}) {
    if (!from || !to) return FAIL('Need both "from" and "to" paths');
    const src = resolvePath(from), dst = resolvePath(to);
    try {
        await fsp.mkdir(path.dirname(dst), { recursive: true });
        const approved = await requestPermission({
            title: 'Move file/folder?',
            detail: `From: ${src}\nTo:   ${dst}`,
            danger: false, severity: 'moderate'
        });
        if (!approved) return FAIL('User cancelled');
        await fsp.rename(src, dst);
        return OK(`Moved: ${src} → ${dst}`);
    } catch (e) {
        return FAIL(`Move error: ${e.message}`);
    }
}

async function fsCopy({ from, to, recursive = true } = {}) {
    if (!from || !to) return FAIL('Need both "from" and "to" paths');
    const src = resolvePath(from), dst = resolvePath(to);
    try {
        await fsp.mkdir(path.dirname(dst), { recursive: true });
        const approved = await requestPermission({
            title: 'Copy file/folder?',
            detail: `From: ${src}\nTo:   ${dst}`,
            danger: false, severity: 'moderate'
        });
        if (!approved) return FAIL('User cancelled');
        await fsp.cp(src, dst, { recursive });
        return OK(`Copied: ${src} → ${dst}`);
    } catch (e) {
        return FAIL(`Copy error: ${e.message}`);
    }
}

async function fsMkdir({ path: p } = {}) {
    if (!p) return FAIL('No path provided');
    const full = resolvePath(p);
    try {
        await fsp.mkdir(full, { recursive: true });
        return OK(`Directory created: ${full}`);
    } catch (e) {
        return FAIL(`Mkdir error: ${e.message}`);
    }
}

async function fsList({ path: p } = {}) {
    const full = resolvePath(p || os.homedir());
    return new Promise(resolve => {
        fs.readdir(full, { withFileTypes: true }, (err, items) => {
            if (err) return resolve(FAIL(`Cannot list "${full}": ${err.message}`));
            const sorted = items.sort((a, b) => {
                if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            const files = sorted.slice(0, 200).map(i => ({
                name: i.name,
                isDir: i.isDirectory(),
                ext: path.extname(i.name).toLowerCase()
            }));
            resolve({
                success: true,
                message: `Contents of ${full} (${items.length} items)`,
                files,
                totalCount: items.length,
                dirPath: full
            });
        });
    });
}

async function fsSearch({ path: p, pattern, query, searchContent = false, maxResults = 40 } = {}) {
    const root = resolvePath(p || os.homedir());
    const results = [];
    let scanned = 0;
    const ext = pattern ? pattern.toLowerCase().replace(/^\*/, '') : null;

    async function walk(dir, depth = 0) {
        if (depth > 8 || results.length >= maxResults || scanned > 5000) return;
        let entries;
        try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (results.length >= maxResults || scanned > 5000) return;
            scanned++;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (!e.name.startsWith('.') && !['node_modules', 'AppData', '$Recycle.Bin', 'System Volume Information'].includes(e.name)) {
                    await walk(full, depth + 1);
                }
            } else {
                const nameMatch = !ext || e.name.toLowerCase().endsWith(ext);
                if (!nameMatch) continue;
                if (!query && !searchContent) {
                    results.push({ name: e.name, path: full, dir: false });
                } else if (query && !searchContent) {
                    if (e.name.toLowerCase().includes(query.toLowerCase())) results.push({ name: e.name, path: full, dir: false });
                } else if (searchContent && query) {
                    try {
                        const st = await fsp.stat(full);
                        if (st.size < 2_000_000) {
                            const content = await fsp.readFile(full, 'utf8');
                            if (content.toLowerCase().includes(query.toLowerCase())) {
                                const idx = content.toLowerCase().indexOf(query.toLowerCase());
                                results.push({ name: e.name, path: full, dir: false, snippet: content.slice(Math.max(0, idx - 60), idx + 140) });
                            }
                        }
                    } catch { }
                }
            }
        }
    }

    await walk(root);
    return { success: true, message: `Found ${results.length} match(es) in ${root}${scanned > 5000 ? ' (scan limit reached)' : ''}`, results, scanned, root };
}


// ─────────────────────────────────────────────────────────────────────────────
// LOCAL FILE SEARCH (query-triggered RAG)
//   Reachable from ordinary chat ("find my resume", "what did I write about
//   the Q3 budget") — NOT something that runs in the background. This is a
//   deliberate boundary: reading the actual CONTENT of a user's personal
//   documents is a bigger privacy step than remembering a fact they typed
//   in chat, so unlike Advanced Proactivity (which only ever touches
//   mem.facts/mem.goals), file_search only ever runs in direct response to
//   an explicit request — never on a timer, never unprompted.
//
//   Everything stays local except the final synthesis call to the LLM
//   provider, which only ever receives the small set of matched excerpts
//   (not whole files, not the whole folder) — same "least data necessary"
//   principle as the rest of this app.
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_TEXT_EXT = new Set(['.txt', '.md', '.json', '.csv', '.js', '.ts', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sh', '.ps1', '.toml', '.ini', '.cfg', '.jsx', '.tsx', '.vue', '.rs', '.go', '.rb', '.java', '.c', '.cpp', '.h', '.hpp']);
// Deliberately excludes .env and key/cert files even though fsRead can open
// them on direct request — a broad recursive scan that feeds matched
// content into an LLM call is a meaningfully different exposure than
// opening one specific file the user named, so this stays more conservative.
const SEARCH_EXCLUDE_RX = /\.(env|pem|key|pfx|p12|crt)$/i;
const SEARCH_EXCLUDE_NAMES = new Set(['id_rsa', 'id_ed25519', 'credentials.json', '.npmrc', '.netrc']);
const SEARCH_MAX_FILES = 300;
const SEARCH_MAX_FILE_BYTES = 3_000_000;
const SEARCH_CHUNK_CHARS = 2500;
const SEARCH_CHUNK_OVERLAP = 200;
const SEARCH_TOP_K = 20;
const SEARCH_MAX_CHUNKS_PER_FILE = 200;
// Real stopwords, not a length cutoff — a length filter silently drops
// short-but-meaningful terms like "cv", "ai", "id", which is exactly the
// bug that let a CV search match client.py/pyproject.toml instead of an
// actual resume: "cv" got dropped and only "find"/"my" were left to score.
const SEARCH_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'my', 'me', 'i',
    'what', 'whats', "what's", 'where', 'tell', 'about', 'that', 'this', 'with', 'from', 'find', 'search', 'do', 'does', 'did',
    'you', 'your', 'please', 'can', 'could', 'would', 'show', 'have', 'has', 'had']);

function getFileSearchRoots() {
    const pref = mem.preferences && mem.preferences.fileSearchRoots;
    if (pref && String(pref).trim()) {
        return String(pref).split(',').map(s => resolvePath(s.trim())).filter(Boolean);
    }
    return [resolvePath('documents'), resolvePath('desktop'), resolvePath('downloads')];
}

async function extractSearchableText(fullPath, ext) {
    try {
        if (SEARCH_TEXT_EXT.has(ext)) return await fsp.readFile(fullPath, 'utf8');
        if (ext === '.pdf' && getPdfParse()) {
            const buf = await fsp.readFile(fullPath);
            return (await getPdfParse()(buf)).text;
        }
        if (ext === '.docx' && getMammoth()) {
            return (await getMammoth().extractRawText({ path: fullPath })).value;
        }
    } catch { }
    return null;
}

function chunkText(text) {
    const chunks = [];
    for (let i = 0; i < text.length; i += (SEARCH_CHUNK_CHARS - SEARCH_CHUNK_OVERLAP)) {
        const chunk = text.slice(i, i + SEARCH_CHUNK_CHARS);
        if (chunk.trim()) chunks.push(chunk);
        if (chunks.length >= SEARCH_MAX_CHUNKS_PER_FILE) break; // still bounded so one huge file can't hang the scan, just far less stingy than before
    }
    return chunks;
}

function scoreChunk(chunk, terms, phrase) {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const t of terms) {
        const matches = lower.split(t).length - 1;
        score += matches;
    }
    if (phrase && lower.includes(phrase)) score += 10; // exact-phrase bonus
    return score;
}

async function fileSearch({ query, path: rootOverride } = {}) {
    if (!query || !query.trim()) return FAIL('No search query provided');
    const roots = rootOverride ? [resolvePath(rootOverride)] : getFileSearchRoots();
    let terms = query.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(w => w.length >= 2 && !SEARCH_STOPWORDS.has(w));
    if (!terms.length) terms = query.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(Boolean);
    const phrase = query.toLowerCase().trim();

    const scored = []; // { score, chunk, name, filePath }
    let filesScanned = 0;

    async function walk(dir, depth = 0) {
        if (depth > 6 || filesScanned >= SEARCH_MAX_FILES) return;
        let entries;
        try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (filesScanned >= SEARCH_MAX_FILES) return;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (!e.name.startsWith('.') && !['node_modules', 'AppData', '$Recycle.Bin', 'System Volume Information'].includes(e.name)) {
                    await walk(full, depth + 1);
                }
                continue;
            }
            if (SEARCH_EXCLUDE_RX.test(e.name) || SEARCH_EXCLUDE_NAMES.has(e.name)) continue;
            const ext = path.extname(e.name).toLowerCase();
            if (!SEARCH_TEXT_EXT.has(ext) && ext !== '.pdf' && ext !== '.docx') continue;

            let stat;
            try { stat = await fsp.stat(full); } catch { continue; }
            if (stat.size > SEARCH_MAX_FILE_BYTES) continue;

            filesScanned++;
            const text = await extractSearchableText(full, ext);
            if (!text) continue;

            // A term appearing in the FILENAME itself is strong signal — "cv"
            // matching cv.pdf/resume.docx should heavily outrank "find"
            // matching a comment inside client.py. This directly fixes the
            // reported bug where code files outranked the actual document.
            const lowerName = e.name.toLowerCase();
            const filenameBonus = terms.reduce((acc, t) => acc + (lowerName.includes(t) ? 25 : 0), 0);

            for (const chunk of chunkText(text)) {
                const score = scoreChunk(chunk, terms, phrase) + filenameBonus;
                if (score > 0) scored.push({ score, chunk, name: e.name, filePath: full });
            }
        }
    }

    for (const root of roots) {
        if (fs.existsSync(root)) await walk(root);
    }

    if (!scored.length) {
        return { success: false, message: `Found nothing matching "${query}" in ${roots.join(', ')}. Try different wording, or check the search folders in Memory → Settings.` };
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, SEARCH_TOP_K);
    const sources = [...new Map(top.map(t => [t.filePath, { name: t.name, path: t.filePath }])).values()];

    const excerptText = top.map((t, i) => `[Excerpt ${i + 1} — from "${t.name}"]\n${t.chunk.trim()}`).join('\n\n');

    const r = await llmCall({
        role: 'complex',
        sys: 'Answer the question using ONLY the file excerpts provided. Cite which file(s) the answer came from by name. Be thorough and complete — if asked to list facts/details, list all of them found in the excerpts, not an abbreviated sample. If the excerpts do not actually contain the answer, say so plainly rather than guessing or using outside knowledge.',
        user: `Question: ${query}\n\n${excerptText}`,
        maxTokens: 4000, temp: 0.2, timeout: 45000
    });

    if (!r.ok) return FAIL(`Search found matches but synthesis failed: ${r.err}`);
    return { success: true, message: r.text.trim(), sources };
}

async function fsInfo({ path: p } = {}) {
    if (!p) return FAIL('No path provided');
    const full = resolvePath(p);
    try {
        const st = await fsp.stat(full);
        return {
            success: true,
            message: `Info: ${full}`,
            info: {
                'Path': full,
                'Name': path.basename(full),
                'Type': st.isDirectory() ? 'Folder' : path.extname(full) || 'file',
                'Size': st.isDirectory() ? `${fs.readdirSync(full).length} items` : `${(st.size / 1024).toFixed(2)} KB`,
                'Created': st.birthtime.toISOString(),
                'Modified': st.mtime.toISOString(),
                'Permissions': st.mode.toString(8)
            }
        };
    } catch (e) { return FAIL(`Info error: ${e.message}`); }
}

async function fsReveal({ path: p } = {}) {
    if (!p) return FAIL('No path provided');
    const full = resolvePath(p);
    try { shell.showItemInFolder(full); return OK(`Revealed: ${full}`); }
    catch (e) { return FAIL(e.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-FILE PROJECT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
async function createProject({ base_dir, name, description } = {}) {
    if (!name || !description) return FAIL('Need project name and description');
    const root = resolvePath(base_dir || 'downloads');
    const projectDir = path.join(root, safeFilename(name));

    broadcast('thinking', { message: `Scaffolding project "${name}"…` });

    const approved = await requestPermission({
        title: 'Create multi-file project?',
        detail: `Location: ${projectDir}\nDescription: ${description}\n\nAn AI will generate the full file tree and write it here.`,
        danger: false, severity: 'moderate'
    });
    if (!approved) return FAIL('User cancelled');

    const r = await llmCall({
        role: 'complex',
        sys: `You are a project scaffolder. Return ONLY valid JSON, no markdown, no commentary.

Return format:
{
  "files": [
    { "path": "index.html", "content": "<full file content>" },
    { "path": "styles/main.css", "content": "..." },
    { "path": "scripts/app.js", "content": "..." }
  ]
}

RULES:
- Include 3-10 files for a complete, working project
- Paths are RELATIVE to the project root
- Provide FULL, production-quality content — no placeholders
- Include README.md describing the project
- Use modern practices (ES6+, CSS grid/flex, semantic HTML)`,
        user: `Project: "${name}"\nDescription: ${description}\n\nGenerate the complete file tree.`,
        maxTokens: 8192, temp: 0.3, json: true, timeout: 90000
    });

    if (!r.ok) return FAIL(`Project generation failed: ${r.err}`);
    let data = extractJSON(r.text);
    if (!data) return FAIL('Could not parse project structure');
    if (!data.files?.length) return FAIL('No files returned');

    try {
        await fsp.mkdir(projectDir, { recursive: true });
        let written = 0;
        for (const f of data.files) {
            if (!f.path || typeof f.content !== 'string') continue;
            const dest = path.join(projectDir, f.path);
            await fsp.mkdir(path.dirname(dest), { recursive: true });
            await fsp.writeFile(dest, f.content, 'utf8');
            written++;
        }
        try { shell.openPath(projectDir); } catch { }
        return OK(`Project "${name}" created at ${projectDir} (${written} files)`);
    } catch (e) {
        return FAIL(`Project write error: ${e.message}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL EXECUTION
// ─────────────────────────────────────────────────────────────────────────────
function execRaw(command, dir) {
    return new Promise(resolve => {
        exec(command, { cwd: dir, timeout: 30000, maxBuffer: 10 * 1024 * 1024, shell: true }, (err, stdout, stderr) => {
            const out = (stdout || '').slice(0, 4000);
            const errOut = (stderr || '').slice(0, 2000);
            if (err) resolve({ success: false, message: `Command failed: ${err.message.split('\n')[0]}`, output: errOut || out });
            else resolve({ success: true, message: `Ran in ${dir}: ${command}`, output: out || '(no output)' });
        });
    });
}

/**
 * Looks at a failed shell/script run and asks the model for ONE confident,
 * safe corrected command — not a guess-and-hope loop. Returns null if no
 * fix is proposed, which is the expected outcome most of the time; this
 * is deliberately conservative rather than trying to auto-fix everything.
 */
async function diagnoseAndProposeFix(command, dir, failResult) {
    const r = await llmCall({
        role: 'complex',
        sys: 'A shell command just failed. Look at the command, working directory, and error output, and decide if there is an obvious, safe, single corrected command likely to fix the issue (e.g. missing venv activation, wrong package manager, a missing flag, a typo). Only propose a fix you are reasonably confident about — many failures have no safe one-line fix, and returning null is the correct answer for those. Return ONLY JSON: {"fix": "<corrected command>", "reason": "<one short sentence>"} or {"fix": null}.',
        user: `Command: ${command}\nWorking dir: ${dir}\nError output:\n${(failResult.output || failResult.message || '').slice(0, 1500)}`,
        maxTokens: 300, temp: 0.1, json: true, timeout: 20000
    });
    if (!r.ok) return null;
    const parsed = extractJSON(r.text);
    if (parsed && typeof parsed.fix === 'string' && parsed.fix.trim()) return parsed;
    return null;
}

async function shellExec({ command, cwd } = {}) {
    if (!command) return FAIL('No command provided');
    const dir = resolvePath(cwd || os.homedir());

    const approved = await requestPermission({
        title: 'Run shell command?',
        detail: `Command: ${command}\nWorking dir: ${dir}\n\nThis will execute on your system.`,
        danger: true, severity: 'high'
    });
    if (!approved) return FAIL('User cancelled');

    const first = await execRaw(command, dir);
    if (first.success) return first;

    // One bounded retry: diagnose the failure, propose a fix, ask
    // permission again (it's a genuinely different command being run,
    // so it gets its own confirmation) — never loops further than this.
    const fix = await diagnoseAndProposeFix(command, dir, first);
    if (!fix) return first;

    const retryApproved = await requestPermission({
        title: 'Retry with a diagnosed fix?',
        detail: `Original command failed:\n${command}\n\nError:\n${(first.output || first.message || '').slice(0, 500)}\n\nProposed fix (${fix.reason || 'diagnosed automatically'}):\n${fix.fix}\n\nRun the corrected command instead?`,
        danger: true, severity: 'high'
    });
    if (!retryApproved) return { ...first, message: first.message + ' (a fix was proposed but declined)' };

    const second = await execRaw(fix.fix, dir);
    return {
        success: second.success,
        message: second.success
            ? `First attempt failed; retried with "${fix.fix}" (${fix.reason || 'diagnosed fix'}) → succeeded.`
            : `Both the original command and the diagnosed fix failed. Original: ${first.message} | Retry: ${second.message}`,
        output: second.output
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT RUNNER
// ─────────────────────────────────────────────────────────────────────────────
function execScriptRaw(exe, file, lang) {
    return new Promise(resolve => {
        exec(`"${exe}" "${file}"`, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
            const out = (stdout || '').slice(0, 4000);
            const errOut = (stderr || '').slice(0, 2000);
            if (err) resolve({ success: false, message: `${lang} error in ${file}: ${err.message.split('\n')[0]}`, output: errOut || out, path: file });
            else resolve({ success: true, message: `${lang} ran successfully (${file})`, output: out || '(no output)', path: file });
        });
    });
}

/** Same conservative one-shot-fix philosophy as diagnoseAndProposeFix, but
 * proposes corrected CODE rather than a corrected shell command. */
async function diagnoseAndProposeCodeFix(code, lang, failResult) {
    const r = await llmCall({
        role: 'complex',
        sys: `A ${lang} script just failed. Look at the code and error output. If there's an obvious, confident single-file fix (e.g. a missing import, a syntax error, a wrong variable name), return the FULL corrected file content. If you are not confident, return null — do not guess. Return ONLY JSON: {"fixedCode": "<full corrected file content>", "reason": "<one short sentence>"} or {"fixedCode": null}.`,
        user: `Original code:\n${code.slice(0, 3000)}\n\nError output:\n${(failResult.output || failResult.message || '').slice(0, 1500)}`,
        maxTokens: 3000, temp: 0.1, json: true, timeout: 25000
    });
    if (!r.ok) return null;
    const parsed = extractJSON(r.text);
    if (parsed && typeof parsed.fixedCode === 'string' && parsed.fixedCode.trim()) return parsed;
    return null;
}

async function runScript({ language, code, save_path } = {}) {
    if (!code) return FAIL('No code provided');
    const lang = (language || 'python').toLowerCase();

    let exe, ext;
    if (lang === 'python' || lang === 'py') { exe = process.platform === 'win32' ? 'python' : 'python3'; ext = '.py'; }
    else if (lang === 'node' || lang === 'javascript' || lang === 'js') { exe = 'node'; ext = '.js'; }
    else return FAIL(`Unsupported language: ${lang}`);

    let file;
    if (save_path) {
        file = resolvePath(save_path);
        try { await fsp.mkdir(path.dirname(file), { recursive: true }); } catch { }
    } else {
        try { await fsp.mkdir(SCRATCH_DIR(), { recursive: true }); } catch { }
        file = path.join(SCRATCH_DIR(), `scratch_${Date.now()}${ext}`);
    }
    await fsp.writeFile(file, code, 'utf8');

    const approved = await requestPermission({
        title: `Run ${lang} script?`,
        detail: `File: ${file}\n\n--- code preview ---\n${code.slice(0, 400)}${code.length > 400 ? '\n…' : ''}`,
        danger: true, severity: 'high'
    });
    if (!approved) return FAIL('User cancelled');

    const first = await execScriptRaw(exe, file, lang);
    if (first.success) return first;

    // One bounded retry: diagnose the failure, propose corrected code,
    // ask permission again (different content being run), execute once.
    const fix = await diagnoseAndProposeCodeFix(code, lang, first);
    if (!fix) return first;

    const retryApproved = await requestPermission({
        title: `Retry ${lang} script with a fix?`,
        detail: `Original run failed:\n${(first.output || first.message || '').slice(0, 500)}\n\nProposed fix (${fix.reason || 'diagnosed automatically'}):\n${fix.fixedCode.slice(0, 400)}${fix.fixedCode.length > 400 ? '\n…' : ''}\n\nWrite the corrected code to the same file and run it again?`,
        danger: true, severity: 'high'
    });
    if (!retryApproved) return { ...first, message: first.message + ' (a fix was proposed but declined)' };

    await fsp.writeFile(file, fix.fixedCode, 'utf8');
    const second = await execScriptRaw(exe, file, lang);
    return {
        success: second.success,
        message: second.success
            ? `First attempt failed; retried with a corrected version (${fix.reason || 'diagnosed fix'}) → succeeded.`
            : `Both the original code and the diagnosed fix failed. Original: ${first.message} | Retry: ${second.message}`,
        output: second.output,
        path: file
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT READER
// ─────────────────────────────────────────────────────────────────────────────
async function readDocument({ path: p, analyze } = {}) {
    return fsRead({ path: p, analyze: analyze || 'Summarize the key points concisely.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING FILE GENERATION
// ─────────────────────────────────────────────────────────────────────────────
async function genFile({ topic, ext, filename, targetPath, directory = 'downloads' }) {
    const label = FTYPES[ext] || ext.toUpperCase();
    broadcast('thinking', { message: `Generating ${label} — "${filename}"…` });

    let filepath;
    if (targetPath) {
        filepath = resolvePath(targetPath);
        await fsp.mkdir(path.dirname(filepath), { recursive: true });
    } else {
        const roots = {
            downloads: path.join(os.homedir(), 'Downloads'),
            desktop: path.join(os.homedir(), 'Desktop'),
            documents: path.join(os.homedir(), 'Documents')
        };
        filepath = path.join(roots[directory] || roots.downloads, filename);
        try { await fsp.mkdir(path.dirname(filepath), { recursive: true }); } catch { }
    }

    if (ext === 'docx') return genDocx({ topic, filepath });
    if (ext === 'pdf') return genPDF({ topic, filepath });

    const hints = {
        html: '- Complete self-contained page, dark modern design, inline CSS/JS, responsive\n- Footer: "Built with Wizard Autopilot by Arnav Gupta"',
        py: '- Docstrings, type hints, fully runnable, __main__ guard',
        cpp: '- All #include headers, main() function, modern C++17',
        c: '- All #include headers, main() function, ANSI C89 compatible',
        java: '- Proper public class with main()',
        rs: '- fn main() included, idiomatic Rust',
        sh: '- #!/bin/bash shebang, set -euo pipefail, comments',
        md: '- Proper headings, code blocks, tables, badges where appropriate',
        json: '- Valid JSON only, no trailing commas',
        csv: '- Valid CSV with headers, at least 5 sample rows',
        sql: '- CREATE TABLE(s) + sample INSERTs, standard SQL',
        svg: '- Valid SVG, viewBox set, visually interesting artwork/icon, all inline',
        env: '- All keys prefixed consistently, sensible placeholder values, grouped by section',
        dockerfile: '- Multi-stage build, non-root USER, HEALTHCHECK',
        vue: '- <script setup> Composition API, <template>, <style scoped>',
        astro: '- Frontmatter, component, typed props',
    };

    const sys = `You are an expert ${label} developer/writer. Return ONLY the raw file content — no markdown fences, no preamble, no commentary.`;
    const user = `Create a complete, production-quality ${label} file for: "${topic}"\n\nRequirements:\n- No placeholder text — real, specific, complete content\n${hints[ext] || '- Well-commented code'}\n\nReturn ONLY the file content, nothing else.`;

    let ws;
    try { ws = fs.createWriteStream(filepath, { encoding: 'utf8' }); }
    catch (e) { return FAIL(`Cannot create file at ${filepath}: ${e.message}`); }

    broadcast('stream-start', { filename, ext, label });

    let chunkCount = 0;
    const streamResult = await llmStream({ sys, user, maxTokens: 8192, temp: 0.3 }, (delta, full) => {
        ws.write(delta);
        chunkCount++;
        if (chunkCount % 20 === 0) broadcast('stream-chunk', { preview: full.slice(-200) });
    });

    await new Promise(r => { ws.end(r); });

    if (!streamResult.ok || !streamResult.text.trim()) {
        try { fs.unlinkSync(filepath); } catch { }
        return FAIL(`Generation failed: ${streamResult.err || 'empty response'}`);
    }

    let content = streamResult.text
        .replace(/^```[\w-]*\r?\n?/m, '').replace(/\r?\n?```\s*$/m, '').trim();
    if (content !== streamResult.text.trim()) fs.writeFileSync(filepath, content, 'utf8');

    broadcast('stream-end', { filename, filepath });
    telLog('file_generated', { ext, size: content.length });

    if (ext === 'html') doBrowserOpen({ url: `file://${filepath}` });
    else shell.openPath(filepath).catch(() => { });

    memLogProjectFile(filename, filepath);
    return OK(`${label} created at ${filepath}`);
}

async function genDocx({ topic, filepath }) {
    const d = getDocx();
    if (!d) return FAIL('docx package missing — run: npm install docx');
    const r = await llmCall({
        role: 'complex',
        sys: 'Return ONLY valid JSON, no markdown, no extra text.',
        user: `Write a professional Word document about: "${topic}". Return ONLY: {"title":"...","sections":[{"heading":"...","paragraphs":["..."],"bullets":["..."]}]}`,
        maxTokens: 4096, temp: 0.4, json: true, timeout: 60000
    });
    if (!r.ok) return FAIL(`LLM failed: ${r.err}`);
    let data = extractJSON(r.text);
    if (!data) return FAIL('Could not parse document structure');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = d;
    const ch = [];
    ch.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: data.title || topic, bold: true, size: 48, font: 'Arial' })] }));
    for (const s of (data.sections || [])) {
        if (s.heading) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 }, children: [new TextRun({ text: s.heading, bold: true, size: 28, font: 'Arial', color: '2E4057' })] }));
        for (const p of (s.paragraphs || [])) ch.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: p, size: 24, font: 'Arial' })] }));
        for (const b of (s.bullets || [])) ch.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 100 }, children: [new TextRun({ text: b, size: 24, font: 'Arial' })] }));
    }
    ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: 'Built with Wizard Autopilot by Arnav Gupta', size: 18, color: '888888', italics: true, font: 'Arial' })] }));
    const doc = new Document({ styles: { default: { document: { run: { font: 'Arial', size: 24 } } } }, sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: ch }] });
    try {
        fs.writeFileSync(filepath, await Packer.toBuffer(doc));
        shell.openPath(filepath).catch(() => { });
        memLogProjectFile(path.basename(filepath), filepath);
        return OK(`Word document created at ${filepath}`);
    } catch (e) { return FAIL(`DOCX write error: ${e.message}`); }
}

async function genPDF({ topic, filepath }) {
    const htmlPath = filepath.replace(/\.pdf$/, '.html');
    const r = await llmCall({
        role: 'complex',
        sys: 'Return ONLY raw HTML starting with <!DOCTYPE html>. White background, serif font, professional print layout. No markdown fences.',
        user: `Create a print-ready HTML document about: "${topic}". Inline everything. No external resources.`,
        maxTokens: 6000, temp: 0.25, timeout: 60000
    });
    const html = (r.ok && r.text.includes('<!DOCTYPE'))
        ? r.text.replace(/^```html?\r?\n?|```$/gm, '').trim()
        : `<!DOCTYPE html><html><head><style>body{font-family:Georgia,serif;max-width:800px;margin:auto;padding:40px;line-height:1.7}</style></head><body><h1>${topic}</h1><p>Generated by Wizard Autopilot.</p></body></html>`;
    fs.writeFileSync(htmlPath, html, 'utf8');
    doBrowserOpen({ url: `file://${htmlPath}` });
    memLogProjectFile(path.basename(htmlPath), htmlPath);
    return OK(`PDF source ready at ${htmlPath} — Ctrl+P → Save as PDF`);
}

// ─────────────────────────────────────────────────────────────────────────────
// VISION
// ─────────────────────────────────────────────────────────────────────────────
async function doAnalyseScreen({ query = 'Describe what is on the screen' } = {}) {
    broadcast('thinking', { message: 'Capturing screen for analysis…' });
    const ss = await doScreenshot();
    if (!ss.success || !ss.base64) return FAIL('Could not capture screen for analysis');
    const r = await llmCall({ role: 'vision', sys: 'You are a vision model analysing a computer screenshot. Be concise and specific.', user: query, visionImage: ss.base64, maxTokens: 800, temp: 0.3, timeout: 30000 });
    return r.ok ? { success: true, message: r.text.trim() } : FAIL(`Vision: ${r.err}`);
}
async function doAnalyseBrowser({ query = 'Describe what is on the page' } = {}) {
    if (!ensureBrowser()) return FAIL('Browser not open');
    broadcast('thinking', { message: 'Capturing browser for analysis…' });
    const ss = await doBrowserScreenshot();
    if (!ss.success || !ss.base64) return FAIL('Could not capture browser for analysis');
    const r = await llmCall({ role: 'vision', sys: 'You are analysing a browser screenshot. Be concise and specific.', user: query, visionImage: ss.base64, maxTokens: 800, temp: 0.3, timeout: 30000 });
    return r.ok ? { success: true, message: r.text.trim() } : FAIL(`Vision: ${r.err}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// NUT-JS OS CONTROL
// ─────────────────────────────────────────────────────────────────────────────
async function nutMove({ x, y }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try { await n.mouse.move(n.straightTo(new n.Point(x, y))); return OK(`Mouse → (${x}, ${y})`); }
    catch (e) { return FAIL(`Move: ${e.message}`); }
}
async function nutClick({ x, y, button = 'left' }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try {
        const btn = button === 'right' ? n.Button.RIGHT : button === 'middle' ? n.Button.MIDDLE : n.Button.LEFT;
        if (x != null) await n.mouse.move(n.straightTo(new n.Point(x, y)));
        await n.mouse.click(btn);
        return OK(`Clicked ${button}${x != null ? ` at (${x}, ${y})` : ''}`);
    } catch (e) { return FAIL(`Click: ${e.message}`); }
}
async function nutDbl({ x, y }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try { if (x != null) await n.mouse.move(n.straightTo(new n.Point(x, y))); await n.mouse.doubleClick(n.Button.LEFT); return OK(`Double-clicked${x != null ? ` at (${x}, ${y})` : ''}`); }
    catch (e) { return FAIL(`DblClick: ${e.message}`); }
}
async function nutScroll({ direction = 'down', amount = 3 }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try { direction === 'up' ? await n.mouse.scrollUp(amount) : await n.mouse.scrollDown(amount); return OK(`Scrolled ${direction} ×${amount}`); }
    catch (e) { return FAIL(`Scroll: ${e.message}`); }
}
async function nutDrag({ fromX, fromY, toX, toY }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try { await n.mouse.drag(n.straightTo(new n.Point(fromX, fromY)), n.straightTo(new n.Point(toX, toY))); return OK(`Dragged (${fromX},${fromY}) → (${toX},${toY})`); }
    catch (e) { return FAIL(`Drag: ${e.message}`); }
}
async function nutType({ text }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try { await n.keyboard.type(text); return OK(`Typed: "${text.slice(0, 60)}"`); }
    catch (e) { return FAIL(`Type: ${e.message}`); }
}
async function nutKey({ keys }) {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    if (!n.Key) return FAIL('nutJS Key map unavailable');
    const KM = {
        enter: n.Key.Return, return: n.Key.Return, escape: n.Key.Escape, esc: n.Key.Escape,
        tab: n.Key.Tab, space: n.Key.Space, backspace: n.Key.Backspace, delete: n.Key.Delete,
        up: n.Key.Up, down: n.Key.Down, left: n.Key.Left, right: n.Key.Right,
        home: n.Key.Home, end: n.Key.End, pageup: n.Key.PageUp, pagedown: n.Key.PageDown,
        f1: n.Key.F1, f2: n.Key.F2, f3: n.Key.F3, f4: n.Key.F4, f5: n.Key.F5, f6: n.Key.F6,
        f7: n.Key.F7, f8: n.Key.F8, f9: n.Key.F9, f10: n.Key.F10, f11: n.Key.F11, f12: n.Key.F12,
        ctrl: n.Key.LeftControl, shift: n.Key.LeftShift, alt: n.Key.LeftAlt,
        win: n.Key.LeftSuper, super: n.Key.LeftSuper,
        a: n.Key.A, b: n.Key.B, c: n.Key.C, d: n.Key.D, e: n.Key.E, f: n.Key.F, g: n.Key.G,
        h: n.Key.H, i: n.Key.I, j: n.Key.J, k: n.Key.K, l: n.Key.L, m: n.Key.M, n: n.Key.N,
        o: n.Key.O, p: n.Key.P, q: n.Key.Q, r: n.Key.R, s: n.Key.S, t: n.Key.T, u: n.Key.U,
        v: n.Key.V, w: n.Key.W, x: n.Key.X, y: n.Key.Y, z: n.Key.Z,
    };
    try {
        const resolved = keys.map(k => { const m = KM[k.toLowerCase()]; if (!m) throw new Error(`Unknown key: "${k}"`); return m; });
        if (resolved.length === 1) { await n.keyboard.pressKey(resolved[0]); await n.keyboard.releaseKey(resolved[0]); }
        else { await n.keyboard.pressKey(...resolved); await n.keyboard.releaseKey(...resolved); }
        return OK(`Pressed: ${keys.join('+')}`);
    } catch (e) { return FAIL(`Key: ${e.message}`); }
}
async function nutPos() {
    const n = getNut(); if (!n) return FAIL('nutJS not installed');
    try { const p = await n.mouse.getPosition(); return OK(`Mouse: (${Math.round(p.x)}, ${Math.round(p.y)})`); }
    catch (e) { return FAIL(`Pos: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM TRAY
// ─────────────────────────────────────────────────────────────────────────────
function createTray() {
    if (tray) return;
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    let trayIcon;
    if (fs.existsSync(iconPath)) {
        trayIcon = nativeImage.createFromPath(iconPath);
    } else {
        const GOLD_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
        trayIcon = nativeImage.createFromDataURL(`data:image/png;base64,${GOLD_PNG_B64}`);
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
    tray = new Tray(trayIcon);
    tray.setToolTip('Wizard Autopilot  ·  Ctrl+Shift+A');
    const ctxMenu = Menu.buildFromTemplate([
        { label: '✦ Show Wizard', click: () => showOrCreateMain() },
        { label: '✦ Toggle Overlay', click: () => toggleOverlay() },
        { type: 'separator' },
        { label: 'Quit Wizard', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(ctxMenu);
    tray.on('double-click', () => showOrCreateMain());
}

function showOrCreateMain() {
    if (!mainWin || mainWin.isDestroyed()) {
        createMain();
    } else {
        mainWin.show();
        mainWin.focus();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AHK BRIDGE
// ─────────────────────────────────────────────────────────────────────────────
let ahkPollTimer = null;

function startAhkBridge() {
    if (ahkPollTimer) return;
    ahkPollTimer = setInterval(() => {
        try {
            const t = AHK_TRIGGER();
            if (fs.existsSync(t)) {
                fs.unlinkSync(t);
                toggleOverlay();
            }
        } catch { }
    }, 250);
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function ovPos() {
    const d = eScreen.getDisplayNearestPoint(eScreen.getCursorScreenPoint());
    return {
        x: Math.round(d.bounds.x + (d.workAreaSize.width - OV_W) / 2),
        y: Math.round(d.bounds.y + d.workAreaSize.height * 0.28),
        maxY: d.bounds.y + d.workAreaSize.height - 30
    };
}
function createOverlay() {
    if (overlayWin && !overlayWin.isDestroyed()) return;
    overlayWin = new BrowserWindow({
        width: OV_W, height: OV_MIN_H,
        frame: false, transparent: true, resizable: false,
        skipTaskbar: true, alwaysOnTop: true, focusable: true, show: false,
        type: process.platform === 'linux' ? 'toolbar' : undefined,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    overlayWin.loadFile(path.join(__dirname, 'overlay.html'));
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    overlayWin.on('blur', () => {
        setTimeout(() => { if (overlayWin && !overlayWin.isDestroyed() && !overlayWin.isFocused()) overlayWin.hide(); }, 160);
    });
    overlayWin.on('closed', () => { overlayWin = null; });
}
function showOverlay() {
    if (!overlayWin || overlayWin.isDestroyed()) createOverlay();
    const { x, y } = ovPos();
    overlayWin.setPosition(x, y);
    overlayWin.setSize(OV_W, OV_MIN_H);
    if (overlayWin.webContents.isLoading()) {
        overlayWin.webContents.once('did-finish-load', () => { overlayWin.show(); overlayWin.focus(); overlayWin.webContents.send('overlay-init', { offsetY: 0 }); });
    } else {
        overlayWin.show(); overlayWin.focus();
        overlayWin.webContents.send('overlay-focus');
        overlayWin.webContents.send('overlay-clear');
    }
}
function hideOverlay() { overlayWin?.hide(); }
function toggleOverlay() {
    if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) hideOverlay();
    else showOverlay();
}

ipcMain.on('overlay-hide', () => hideOverlay());
ipcMain.on('overlay-resize', (_e, { h }) => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    const { maxY } = ovPos();
    const newH = Math.min(Math.max(h || OV_MIN_H, OV_MIN_H), OV_MAX_H);
    const [px, py] = overlayWin.getPosition();
    const cy = Math.min(py, maxY - newH);
    overlayWin.setSize(OV_W, newH);
    if (cy !== py) overlayWin.setPosition(px, cy);
});
ipcMain.on('voice-input', async (_e, { text }) => {
    if (!text?.trim()) return;
    const result = await executeCommand(text.trim(), _e);
    overlayWin?.webContents.send('voice-result', result);
    mainWin?.webContents.send('voice-result', result);
});

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER CHROME
// ─────────────────────────────────────────────────────────────────────────────
function getBrowserChrome() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#080612;--gold:#c9a84c;--gd:rgba(201,168,76,.5);--gf:rgba(201,168,76,.1);--b:rgba(201,168,76,.2);--sv:#d4d0e8;--mu:rgba(212,208,232,.4);--ok:#22c55e;--T:${TOP_H}px;--B:${WIZ_BAR_H}px}
html,body{width:100%;height:100%;overflow:hidden;background:var(--ink);color:var(--sv);font-family:'Segoe UI',system-ui,sans-serif}
.tb{position:fixed;top:0;left:0;right:0;height:var(--T);background:rgba(8,6,18,.98);border-bottom:1px solid var(--b);display:flex;align-items:center;gap:6px;padding:0 10px;-webkit-app-region:drag;z-index:100}
.tb>*{-webkit-app-region:no-drag}
.nb{background:var(--gf);border:1px solid var(--b);border-radius:8px;color:var(--mu);width:30px;height:30px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
.nb:hover{color:var(--gold);border-color:var(--gd);background:rgba(201,168,76,.15)}.nb:disabled{opacity:.3;cursor:not-allowed}
.url{flex:1;height:30px;background:rgba(0,0,0,.35);border:1px solid var(--b);border-radius:20px;padding:0 14px;color:var(--sv);font-size:12.5px;outline:none}
.url:focus{border-color:var(--gd)}
.brand{font-size:11px;font-weight:600;color:var(--gold);letter-spacing:.12em;opacity:.8;padding:0 6px;flex-shrink:0}
.wc{display:flex;gap:6px;margin-left:4px}
.bt{width:12px;height:12px;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;transition:filter .15s}.bt:hover{filter:brightness(1.4)}
.mn{background:#8b6914}.mx{background:#1a4a1a}.cl{background:#8b2020}
.sp{position:fixed;top:var(--T);left:0;right:0;bottom:var(--B);pointer-events:none}
.wb{position:fixed;bottom:0;left:0;right:0;height:var(--B);background:rgba(8,6,18,.98);border-top:1px solid var(--b);display:flex;align-items:center;gap:8px;padding:0 12px;z-index:100}
.wg{font-size:20px;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(201,168,76,.4))}
.wi{flex:1;height:34px;background:rgba(14,11,30,.8);border:1px solid var(--b);border-radius:20px;padding:0 16px;color:var(--sv);font-size:13.5px;outline:none;font-family:'Segoe UI',system-ui,sans-serif}
.wi::placeholder{color:var(--mu);font-style:italic}.wi:focus{border-color:rgba(201,168,76,.5);box-shadow:0 0 0 3px rgba(201,168,76,.07)}
.wbtn{background:linear-gradient(135deg,var(--gold),#a8751e);border:none;border-radius:20px;padding:0 18px;height:34px;color:#080612;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;transition:opacity .15s,transform .15s}
.wbtn:hover:not(:disabled){opacity:.88;transform:translateY(-1px)}.wbtn:disabled{opacity:.35;cursor:not-allowed}
.ws{font-size:11px;color:var(--mu);font-style:italic;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0}
.ws.ok{color:var(--ok);font-style:normal}.ws.er{color:#e07070;font-style:normal}.ws.bu{color:var(--gold)}
@keyframes dp{0%,60%,100%{opacity:.3}30%{opacity:1}}
.dt span{animation:dp 1.2s infinite}.dt span:nth-child(2){animation-delay:.2s}.dt span:nth-child(3){animation-delay:.4s}
</style></head><body>
<div class="tb">
  <div class="brand">✦ WIZARD</div>
  <button class="nb" id="bk" onclick="ipcRenderer.send('bw-back')">◀</button>
  <button class="nb" id="fw" onclick="ipcRenderer.send('bw-forward')">▶</button>
  <button class="nb" onclick="ipcRenderer.send('bw-refresh')">↻</button>
  <input class="url" id="url" spellcheck="false" placeholder="https://"
    onkeydown="if(event.key==='Enter'){let u=this.value.trim();if(!/^https?:\\/\\//.test(u))u='https://'+u;ipcRenderer.send('bw-navigate',u)}">
  <div class="wc">
    <button class="bt mn" onclick="ipcRenderer.send('bw-min')"></button>
    <button class="bt mx" onclick="ipcRenderer.send('bw-max')"></button>
    <button class="bt cl" onclick="ipcRenderer.send('bw-close')"></button>
  </div>
</div>
<div class="sp"></div>
<div class="wb">
  <span class="wg">🧙</span>
  <input class="wi" id="wi" autocomplete="off"
    placeholder="Cast a spell… 'click Sign In' · 'scroll down' · 'create a py script' · 'list Downloads'">
  <span class="ws" id="ws"></span>
  <button class="wbtn" id="wb" onclick="cast()">✦ Cast</button>
</div>
<script>
const{ipcRenderer}=require('electron');
const wi=document.getElementById('wi'),wbtn=document.getElementById('wb'),ws=document.getElementById('ws'),url=document.getElementById('url');
let busy=false;
async function cast(){
  const cmd=wi.value.trim();if(!cmd||busy)return;
  wi.value='';busy=true;wbtn.disabled=true;
  st('bu','<span class="dt"><span>●</span><span>●</span><span>●</span></span>');
  try{
    const r=await ipcRenderer.invoke('execute-command',cmd);
    const m=(r.message||'Done.').slice(0,140);
    st(r.success?'ok':'er',m);
    ipcRenderer.send('bw-result',{command:cmd,success:r.success,message:r.message||''});
    setTimeout(()=>{if(!busy)st('','')},7000);
  }catch(e){st('er','Error: '+e.message);}
  finally{busy=false;wbtn.disabled=false;wi.focus();}
}
function st(c,h){ws.className='ws'+(c?' '+c:'');ws.innerHTML=h;}
wi.addEventListener('keydown',e=>{if(e.key==='Enter')cast();});
ipcRenderer.on('bw-url',(_,u)=>{url.value=u;});
ipcRenderer.on('bw-nav',(_,{back,fwd})=>{document.getElementById('bk').disabled=!back;document.getElementById('fw').disabled=!fwd;});
ipcRenderer.on('bw-st',(_,{c,m})=>st(c,m));
<\/script></body></html>`;
}

function ensureBrowserListeners() {
    if (bwListenersAttached) return;
    bwListenersAttached = true;
    ipcMain.on('bw-back', () => webView?.webContents.goBack());
    ipcMain.on('bw-forward', () => webView?.webContents.goForward());
    ipcMain.on('bw-refresh', () => webView?.webContents.reload());
    ipcMain.on('bw-min', () => browserWin?.minimize());
    ipcMain.on('bw-max', () => browserWin?.isMaximized() ? browserWin.unmaximize() : browserWin?.maximize());
    ipcMain.on('bw-close', () => browserWin?.close());
    ipcMain.on('bw-navigate', (_e, url) => loadInView(url));
    ipcMain.on('bw-result', (_e, data) => mainWin?.webContents.send('browser-command-result', data));
}

function getBrowserWin() {
    if (browserWin && !browserWin.isDestroyed()) return browserWin;
    ensureBrowserListeners();
    browserWin = new BrowserWindow({
        width: 1280, height: 900, minWidth: 800, minHeight: 500,
        title: 'Wizard Browser', frame: false, titleBarStyle: 'hidden',
        backgroundColor: '#080612',
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        show: false
    });
    browserWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getBrowserChrome()));
    browserWin.once('ready-to-show', () => { attachView(); browserWin.show(); });
    browserWin.on('resize', updateViewBounds);
    browserWin.on('closed', () => { webView = null; browserWin = null; broadcast('browser-closed', {}); });
    return browserWin;
}

function attachView() {
    if (!browserWin || browserWin.isDestroyed()) return;
    webView = new BrowserView({
        webPreferences: {
            nodeIntegration: false, contextIsolation: true,
            webSecurity: false, allowRunningInsecureContent: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
    });
    browserWin.setBrowserView(webView);
    updateViewBounds();
    const wc = webView.webContents;
    wc.on('did-navigate', (_, u) => { syncBar(u); injectHelper(); broadcast('browser-url', { url: u }); });
    wc.on('did-navigate-in-page', (_, u) => { syncBar(u); broadcast('browser-url', { url: u }); });
    wc.on('did-finish-load', () => { updateViewBounds(); injectHelper(); syncBar(wc.getURL()); broadcast('browser-state', getBrowserState()); });
    wc.on('page-title-updated', (_, t) => { if (!browserWin?.isDestroyed()) browserWin.setTitle(`${t} — Wizard Browser`); broadcast('browser-title', { title: t }); });
}

function updateViewBounds() {
    if (!webView || !browserWin || browserWin.isDestroyed()) return;
    const [w, h] = browserWin.getContentSize();
    webView.setBounds({ x: 0, y: TOP_H, width: w, height: Math.max(0, h - TOP_H - WIZ_BAR_H) });
    webView.setAutoResize({ width: true, height: true });
}

function syncBar(url) {
    if (!browserWin || browserWin.isDestroyed()) return;
    browserWin.webContents.send('bw-url', url);
    const wc = webView?.webContents;
    browserWin.webContents.send('bw-nav', { back: wc?.canGoBack() ?? false, fwd: wc?.canGoForward() ?? false });
}

function loadInView(url) {
    if (!url) return;
    if (!/^(https?:\/\/|file:\/\/)/.test(url)) url = 'https://' + url;
    if (!webView) attachView();
    webView.webContents.loadURL(url);
}

function injectHelper() {
    if (!webView || webView.webContents.isDestroyed()) return;
    webView.webContents.executeJavaScript(`
(function(){if(window.__wiz)return;window.__wiz=true;
function mark(){document.querySelectorAll('a,button,input,select,[role="button"],[role="link"],[role="menuitem"],[role="tab"],label,[onclick]')
.forEach(el=>{const t=(el.innerText||el.value||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'').trim();
if(t)el.setAttribute('data-wiz',t.toLowerCase().slice(0,200));});}
mark();new MutationObserver(mark).observe(document.body,{childList:true,subtree:true});
})();`).catch(() => { });
}

function broadcast(channel, data) { mainWin?.webContents.send(channel, data); }

function getBrowserState() {
    if (!browserWin || browserWin.isDestroyed() || !webView) return { open: false };
    const wc = webView.webContents;
    return { open: true, url: wc.getURL(), title: wc.getTitle(), canGoBack: wc.canGoBack(), canGoFwd: wc.canGoForward() };
}

function ensureBrowser() { return browserWin && !browserWin.isDestroyed() && webView; }

// ─────────────────────────────────────────────────────────────────────────────
// TAB MANAGER
// ─────────────────────────────────────────────────────────────────────────────
async function doNewTab({ url } = {}) {
    const id = ++tabIdCounter;
    const win = getBrowserWin();
    const view = new BrowserView({
        webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false, allowRunningInsecureContent: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' }
    });
    tabRegistry.set(id, { view, url: url || 'about:blank', title: 'New Tab' });
    activeTabId = id; webView = view;
    win.setBrowserView(view); updateViewBounds();
    view.webContents.on('page-title-updated', (_, t) => {
        if (tabRegistry.has(id)) tabRegistry.get(id).title = t;
        broadcast('tabs-updated', [...tabRegistry.entries()].map(([tid, t]) => ({ id: tid, title: t.title, url: t.url, active: tid === activeTabId })));
    });
    view.webContents.on('did-navigate', (_, u) => { if (tabRegistry.has(id)) tabRegistry.get(id).url = u; });
    if (url) view.webContents.loadURL(url.startsWith('http') ? url : 'https://' + url);
    win.show(); win.focus();
    broadcast('tabs-updated', [...tabRegistry.entries()].map(([tid, t]) => ({ id: tid, title: t.title, url: t.url, active: tid === activeTabId })));
    return OK(`Tab ${id} opened${url ? `: ${url}` : ''}`);
}
async function doSwitchTab({ name }) {
    const n = (name || '').toLowerCase();
    for (const [id, t] of tabRegistry) {
        if ((t.title || '').toLowerCase().includes(n) || (t.url || '').toLowerCase().includes(n)) {
            activeTabId = id; webView = t.view;
            const win = getBrowserWin(); win.setBrowserView(t.view); updateViewBounds(); win.show(); win.focus();
            return OK(`Switched to tab: "${t.title || t.url}"`);
        }
    }
    return FAIL(`No tab matching "${name}"`);
}
async function doCloseTab({ name } = {}) {
    if (!name && activeTabId) {
        const t = tabRegistry.get(activeTabId);
        tabRegistry.delete(activeTabId);
        try { t?.view.webContents.destroy(); } catch { }
        const next = tabRegistry.keys().next().value;
        if (next !== undefined) { activeTabId = next; webView = tabRegistry.get(next).view; getBrowserWin().setBrowserView(webView); }
        else { activeTabId = null; webView = null; }
        return OK('Tab closed');
    }
    return doSwitchTab({ name });
}
async function doListTabs() {
    if (!tabRegistry.size) return OK('No tabs open');
    const list = [...tabRegistry.entries()].map(([id, t]) => `[${id}${id === activeTabId ? ' ●' : ''}] ${t.title || t.url}`).join('\n');
    return { success: true, message: `Open tabs:\n${list}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function doBrowserOpen({ url }) {
    if (!url) return FAIL('No URL');
    if (!/^(https?:\/\/|file:\/\/)/.test(url)) url = 'https://' + url;
    const win = getBrowserWin();
    if (!webView) attachView();
    loadInView(url); win.show(); win.focus();
    setTimeout(() => browserWin?.webContents.send('bw-st', { c: 'ok', m: url.slice(0, 80) }), 600);
    return OK(`Browser: ${url}`);
}
async function doBrowserNav({ url }) {
    if (!browserWin?.isDestroyed()) { loadInView(url); browserWin.focus(); return OK(`→ ${url}`); }
    return doBrowserOpen({ url });
}
async function doBrowserClose() { browserWin?.close(); tabRegistry.clear(); return OK('Browser closed'); }
async function doBrowserBack() { if (!ensureBrowser()) return FAIL('Browser not open'); if (webView.webContents.canGoBack()) { webView.webContents.goBack(); return OK('Back'); } return FAIL('Nothing to go back to'); }
async function doBrowserFwd() { if (!ensureBrowser()) return FAIL('Browser not open'); if (webView.webContents.canGoForward()) { webView.webContents.goForward(); return OK('Forward'); } return FAIL('Nothing to go forward to'); }
async function doBrowserRefresh() { if (!ensureBrowser()) return FAIL('Browser not open'); webView.webContents.reload(); return OK('Refreshed'); }
async function doBrowserScroll({ dir = 'down', amount = 600 }) {
    if (!ensureBrowser()) return FAIL('Browser not open');
    await webView.webContents.executeJavaScript(`window.scrollBy({top:${dir === 'up' ? -amount : amount},behavior:'smooth'})`);
    return OK(`Scrolled ${dir}`);
}
/**
 * Detects "click the Nth thing" phrasing WITHOUT hijacking legitimate text
 * matches that merely contain an ordinal-sounding word (e.g. "First
 * National Bank", a button literally labeled "First"). Only treats it as
 * an ordinal request if, after stripping the ordinal, what's left is
 * empty or a generic list-item noun ("result", "item", "product", ...).
 * Returns an integer (1-based; -1 means "last") or null if this isn't an
 * ordinal-style request at all.
 */
function parseOrdinalClickTarget(text) {
    const t = (text || '').toLowerCase().trim();
    const wordMap = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, top: 1, last: -1 };
    const genericNouns = ['result', 'results', 'item', 'items', 'product', 'products', 'link', 'links', 'one', 'entry', 'entries', 'listing', 'listings', 'option', 'options', 'row', 'card'];

    let ordVal = null, matchedWord = null;
    for (const [word, n] of Object.entries(wordMap)) {
        if (new RegExp('^(the\\s+)?' + word + '\\b').test(t)) { ordVal = n; matchedWord = word; break; }
    }
    let m;
    if (ordVal === null && (m = t.match(/^(the\s+)?#?(\d+)(st|nd|rd|th)?\b/))) { ordVal = parseInt(m[2], 10); matchedWord = m[0]; }
    if (ordVal === null) return null;

    const rest = t.replace(new RegExp('^(the\\s+)?(' + matchedWord + '|#?\\d+(st|nd|rd|th)?)\\b'), '').trim();
    if (rest === '' || genericNouns.some(n => rest === n || rest === n + 's' || rest.startsWith(n + ' '))) {
        return ordVal;
    }
    return null; // ordinal-sounding but attached to specific named content — don't hijack it
}

/**
 * Resolves "the Nth result/item/product" structurally, no vision/screenshot
 * needed — this is a DOM-structure problem, not a visual one. Candidates
 * are clickable links that look like list/grid entries (contain an image
 * or a heading, have real text, aren't in the page chrome), deduped so
 * nested links for the same card don't get counted twice, sorted in
 * reading order (top-to-bottom, left-to-right) so "first" means what a
 * human looking at the page would mean by it.
 */
async function doBrowserClickNth({ n } = {}) {
    if (!ensureBrowser()) return FAIL('Browser not open. Open a website first.');
    if (typeof n !== 'number' || n === 0) return FAIL('Invalid position — use a positive number, or -1 for "last".');

    const js = `(function(n){
function visible(el){ return el.offsetParent !== null; }
function inChrome(el){ return el.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"]') !== null; }
const all=[...document.querySelectorAll('a[href]')].filter(a=>{
  if(!visible(a)||inChrome(a)) return false;
  const hasImg=a.querySelector('img');
  const hasHeading=a.querySelector('h1,h2,h3,h4,h5,h6')||a.closest('h1,h2,h3,h4,h5,h6');
  const text=(a.innerText||'').trim();
  return (hasImg||hasHeading)&&text.length>8;
});
const withRects=all.map(a=>({el:a,r:a.getBoundingClientRect()}));
const deduped=withRects.filter(({el},i)=>!withRects.some(({el:o},j)=>i!==j&&o.contains(el)));
deduped.sort((a,b)=>(Math.round(a.r.top/10)-Math.round(b.r.top/10))||(a.r.left-b.r.left));
const idx = n<0 ? deduped.length+n : n-1;
const target = deduped[idx];
if(!target) return { total: deduped.length };
const el=target.el;
el.scrollIntoView({behavior:'smooth',block:'center'});
const label=(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,80);
setTimeout(()=>{el.click();['mousedown','mouseup','click'].forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true})));},250);
return { label, total: deduped.length, clicked: true };
})(${n})`;

    try {
        const r = await webView.webContents.executeJavaScript(js);
        if (r && r.clicked) {
            const m = `Clicked #${n < 0 ? 'last' : n} result: "${r.label}" (${r.total} candidates found)`;
            browserWin?.webContents.send('bw-st', { c: 'ok', m });
            return OK(m);
        }
        const total = r ? r.total : 0;
        return FAIL(`Couldn't find position ${n} — found ${total} result-like item(s) on this page. If this page doesn't look like a list/grid of results, try "analyse the screen" or describe what you see instead.`);
    } catch (e) { return FAIL(`Click: ${e.message}`); }
}

async function doBrowserClick({ text }) {
    if (!ensureBrowser()) return FAIL('Browser not open. Open a website first.');

    // Ordinal fallback: even if the model reaches for browser_click instead
    // of the dedicated browser_click_nth action, "first result"/"top
    // result"/"#2" etc. still resolves correctly instead of being fuzzy-
    // matched as a literal (and unmatchable) text string.
    const ord = parseOrdinalClickTarget(text);
    if (ord !== null) return doBrowserClickNth({ n: ord });

    const n = text.toLowerCase().trim();
    const js = `(function(){
const n=${JSON.stringify(n)};
function sc(el){const l=(el.getAttribute('data-wiz')||el.innerText||el.value||el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.title||'').toLowerCase().trim();return l===n?3:l.startsWith(n)?2:l.includes(n)?1:0;}
const best=[...document.querySelectorAll('a,button,input,select,[role="button"],[role="link"],[role="menuitem"],[role="tab"],label,[onclick],[tabindex]')]
.map(el=>({el,s:sc(el)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s)[0];
if(!best)return null;
const el=best.el;el.scrollIntoView({behavior:'smooth',block:'center'});
setTimeout(()=>{el.focus();el.click();['mousedown','mouseup','click'].forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true})));},250);
return{tag:el.tagName,label:(el.innerText||el.value||'').slice(0,80)};
})()`;
    try {
        const r = await webView.webContents.executeJavaScript(js);
        if (r) { const m = `Clicked "${r.label || text}" (${r.tag})`; browserWin?.webContents.send('bw-st', { c: 'ok', m }); return OK(m); }
        return FAIL(`No element matching "${text}"`);
    } catch (e) { return FAIL(`Click: ${e.message}`); }
}
async function doBrowserType({ text, pressEnter = false }) {
    if (!ensureBrowser()) return FAIL('Browser not open');
    const js = `(function(){
const els=[...document.querySelectorAll('input[type="text"],input[type="search"],input:not([type]),textarea')].filter(e=>!e.disabled&&!e.readOnly&&e.offsetParent!==null);
const el=(document.activeElement?.matches('input,textarea')?document.activeElement:null)||els[0];
if(!el)return false;
el.focus();el.value=${JSON.stringify(text)};
['input','change'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
${pressEnter ? `el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));` : ''}
return el.tagName+':'+(el.type||'text');
})()`;
    try { const r = await webView.webContents.executeJavaScript(js); if (r) return OK(`Typed into ${r}`); return FAIL('No input found'); }
    catch (e) { return FAIL(`Type: ${e.message}`); }
}
async function doBrowserTypeInto({ text, field }) {
    if (!ensureBrowser()) return FAIL('Browser not open');
    const fn = (field || '').toLowerCase();
    const js = `(function(){
const needle=${JSON.stringify(fn)};
const el=[...document.querySelectorAll('input,textarea,select')].filter(e=>!e.disabled&&!e.readOnly&&e.offsetParent!==null)
.find(e=>(e.placeholder||e.getAttribute('aria-label')||e.name||e.id||e.type||'').toLowerCase().includes(needle))||null;
if(!el)return false;
el.focus();el.value=${JSON.stringify(text)};
['input','change'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
return el.placeholder||el.name||el.tagName;
})()`;
    try { const r = await webView.webContents.executeJavaScript(js); if (r) return OK(`Typed into "${r}"`); return FAIL('Field not found'); }
    catch (e) { return FAIL(`TypeInto: ${e.message}`); }
}
async function doBrowserJS({ code }) {
    if (!ensureBrowser()) return FAIL('Browser not open');
    try { const r = await webView.webContents.executeJavaScript(code); return { success: true, message: `JS: ${String(r ?? '').slice(0, 300)}`, output: String(r ?? '') }; }
    catch (e) { return FAIL(`JS: ${e.message}`); }
}
async function doBrowserRead() {
    if (!ensureBrowser()) return FAIL('Browser not open');
    const js = `JSON.stringify({url:location.href,title:document.title,
h:[...document.querySelectorAll('h1,h2,h3')].slice(0,10).map(h=>h.innerText.trim()).filter(Boolean),
btn:[...document.querySelectorAll('button,[role="button"]')].slice(0,15).map(b=>(b.innerText||b.value||'').trim()).filter(Boolean),
a:[...document.querySelectorAll('a')].slice(0,15).map(a=>a.innerText.trim()).filter(Boolean),
inp:[...document.querySelectorAll('input,textarea,select')].slice(0,10).map(i=>(i.placeholder||i.getAttribute('aria-label')||i.name||'').trim()).filter(Boolean),
body:document.body.innerText.slice(0,1800)})`;
    try {
        const d = JSON.parse(await webView.webContents.executeJavaScript(js));
        const out = [`URL: ${d.url}`, `Title: ${d.title}`, d.h.length ? `Headings: ${d.h.join(' · ')}` : null, d.btn.length ? `Buttons: ${d.btn.slice(0, 10).join(', ')}` : null, d.a.length ? `Links: ${d.a.slice(0, 10).join(', ')}` : null, d.inp.length ? `Fields: ${d.inp.join(', ')}` : null, `\n${d.body}`].filter(Boolean).join('\n');
        return { success: true, message: out, pageData: d };
    } catch (e) { return FAIL(`Read: ${e.message}`); }
}
async function doBrowserScreenshot() {
    if (!ensureBrowser()) return FAIL('Browser not open');
    try {
        const img = await webView.webContents.capturePage();
        const dest = path.join(os.homedir(), 'Downloads', `wizard_browser_${Date.now()}.png`);
        fs.writeFileSync(dest, img.toPNG());
        return { success: true, message: `Browser screenshot saved to ${dest}`, base64: img.toPNG().toString('base64'), path: dest };
    } catch (e) { return FAIL(`Screenshot: ${e.message}`); }
}
async function doBrowserWait() {
    if (!ensureBrowser()) return FAIL('Browser not open');
    return new Promise(res => {
        const wc = webView.webContents;
        if (!wc.isLoading()) { res(OK('Page loaded')); return; }
        const t = setTimeout(() => res(OK('Timeout')), 15000);
        wc.once('did-finish-load', () => { clearTimeout(t); res(OK('Page loaded')); });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH ENGINES
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_ENGINES = {
    google: 'google', g: 'google',
    bing: 'bing',
    duckduckgo: 'duckduckgo', ddg: 'duckduckgo', duck: 'duckduckgo', duckduck: 'duckduckgo',
    youtube: 'youtube', yt: 'youtube',
    amazon: 'amazon', amzn: 'amazon',
    ebay: 'ebay', walmart: 'walmart',
    craigslist: 'craigslist', cl: 'craigslist',
    reddit: 'reddit', github: 'github', gh: 'github',
    stackoverflow: 'stackoverflow', so: 'stackoverflow', 'stack overflow': 'stackoverflow',
    arxiv: 'arxiv', npm: 'npm', pypi: 'pypi',
    brave: 'brave', yahoo: 'yahoo', ecosia: 'ecosia', startpage: 'startpage',
};

function searchUrl(engine, query) {
    const q = ENC(query);
    const map = {
        google: `https://www.google.com/search?q=${q}`,
        bing: `https://www.bing.com/search?q=${q}`,
        duckduckgo: `https://duckduckgo.com/?q=${q}`,
        youtube: `https://www.youtube.com/results?search_query=${q}`,
        amazon: `https://www.amazon.com/s?k=${q}`,
        ebay: `https://www.ebay.com/sch/i.html?_nkw=${q}`,
        walmart: `https://www.walmart.com/search?q=${q}`,
        craigslist: `https://craigslist.org/search/sss?query=${q}`,
        reddit: `https://www.reddit.com/search/?q=${q}`,
        github: `https://github.com/search?q=${q}`,
        stackoverflow: `https://stackoverflow.com/search?q=${q}`,
        arxiv: `https://arxiv.org/search/?searchtype=all&query=${q}`,
        npm: `https://www.npmjs.com/search?q=${q}`,
        pypi: `https://pypi.org/search/?q=${q}`,
        brave: `https://search.brave.com/search?q=${q}`,
        yahoo: `https://search.yahoo.com/search?p=${q}`,
        ecosia: `https://www.ecosia.org/search?q=${q}`,
        startpage: `https://www.startpage.com/search?q=${q}`,
    };
    return map[engine] || map.google;
}

async function doSearch({ query, engine = 'google' }) {
    const canonicalEngine = SEARCH_ENGINES[engine.toLowerCase().trim()] || 'google';
    const url = searchUrl(canonicalEngine, query);
    await doBrowserOpen({ url });
    return OK(`Searching ${canonicalEngine} for "${query}"`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREENSHOT / LIST / APP / SYSINFO / TIME / MATH / CLIPBOARD / REMINDER
// ─────────────────────────────────────────────────────────────────────────────
async function doScreenshot() {
    return new Promise(resolve => {
        const ts = Date.now(), fn = `wizard_ss_${ts}.png`;
        const dl = path.join(os.homedir(), 'Downloads', fn);
        const dt = path.join(os.homedir(), 'Desktop', fn);
        const sp = path.join(os.tmpdir(), `wiz_ss_${ts}.ps1`);

        if (process.platform === 'linux') {
            exec(`which scrot`, e1 => {
                if (!e1) {
                    exec(`scrot '${dl}'`, { timeout: 10000 }, e2 => {
                        if (!e2 && fs.existsSync(dl)) {
                            try { fs.copyFileSync(dl, dt); } catch { }
                            resolve({ success: true, message: `Screenshot saved to ${dl}`, base64: fs.readFileSync(dl).toString('base64'), path: dl });
                        } else resolve(FAIL('scrot failed'));
                    });
                } else {
                    exec(`gnome-screenshot -f '${dl}'`, { timeout: 10000 }, e3 => {
                        if (!e3 && fs.existsSync(dl)) resolve({ success: true, message: `Screenshot saved to ${dl}`, base64: fs.readFileSync(dl).toString('base64'), path: dl });
                        else resolve(FAIL('No screenshot tool found (install scrot)'));
                    });
                }
            });
            return;
        }
        if (process.platform === 'darwin') {
            exec(`screencapture -x '${dl}'`, { timeout: 10000 }, e => {
                if (!e && fs.existsSync(dl)) {
                    try { fs.copyFileSync(dl, dt); } catch { }
                    resolve({ success: true, message: `Screenshot saved to ${dl}`, base64: fs.readFileSync(dl).toString('base64'), path: dl });
                } else resolve(FAIL(`screencapture: ${e?.message}`));
            });
            return;
        }
        const ps = [
            'Add-Type -AssemblyName System.Windows.Forms', 'Add-Type -AssemblyName System.Drawing',
            '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
            '$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height)',
            '$g=[System.Drawing.Graphics]::FromImage($bmp)',
            '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)',
            `$bmp.Save('${dl.replace(/'/g, "''")}')`,
            '$g.Dispose();$bmp.Dispose()',
        ].join('\r\n');
        fs.writeFile(sp, ps, 'utf8', we => {
            if (we) { resolve(FAIL(`PS write: ${we.message}`)); return; }
            exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${sp}"`, { timeout: 20000 }, err => {
                fs.unlink(sp, () => { });
                if (!err && fs.existsSync(dl)) {
                    try { fs.copyFileSync(dl, dt); } catch { }
                    resolve({ success: true, message: `Screenshot saved to ${dl}`, base64: fs.readFileSync(dl).toString('base64'), path: dl });
                } else resolve(FAIL(`Screenshot failed: ${err?.message || 'unknown'}`));
            });
        });
    });
}

async function doListFiles({ directory }) {
    const roots = { downloads: path.join(os.homedir(), 'Downloads'), desktop: path.join(os.homedir(), 'Desktop'), documents: path.join(os.homedir(), 'Documents') };
    const dir = roots[directory] || roots.downloads;
    return new Promise(resolve => {
        fs.readdir(dir, { withFileTypes: true }, (err, items) => {
            if (err) { resolve(FAIL(err.message)); return; }
            const sorted = items.sort((a, b) => { if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1; return a.name.localeCompare(b.name); });
            const files = sorted.slice(0, 100).map(i => ({ name: i.name, isDir: i.isDirectory(), ext: path.extname(i.name).toLowerCase() }));
            resolve({ success: true, message: `${items.length} items in ${dir}`, files, totalCount: items.length, dirPath: dir });
        });
    });
}

async function doOpenApp({ app: name }) {
    return new Promise(resolve => {
        const m = { notepad: 'notepad.exe', calculator: 'calc.exe', paint: 'mspaint.exe', explorer: 'explorer.exe', cmd: 'cmd.exe', powershell: 'powershell.exe', taskmgr: 'taskmgr.exe', wordpad: 'wordpad.exe', snipping: 'snippingtool.exe', regedit: 'regedit.exe', winver: 'winver.exe', msconfig: 'msconfig.exe', devmgmt: 'devmgmt.msc', services: 'services.msc' };
        const exe = m[name.toLowerCase()] || `${name}.exe`;
        exec(`start "" "${exe}"`, { shell: true }, err => resolve(err ? FAIL(`Can't open ${name}: ${err.message}`) : OK(`Opened ${name}`)));
    });
}

async function doSysInfo() {
    const cpus = os.cpus();
    const tm = (os.totalmem() / 1073741824).toFixed(1), fm = (os.freemem() / 1073741824).toFixed(1);
    const up = `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`;
    let gpu = 'N/A', disk = 'N/A', net = 'N/A';
    if (process.platform === 'win32') {
        try { gpu = execSync('wmic path win32_VideoController get name /format:value', { timeout: 4000 }).toString().match(/Name=(.+)/)?.[1]?.trim() || 'N/A'; } catch { }
        try { disk = execSync('wmic logicaldisk where "DriveType=3" get DeviceID,FreeSpace,Size /format:csv', { timeout: 4000 }).toString().trim().split('\n').slice(2).filter(Boolean).map(l => { const [, id, fr, si] = l.split(','); if (!id || !si) return null; const gb = v => (parseInt(v) / 1073741824).toFixed(0); return `${id.trim()} ${gb(fr)}/${gb(si)}GB`; }).filter(Boolean).join('  ') || 'N/A'; } catch { }
    }
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && !i.internal && i.family === 'IPv4').map(i => i.address);
    if (ips.length) net = ips.join(', ');
    return { success: true, message: 'System Information', info: { 'OS': `${os.type()} ${os.arch()} (${os.release()})`, 'Host': os.hostname(), 'User': os.userInfo().username, 'Home': os.homedir(), 'CPU': `${cpus[0]?.model?.trim()} · ${cpus.length} cores`, 'RAM': `${fm} GB free / ${tm} GB total`, 'GPU': gpu, 'Disk': disk, 'IP': net, 'Uptime': up, 'Node': process.version, 'Wizard': `v${VERSION}`, 'App data': APP_DATA_DIR() } };
}

async function doTime() {
    const n = new Date();
    return OK(`${n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ·  ${n.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
}

async function doMath({ expression, label }) {
    try {
        const safe = expression.replace(/[^0-9+\-*/().\s%eE]/g, '');
        if (!safe.trim()) return FAIL('Invalid expression');
        const r = Function('"use strict"; return (' + safe + ')')();
        if (typeof r !== 'number' || !isFinite(r)) return FAIL('Could not calculate');
        const formatted = Number.isInteger(r) ? r.toLocaleString() : r.toFixed(10).replace(/\.?0+$/, '');
        return OK(`${label || expression} = ${formatted}`);
    } catch (e) { return FAIL(`Math: ${e.message}`); }
}

async function doClipWrite({ text }) { const s = String(text); clipboard.writeText(s); pushClipHistory(s); return OK(`Copied: "${s.slice(0, 60)}"`); }
async function doClipRead() { const c = clipboard.readText() || '(empty)'; pushClipHistory(c); return { success: true, message: 'Clipboard:', content: c }; }
async function doClipPaste({ text }) { const s = String(text); clipboard.writeText(s); pushClipHistory(s); return OK('Copied to clipboard — Ctrl+V to paste'); }
async function doClipHistory({ query } = {}) {
    const results = query ? searchClipHistory(query) : clipHistory;
    if (!results.length) return OK('Clipboard history is empty');
    const lines = results.slice(0, 10).map((c, i) => `${i + 1}. ${c.text.slice(0, 80).replace(/\n/g, '↵')}`).join('\n');
    return { success: true, message: `Clipboard history:\n${lines}`, items: results };
}

async function doReminder({ message, ms }) {
    const mins = Math.round(ms / 60000);
    setTimeout(() => {
        if (Notification.isSupported()) new Notification({ title: '🧙 Wizard Reminder', body: message }).show();
        const text = `⏰ Reminder: ${message}`;
        mainWin?.webContents.send('reminder', { message });
        overlayWin?.webContents.send('reminder', { message });
        pushHistToWindow(mainWin, 'assistant', text);
        pushHistToWindow(overlayWin, 'assistant', text);
    }, ms);
    return OK(`Reminder set: "${message}" in ${mins} min${mins !== 1 ? 's' : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH
// ─────────────────────────────────────────────────────────────────────────────
async function dispatch(a) {
    try {
        macroRecord(a);
        switch (a.type) {
            case 'fs_read': return fsRead(a);
            case 'fs_write': return fsWrite(a);
            case 'fs_delete': return fsDelete(a);
            case 'fs_move': return fsMove(a);
            case 'fs_copy': return fsCopy(a);
            case 'fs_mkdir': return fsMkdir(a);
            case 'fs_list': return fsList(a);
            case 'fs_search': return fsSearch(a);
            case 'file_search': return fileSearch(a);
            case 'fs_info': return fsInfo(a);
            case 'fs_reveal': return fsReveal(a);
            case 'create_project': return createProject(a);
            case 'project_create': return memCreateProject(a);
            case 'project_switch': return projectSwitchByName(a);
            case 'agent_task': return runAgentLoop(a.goal, worldCtx());
            case 'shell_exec': return shellExec(a);
            case 'run_script': return runScript(a);
            case 'read_document': return readDocument(a);
            case 'create_file_ai': return genFile(a);
            case 'vision_screen': return doAnalyseScreen(a);
            case 'vision_browser': return doAnalyseBrowser(a);
            case 'browser_open': return doBrowserOpen(a);
            case 'browser_nav': return doBrowserNav(a);
            case 'browser_close': return doBrowserClose();
            case 'browser_back': return doBrowserBack();
            case 'browser_forward': return doBrowserFwd();
            case 'browser_refresh': return doBrowserRefresh();
            case 'browser_scroll': return doBrowserScroll(a);
            case 'browser_click': return doBrowserClick(a);
            case 'browser_click_nth': return doBrowserClickNth(a);
            case 'browser_type': return doBrowserType(a);
            case 'browser_type_into': return doBrowserTypeInto(a);
            case 'browser_js': return doBrowserJS(a);
            case 'browser_read': return doBrowserRead();
            case 'browser_wait': return doBrowserWait();
            case 'browser_screenshot': return doBrowserScreenshot();
            case 'new_tab': return doNewTab(a);
            case 'switch_tab': return doSwitchTab(a);
            case 'close_tab': return doCloseTab(a);
            case 'list_tabs': return doListTabs();
            case 'search_web': return doSearch(a);
            case 'take_screenshot': return doScreenshot();
            case 'list_files': return doListFiles(a);
            case 'open_app': return doOpenApp(a);
            case 'system_info': return doSysInfo();
            case 'get_time': return doTime();
            case 'math': return doMath(a);
            case 'set_reminder': return doReminder(a);
            case 'clipboard_write': return doClipWrite(a);
            case 'clipboard_read': return doClipRead();
            case 'clipboard_history': return doClipHistory(a);
            case 'type_text': return doClipPaste(a);
            case 'nut_move': return nutMove(a);
            case 'nut_click': return nutClick(a);
            case 'nut_dbl': return nutDbl(a);
            case 'nut_scroll': return nutScroll(a);
            case 'nut_drag': return nutDrag(a);
            case 'nut_type': return nutType(a);
            case 'nut_key': return nutKey(a);
            case 'nut_pos': return nutPos();
            case 'macro_record': return macroStart(a.name);
            case 'macro_stop': return macroStop();
            case 'macro_replay': return macroReplay(a.name);
            case 'macro_list': return macroList();
            case 'open_url': return doBrowserOpen(a);
            case 'browser_navigate': return doBrowserNav(a);
            case 'vault_autofill': return doVaultAutofill(a, { webView, requestPermission, ensureBrowser });
            case 'schedule_task': return scheduleCreate(a);
            default: return FAIL(`Unknown action type: "${a.type}"`);
        }
    } catch (e) { return FAIL(`Dispatch error: ${e.message}`); }
}

async function executePlan(plan) {
    const results = [];
    for (let i = 0; i < plan.length; i++) {
        const stepMsg = `Step ${i + 1}/${plan.length}…`;
        broadcast('plan-step', { step: i + 1, total: plan.length });
        overlayWin?.webContents.send('plan-step', { step: i + 1, total: plan.length, label: stepMsg });
        const r = await dispatch(plan[i]);
        results.push(r);
        broadcast('plan-step-done', { step: i + 1, total: plan.length, message: r.message, success: r.success });
        overlayWin?.webContents.send('plan-step-done', { step: i + 1, total: plan.length, message: r.message, success: r.success });
        if (!r.success) break;
        if (i < plan.length - 1) await delay(380);
    }
    return { success: results.every(r => r.success), message: results.map((r, i) => `${i + 1}. ${r.message}`).join('\n'), results };
}

// ─────────────────────────────────────────────────────────────────────────────
// ON-DEMAND AGENT LOOP
//   The difference from executePlan() above: executePlan() runs a FIXED,
//   pre-parsed sequence of steps with no observation between them — if
//   step 2 fails, it just stops. This loop instead executes ONE action,
//   observes the real result, and asks the model to decide the next step
//   (or declare done) based on what actually happened — the "plan → act →
//   observe → replan" pattern, WITHOUT the background/unattended part.
//
//   This is intentionally ONLY reachable from an explicit user command in
//   the same turn — never from Advanced Proactivity or Scheduled Tasks,
//   which stay hard-capped to write_file/set_reminder. Every single step
//   here still goes through the exact same dispatch() function as any
//   other action, so every existing permission gate (delete, shell, vault,
//   overwrite, etc.) still fires exactly as it would for a one-off command
//   — this loop doesn't bypass confirmation, it just chains confirmed
//   steps together with real observation between them, while the user is
//   present and the conversation is still live.
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_MAX_STEPS = 8;

async function runAgentLoop(goal, ctx) {
    const stepsLog = [];
    let finalMessage = '';

    for (let i = 0; i < AGENT_MAX_STEPS; i++) {
        const label = `Agent step ${i + 1}/${AGENT_MAX_STEPS}…`;
        broadcast('plan-step', { step: i + 1, total: AGENT_MAX_STEPS, label });
        overlayWin?.webContents.send('plan-step', { step: i + 1, total: AGENT_MAX_STEPS, label });

        const stepsSummary = stepsLog.length
            ? stepsLog.map((s, idx) => `${idx + 1}. [${s.action?.type || '?'}] → ${s.success ? 'OK' : 'FAILED'}: ${(s.message || '').slice(0, 300)}`).join('\n')
            : '(no steps taken yet)';

        const r = await llmCall({
            role: 'complex',
            sys: ACTION_SYS + `\n\nYou are executing a multi-step task the user explicitly asked for, ONE action at a time. After each action you see whether it succeeded or failed and its output, then decide the next single action — or declare the task done. If a previous step failed, adapt: try a genuinely different approach, don't just repeat the same failing action. Respond ONLY with: {"done": true or false, "action": {...single action from the vocabulary above, or null}, "response": "short user-facing summary of where things stand"}. Set done:true once the goal is genuinely accomplished, or once you've tried reasonable approaches and it isn't achievable — explain which, plainly, in "response".`,
            user: `Goal: ${goal}\n\nContext:\n${ctx}\n\nSteps taken so far:\n${stepsSummary}\n\nDecide the next step, or declare done.`,
            maxTokens: 900, temp: 0.2, json: true, timeout: 30000
        });

        const parsed = r.ok ? extractJSON(r.text) : null;
        if (!parsed) { finalMessage = stepsLog.length ? 'Stopped: could not determine a next step.' : 'Could not parse a plan for this task.'; break; }

        if (parsed.done || !parsed.action) {
            finalMessage = parsed.response || 'Task complete.';
            break;
        }

        const result = await dispatch(parsed.action); // same dispatch() as everything else — all permission gates fully apply
        stepsLog.push({ action: parsed.action, success: result.success, message: result.message });

        broadcast('plan-step-done', { step: i + 1, total: AGENT_MAX_STEPS, message: result.message, success: result.success });
        overlayWin?.webContents.send('plan-step-done', { step: i + 1, total: AGENT_MAX_STEPS, message: result.message, success: result.success });

        if (i === AGENT_MAX_STEPS - 1) finalMessage = parsed.response || `Reached the ${AGENT_MAX_STEPS}-step limit for one task — let me know if you want me to continue.`;
    }

    return {
        success: stepsLog.length ? stepsLog[stepsLog.length - 1].success : true,
        message: finalMessage,
        isPlan: true,
        results: stepsLog.map(s => ({ success: s.success, message: s.message }))
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION HISTORY
// ─────────────────────────────────────────────────────────────────────────────
const windowHistories = new Map();
const globalHistory = [];

function getHistory(event) {
    const id = event?.sender?.id;
    if (!id) return globalHistory;
    if (!windowHistories.has(id)) windowHistories.set(id, []);
    return windowHistories.get(id);
}
function pushHist(history, role, content) {
    history.push({ role, content });
    if (history.length > 40) history.splice(0, 2);
}
/**
 * Proactive check-ins, Advanced Proactivity, and Scheduled Tasks all
 * display a message via webContents.send() without going through
 * executeCommand()/getHistory() — because they're not triggered by an
 * IPC event, they have no `event.sender.id` to key off. Without this,
 * none of those messages were ever recorded in conversation history,
 * so the model had zero memory of having said them by the time the
 * user replied — it would guess blind, ignoring tone/persona rules
 * along with everything else. This keys off the window's own
 * webContents.id, matching how getHistory() keys off event.sender.id
 * (they're the same id for messages sent to/from that window).
 */
function pushHistToWindow(win, role, content) {
    if (!win || win.isDestroyed()) return;
    const id = win.webContents.id;
    if (!windowHistories.has(id)) windowHistories.set(id, []);
    pushHist(windowHistories.get(id), role, content);
}
app.on('browser-window-removed', () => {
    if (windowHistories.size > 20) windowHistories.delete(windowHistories.keys().next().value);
});

// ─────────────────────────────────────────────────────────────────────────────
// FAST-PATH DETECTION
//   Returns:
//     - an action object       → dispatch immediately, no LLM
//     - "force-command" string → skip classifier, go straight to LLM parse
//     - null                   → fall through to classifier
// ─────────────────────────────────────────────────────────────────────────────

// Common artifact nouns — trigger for direct-action detection
const ARTIFACT_NOUNS_RX = /\b(website|web\s?site|web\s?page|webpage|html|css|javascript|python|script|program|app|application|document|doc|pdf|word\s?doc|spreadsheet|note|readme|config|folder|directory|project|svg|image|json|csv|markdown|report|essay|letter|template|form|page|file|component|tool|dashboard|game|portfolio|blog|landing|site)\b/i;

// Try to derive a concrete fs_write action from a "make/create X" command
function tryDirectAction(input) {
    const t = input.trim();
    const m = t.match(/^(?:make|create|build|write|generate|design|develop|produce|draft|code|craft|scaffold)\s+(?:me\s+)?(?:an?\s+)?(.+?)[?.!]*$/i);
    if (!m) return null;

    const rest = m[1].trim();
    if (rest.length < 3) return null;

    let ext = detectExt(rest);
    const hasArtifactNoun = ARTIFACT_NOUNS_RX.test(rest);

    // If no recognizable ext AND no artifact noun, it's probably chat (e.g. "make me a sandwich")
    if (ext === 'txt' && !hasArtifactNoun) return null;

    // Default to HTML for artifact nouns without extension
    if (ext === 'txt' && hasArtifactNoun) ext = 'html';

    // Build a clean filename from meaningful words
    const cleaned = rest
        .replace(/\b(html|css|js|javascript|python|website|web\s?site|web\s?page|webpage|file|page|document|doc|template|form|component)\b/gi, '')
        .replace(/\b(about|on|for|describing|describes|with|covering|regarding|the|a|an|name|called|named|of|in|to)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    const slug = safeFilename(cleaned) || safeFilename(rest) || 'output';
    const filename = `${slug}.${ext}`;

    return {
        type: 'fs_write',
        path: `downloads/${filename}`,
        generate: `A complete, production-quality ${FTYPES[ext] || ext} file for: "${rest}". Include real, specific, complete content — no placeholders, no filler.`,
        ext
    };
}

// Try filesystem query patterns
function tryFilesystemAction(input) {
    const t = input.trim();

    let m = t.match(/^(?:what(?:'s| is)?\s+(?:in|inside)|list|show\s+(?:me\s+)?(?:the\s+)?(?:files?\s+in|contents?\s+of|files?\s+inside))\s+(.+?)[?.!]*\s*$/i);
    if (m) {
        const target = m[1].trim().replace(/^(?:my|the)\s+/i, '');
        return { type: 'fs_list', path: target };
    }
    m = t.match(/^(?:files?|contents?)\s+(?:in|of|inside)\s+(.+?)[?.!]*\s*$/i);
    if (m) {
        const target = m[1].trim().replace(/^(?:my|the)\s+/i, '');
        return { type: 'fs_list', path: target };
    }
    m = t.match(/^(?:read|open)\s+(?:the\s+)?file\s+(.+?)[?.!]*\s*$/i);
    if (m) {
        const target = m[1].trim();
        if (/[\/\\.]/.test(target)) return { type: 'fs_read', path: target };
    }
    m = t.match(/^(?:delete|remove)\s+(?:the\s+)?(?:file\s+|folder\s+|directory\s+)?(.+?)[?.!]*\s*$/i);
    if (m) {
        const target = m[1].trim();
        if (/[\/\\.]/.test(target) || /^(?:my\s+)?(?:downloads|desktop|documents|pictures|music|videos)$/i.test(target)) {
            return { type: 'fs_delete', path: target, recursive: true };
        }
    }

    return null;
}

// Try shell command pattern
function tryShellAction(input) {
    const t = input.trim();
    const m = t.match(/^(?:run|execute)\s+(?:the\s+)?(?:command\s+)?(.+?)[?.!]*\s*$/i);
    if (!m) return null;
    const cmd = m[1].trim();
    if (/\b(npm|yarn|pnpm|git|pip|python|node|curl|wget|docker|cargo|go|make|ls|cd|mkdir)\b/i.test(cmd)) {
        return { type: 'shell_exec', command: cmd };
    }
    return null;
}

// Try direct site open
function tryDirectOpen(input) {
    const t = input.trim();
    const m = t.match(/^(?:open|launch|go\s+to|navigate\s+to|visit)\s+(.+?)[?.!]*$/i);
    if (!m) return null;
    const target = m[1].trim().toLowerCase();
    if (target === 'browser' || target === 'the browser' || target === 'web browser') {
        return { type: 'browser_open', url: 'https://www.google.com' };
    }
    // Simple heuristic for known sites
    const known = {
        youtube: 'https://youtube.com', yt: 'https://youtube.com',
        google: 'https://google.com', gmail: 'https://mail.google.com',
        github: 'https://github.com', gh: 'https://github.com',
        reddit: 'https://reddit.com', twitter: 'https://twitter.com',
        x: 'https://x.com', facebook: 'https://facebook.com', fb: 'https://facebook.com',
        instagram: 'https://instagram.com', ig: 'https://instagram.com',
        amazon: 'https://amazon.com', netflix: 'https://netflix.com',
        spotify: 'https://open.spotify.com', twitch: 'https://twitch.tv',
        wikipedia: 'https://wikipedia.org', wiki: 'https://wikipedia.org',
        stackoverflow: 'https://stackoverflow.com',
        linkedin: 'https://linkedin.com', tiktok: 'https://tiktok.com',
        discord: 'https://discord.com', slack: 'https://slack.com',
        notion: 'https://notion.so', figma: 'https://figma.com',
        chatgpt: 'https://chatgpt.com', claude: 'https://claude.ai',
        bing: 'https://bing.com', duckduckgo: 'https://duckduckgo.com', ddg: 'https://duckduckgo.com',
        pinterest: 'https://pinterest.com', medium: 'https://medium.com',
    };
    if (known[target]) return { type: 'browser_open', url: known[target] };
    // Looks like a domain?
    if (/^[\w-]+(\.[\w-]+)+/.test(target)) {
        return { type: 'browser_open', url: target.startsWith('http') ? target : `https://${target}` };
    }
    return null;
}

// Try screenshot intent
function tryScreenshotAction(input) {
    const c = input.toLowerCase();
    if (/\b(take\s+a?\s*(?:screenshot|screen\s?shot|screen\s?capture)|capture\s+the\s+screen|screengrab)\b/.test(c)) {
        return { type: 'take_screenshot' };
    }
    return null;
}

// Try system info intent
function trySystemInfoAction(input) {
    const c = input.toLowerCase();
    if (/\b(system\s*info|computer\s*info|my\s*pc\s*specs|hardware\s*info|my\s*specs)\b/.test(c)) {
        return { type: 'system_info' };
    }
    return null;
}

// Combined fast-path
function tryCommandFastPath(input) {
    // Deterministic direct actions (in priority order)
    let action;

    action = tryFilesystemAction(input);
    if (action) return action;

    action = tryShellAction(input);
    if (action) return action;

    action = tryScreenshotAction(input);
    if (action) return action;

    action = trySystemInfoAction(input);
    if (action) return action;

    action = tryDirectOpen(input);
    if (action) return action;

    // Direct action from verb+noun (make X)
    action = tryDirectAction(input);
    if (action) {
        console.log('[FastPath] Direct action extracted from make/create verb');
        return action;
    }

    // If it contains an action verb + artifact noun but we couldn't build the action,
    // force command path so classifier doesn't hijack it
    if (ARTIFACT_NOUNS_RX.test(input) && /\b(make|create|build|write|generate|design|develop|produce|draft|code|craft|scaffold|set\s?up|compose|construct)\b/i.test(input)) {
        console.log('[FastPath] Verb+artifact detected, forcing command path');
        return 'force-command';
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROBUST LLM COMMAND PARSER — 3 retry strategies
// ─────────────────────────────────────────────────────────────────────────────
async function parseCommandLLM(input, hist, ctx) {
    // Attempt 1: JSON mode with full schema
    let r = await llmCall({
        role: 'complex',
        sys: ACTION_SYS + `\n\nContext:\n${ctx}`,
        messages: [...hist.slice(-6), { role: 'user', content: input }],
        maxTokens: 2000, temp: 0.0, json: true, timeout: 30000
    });

    let parsed = r.ok ? extractJSON(r.text) : null;
    if (parsed && (parsed.action?.type || parsed.action_plan?.length)) {
        console.log('[Parse] Attempt 1 succeeded (json mode)');
        return parsed;
    }

    if (r.ok) console.warn('[Parse] Attempt 1 failed. Raw:', (r.text || '').slice(0, 400));
    else console.warn('[Parse] Attempt 1 request failed:', r.err);

    // Attempt 2: no JSON mode, stronger instruction
    r = await llmCall({
        role: 'complex',
        sys: ACTION_SYS + `\n\nContext:\n${ctx}\n\nREMINDER: Return ONLY the raw JSON object. NO markdown fences. NO prose. NO "Here is the JSON". Just the object starting with { and ending with }.`,
        messages: [...hist.slice(-6), { role: 'user', content: input }],
        maxTokens: 2000, temp: 0.0, timeout: 30000
    });

    parsed = r.ok ? extractJSON(r.text) : null;
    if (parsed && (parsed.action?.type || parsed.action_plan?.length)) {
        console.log('[Parse] Attempt 2 succeeded (no json mode)');
        return parsed;
    }

    if (r.ok) console.warn('[Parse] Attempt 2 failed. Raw:', (r.text || '').slice(0, 400));
    else console.warn('[Parse] Attempt 2 request failed:', r.err);

    // Attempt 3: minimal prompt, just the essentials
    r = await llmCall({
        role: 'complex',
        sys: `Return a JSON object describing the action for this user command. Format:

{"action":{"type":"ACTION_TYPE",...},"thinking":"short reasoning","response":"short friendly reply"}

For "make/create/write/generate X", use: {"action":{"type":"fs_write","path":"downloads/<name>.<ext>","generate":"<description of X>"}}
For "list/open X", use appropriate action type.
Use "downloads/" prefix for new files.

Return ONLY the JSON. Nothing else.`,
        user: input,
        maxTokens: 800, temp: 0.0, timeout: 20000
    });

    parsed = r.ok ? extractJSON(r.text) : null;
    if (parsed && (parsed.action?.type || parsed.action_plan?.length)) {
        console.log('[Parse] Attempt 3 succeeded (minimal prompt)');
        return parsed;
    }

    if (r.ok) console.warn('[Parse] Attempt 3 failed. Raw:', (r.text || '').slice(0, 400));
    else console.warn('[Parse] Attempt 3 request failed:', r.err);

    console.error('[Parse] All 3 attempts failed for:', input);
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER — aggressive command bias
// ─────────────────────────────────────────────────────────────────────────────
async function classifyInput(input, ctx) {
    const r = await llmCall({
        role: 'fast',
        sys: `Classify the user message as "command" or "chat". Return ONLY valid JSON: {"type":"command"} or {"type":"chat"}.

Choose "command" if the user wants the computer to DO something:
- Make/create/build/write/generate ANY file/website/script/document/etc.
- List/read/show/search files or folders
- Delete/move/copy files
- Run shell commands, scripts
- Open browser, navigate, search web
- Open apps, take screenshots, get system info
- Record/replay macros
- Any imperative verb ("make X", "do X", "open X", "go to X", "delete X")

Choose "chat" ONLY for:
- Greetings ("hi", "hello")
- Casual conversation, opinions, jokes
- General knowledge questions NOT about the user's computer
- "what is X" / "explain X" where X is a concept
- Math formulas like "what is 15% of 847"

WHEN IN DOUBT: choose "command". Misrouting to chat causes hallucinated responses.

Examples:
"make a html website on the name Arnav" → command
"make me an html file about spiderman" → command
"build me a portfolio site" → command
"write a PDF report about quantum computing" → command
"design me a login page" → command
"what's in my Downloads" → command
"list my Desktop" → command
"read Downloads/report.pdf" → command
"delete the Macintosh folder" → command
"open youtube" → command
"run npm install" → command
"take a screenshot" → command
"what is the capital of France" → chat
"how are you" → chat
"explain quantum physics" → chat

Context for classification:
${ctx}`,
        user: input, maxTokens: 20, temp: 0, json: true, timeout: 6000
    });
    try { return JSON.parse(r.text || '{}').type === 'command' ? 'command' : 'chat'; }
    catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXECUTE
// ─────────────────────────────────────────────────────────────────────────────
async function executeCommand(raw, event) {
    const input = raw.trim();
    if (!input) return FAIL('Empty command');
    const history = getHistory(event);

    console.log(`[Wizard] ${input}`);
    telLog('command', { input: input.slice(0, 80) });
    pushHist(history, 'user', input);
    tryAutoExtractFact(input).catch(() => { }); // fire-and-forget — never blocks the response

    const ctx = worldCtx(history.slice(0, -1));

    // 1. Plugin fast-path
    const plugResult = await tryPlugins(input);
    if (plugResult) { pushHist(history, 'assistant', plugResult.message || 'Done.'); return plugResult; }

    // 2. Pure greeting fast-path
    if (/^\s*(hi|hello|hey|yo|howdy|sup|thanks|thank you|good morning|good evening|good night)[\s!?.,]*$/i.test(input)) {
        const reply = await llmCall({ role: 'fast', sys: chatSys(ctx), messages: [{ role: 'user', content: input }], maxTokens: 120, temp: 0.7, timeout: 8000 });
        const msg = reply.ok ? reply.text.trim() : 'Hello.';
        pushHist(history, 'assistant', msg);
        return { success: true, message: msg, isChat: true };
    }

    // 3. Command fast-path (may return a direct action or 'force-command')
    const fast = tryCommandFastPath(input);
    if (fast && fast !== 'force-command') {
        console.log(`[FastPath] Dispatching directly: ${fast.type}`);
        const r = await dispatch(fast);
        const msg = r.message || 'Done.';
        pushHist(history, 'assistant', msg);
        return { success: r.success, message: msg, isChat: false, result: r, thinking: 'local fast-path' };
    }

    // 4. Session cache fast-path (non-destructive only)
    const cached = cacheGet(input);
    if (cached?.type && !UNCACHEABLE.has(cached.type)) {
        const r = await dispatch(cached);
        const msg = r.message || 'Done.';
        pushHist(history, 'assistant', msg);
        return { success: r.success, message: msg, isChat: false, result: r, fromCache: true };
    }

    // 5. Classify (unless already forced)
    let cls;
    let chatReply = null;

    if (fast === 'force-command') {
        cls = 'command';
        console.log('[Wizard] Forced command path by fast-path heuristic');
    } else {
        const results = await all([
            classifyInput(input, ctx),
            llmCall({
                role: 'fast',
                sys: chatSys(ctx),
                messages: [...history.slice(0, -1).slice(-8), { role: 'user', content: input }],
                maxTokens: 600, temp: 0.7, timeout: 22000
            })
        ]);
        cls = results[0];
        chatReply = results[1];
    }

    // 6. Chat path with safety net
    if (cls !== 'command') {
        let reply = chatReply?.ok ? chatReply.text.trim() : "I had trouble answering.";

        // Safety: chat model claimed completion for an action request → override
        const hallucinatedDone = /^(?:done\.?|okay,?\s*done\.?|completed\.?|finished\.?|✅\s*done\.?|all\s+set\.?|ready\.?)$/i.test(reply);
        const userHadActionVerb = /\b(make|create|build|write|generate|design|develop|produce|draft|code|craft|scaffold|delete|remove|move|copy|open|list|show|read|run|execute)\b/i.test(input) && ARTIFACT_NOUNS_RX.test(input);

        if (hallucinatedDone && userHadActionVerb) {
            console.warn('[Wizard] Chat model hallucinated "Done." — forcing command path');
            cls = 'command';
        } else {
            pushHist(history, 'assistant', reply);
            return { success: true, message: reply, isChat: true };
        }
    }

    // 7. Parse command (3-attempt robust)
    const ai = await parseCommandLLM(input, history.slice(0, -1), ctx);

    if (ai) {
        const actionPlan = ai.action_plan?.length ? ai.action_plan : null;
        const singleAction = ai.action?.type ? ai.action : null;
        const thinking = ai.thinking;
        const response = ai.response;

        if (singleAction && !UNCACHEABLE.has(singleAction.type)) cacheSet(input, singleAction);

        const execResult = actionPlan ? await executePlan(actionPlan) : await dispatch(singleAction);
        const displayMsg = execResult.message || response || (execResult.success ? 'Done.' : 'Failed.');

        pushHist(history, 'assistant', displayMsg);
        telLog('result', { success: execResult.success, type: singleAction?.type || 'plan' });

        return {
            success: execResult.success,
            message: displayMsg,
            thinking,
            isChat: false,
            isPlan: !!actionPlan,
            result: execResult
        };
    }

    // 8. FALLBACK: LLM parse failed → try deterministic direct action
    const fallback = tryDirectAction(input);
    if (fallback) {
        console.warn('[Wizard] LLM parse failed — using deterministic fallback action');
        const r = await dispatch(fallback);
        const msg = r.message || 'Done.';
        pushHist(history, 'assistant', msg);
        return { success: r.success, message: msg, isChat: false, result: r, thinking: 'fallback' };
    }

    // 9. Absolute last resort — give up gracefully
    const msg = `I understood this as an action request but couldn't work out the steps after several attempts.\n\nTry being more specific, e.g.:\n• "create a website about Arnav and save to Downloads"\n• "make a Python script that prints hello"\n• "list files in my Downloads"`;
    pushHist(history, 'assistant', msg);
    return { success: false, message: msg, isChat: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('execute-command', (event, cmd) => executeCommand(cmd, event));
ipcMain.handle('clear-history', (event) => { const h = getHistory(event); h.length = 0; return OK('History cleared'); });
ipcMain.handle('get-browser-state', () => getBrowserState());
ipcMain.handle('get-tabs', () => [...tabRegistry.entries()].map(([id, t]) => ({ id, title: t.title, url: t.url, active: id === activeTabId })));
ipcMain.handle('get-macros', () => { try { return fs.readdirSync(MACRO_DIR()).filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json')); } catch { return []; } });
ipcMain.handle('get-clip-history', () => clipHistory.slice(0, 20));
ipcMain.handle('get-version', () => VERSION);
ipcMain.handle('get-app-data-dir', () => APP_DATA_DIR());

ipcMain.handle('memory-get-all', () => memGetAll());
ipcMain.handle('memory-add-fact', (_e, text) => memAddFact(text));
ipcMain.handle('memory-edit-fact', (_e, { index, text }) => memEditFact(index, text));
ipcMain.handle('memory-delete-fact', (_e, index) => memDeleteFact(index));
ipcMain.handle('memory-add-goal', (_e, text) => memAddGoal(text));
ipcMain.handle('memory-edit-goal', (_e, { index, text }) => memEditGoal(index, text));
ipcMain.handle('memory-delete-goal', (_e, index) => memDeleteGoal(index));
ipcMain.handle('memory-set-goal-status', (_e, { index, status }) => memSetGoalStatus(index, status));
ipcMain.handle('memory-set-preference', (_e, { key, value }) => memSetPreference(key, value));
ipcMain.handle('memory-delete-preference', (_e, key) => memDeletePreference(key));
ipcMain.handle('memory-delete-summary', (_e, index) => memDeleteSummary(index));
ipcMain.handle('memory-clear-all', () => memClearAll());
ipcMain.handle('memory-set-proactivity-level', (_e, level) => memSetProactivityLevel(level));
ipcMain.handle('memory-set-onboarding-completed', (_e, completed) => memSetOnboardingCompleted(completed));
ipcMain.handle('project-list', () => memGetProjects());
ipcMain.handle('project-create', (_e, data) => memCreateProject(data));
ipcMain.handle('project-set-active', (_e, id) => memSetActiveProject(id));
ipcMain.handle('project-archive', (_e, { id, archived }) => memArchiveProject(id, archived));
ipcMain.handle('project-delete', (_e, id) => memDeleteProject(id));
ipcMain.handle('project-rename', (_e, { id, name, description }) => memRenameProject(id, name, description));
ipcMain.handle('get-plugins', () => plugins.map(p => ({ name: p.name, description: p.description || null })));
ipcMain.handle('memory-delete-advanced-log', (_e, index) => memDeleteAdvancedLogEntry(index));
ipcMain.handle('memory-clear-advanced-log', () => memClearAdvancedLog());
ipcMain.handle('memory-delete-max-log', (_e, index) => memDeleteMaxLogEntry(index));
ipcMain.handle('memory-clear-max-log', () => memClearMaxLog());

ipcMain.handle('schedule-list', () => scheduleList());
ipcMain.handle('schedule-create', (_e, task) => scheduleCreate(task));
ipcMain.handle('schedule-toggle', (_e, { id, enabled }) => scheduleToggle(id, enabled));
ipcMain.handle('schedule-delete', (_e, id) => scheduleDelete(id));

ipcMain.on('save-memory-fact', (_e, fact) => { if (!mem.facts.includes(fact)) { mem.facts.push(fact); saveMem(); } });
ipcMain.on('save-preference', (_e, { key, value }) => { mem.preferences[key] = value; saveMem(); });
ipcMain.on('telemetry-opt-in', (_e, val) => { mem.telemetryOptIn = !!val; saveMem(); });
ipcMain.on('window-minimize', () => mainWin?.minimize());
ipcMain.on('window-maximize', () => mainWin?.isMaximized() ? mainWin.unmaximize() : mainWin?.maximize());
ipcMain.on('window-close', () => {
    if (!app.isQuitting) mainWin?.hide();
    else { browserWin?.close(); mainWin?.close(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WINDOW
// ─────────────────────────────────────────────────────────────────────────────
function createMain() {
    mainWin = new BrowserWindow({
        width: 1400, height: 900, minWidth: 900, minHeight: 600,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        backgroundColor: '#080612', title: 'Wizard Autopilot',
        frame: false, titleBarStyle: 'hidden', show: false
    });
    mainWin.loadFile('index.html');
    mainWin.once('ready-to-show', () => { mainWin.show(); if (process.platform !== 'darwin') mainWin.maximize(); });

    mainWin.on('close', e => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWin.hide();
        }
    });

    mainWin.on('closed', () => { browserWin?.close(); mainWin = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE INSTANCE
// ─────────────────────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => { showOrCreateMain(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    try { fs.mkdirSync(APP_DATA_DIR(), { recursive: true }); } catch { }
    try { fs.mkdirSync(MACRO_DIR(), { recursive: true }); } catch { }
    try { fs.mkdirSync(SCRATCH_DIR(), { recursive: true }); } catch { }

    loadMem();
    loadClipHistory();
    loadPlugins();
    loadSchedule();
    wireVaultIPC(ipcMain, dispatch);
    accountLib.loadSession();
    accountLib.wireAccountIPC(ipcMain);
    accountLib.checkAuth().catch(() => { }); // silent — confirms/clears a stored session without blocking startup
    startProactiveEngine();
    startSchedulerEngine();
    createMain();
    createOverlay();
    createTray();
    startAhkBridge();
    checkForUpdates().catch(() => { });

    const hotkey = process.platform === 'darwin' ? 'Cmd+Shift+A' : 'Ctrl+Shift+A';
    if (!globalShortcut.register(hotkey, toggleOverlay)) {
        console.warn('[Wizard] Could not register hotkey:', hotkey, '— AHK bridge active as fallback');
    } else {
        console.log(`[Wizard] v${VERSION} ready — Provider: Mistral (fast=${MISTRAL_MODELS.fast}, complex=${MISTRAL_MODELS.complex}, vision=${MISTRAL_MODELS.vision}) | Fallback: Wizard AI | Hotkey: ${hotkey}`);
    }
    console.log(`[Wizard] App data: ${APP_DATA_DIR()}`);
    console.log(`[Wizard] Plugins: ${plugins.length} | Facts: ${mem.facts.length} | Summaries: ${mem.summaries.length}`);
});

app.on('before-quit', () => { app.isQuitting = true; });

app.on('will-quit', async () => {
    if (ahkPollTimer) clearInterval(ahkPollTimer);
    stopProactiveEngine();
    stopSchedulerEngine();
    globalShortcut.unregisterAll();
    const allHistories = [globalHistory, ...windowHistories.values()];
    await Promise.all(allHistories.map(h => h.length >= 4 ? summariseSession(h) : Promise.resolve()));
    saveMem();
});

app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.dock?.hide();
});

app.on('activate', () => {
    if (!mainWin || mainWin.isDestroyed()) createMain();
    else mainWin.show();
});

process.on('uncaughtException', err => console.error('[Wizard] Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('[Wizard] Unhandled rejection:', err));