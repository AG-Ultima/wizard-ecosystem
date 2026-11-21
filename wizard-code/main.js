// main.js — Wizard Code Electron Main Process
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme } = require('electron');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
// API keys live outside the app so they never ship inside an installer: %APPDATA%\Wizard Code\.env (Windows), ~/.config/wizard-code/.env (Linux).
// A .env next to main.js still works for development.
try { require('dotenv').config({ path: path.join(app.getPath('userData'), '.env') }); } catch (e) {}
const http = require('http');
const { URL } = require('url');

let mainWindow;
let localServer;

// ─── Linux tuning ───
// Native Wayland when the session is Wayland (X11 otherwise), client-side window decorations on Wayland,
// GPU rasterization and smooth scrolling. Set WIZCODE_SAFE=1 to skip all of this if a driver misbehaves.
const IS_LINUX = process.platform === 'linux';
const IS_WIN = process.platform === 'win32';
if (IS_WIN) app.setAppUserModelId('com.wizard.code');   // taskbar grouping, jump list, notifications
if (IS_LINUX && !process.env.WIZCODE_SAFE) {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-smooth-scrolling');
    try { app.setDesktopName('wizard-code.desktop'); } catch (e) { /* older Electron */ }   // correct dock/taskbar icon + grouping
}

// AI backend config — defaults to Groq's free llama-3.3-70b-versatile, but every
// piece is overridable via .env so you can point at any OpenAI-compatible provider
// (Cerebras, Together AI, Fireworks, a paid Groq tier, a local server, etc.) without
// touching code. AI_API_KEY takes priority; GROQ_API_KEY is kept as a fallback so
// existing .env files still work unchanged.
const AI_API_URL = process.env.AI_BASE_URL || 'https://api.mistral.ai/v1/chat/completions';
// Three separate model roles, each overridable independently via .env:
// - AI_MODEL: the streaming Chat mode conversation. Kept on a plain, verified-streaming
//   model by default -- Groq's compound systems don't document stream:true support, so
//   we don't default live chat onto them.
// - AI_FAST_MODEL: every non-streaming, non-tool call (inline completions -- by far the
//   highest-frequency caller since it fires while you type -- plus hover explanations and
//   scoped fixes). These are simple single-shot completions, a safe fit for compound's much
//   larger 70K TPM budget, which takes a lot of pressure off the main model's rate limit.
// - AI_AGENT_MODEL: the multi-file agent's tool-calling loop. Must be a model that supports
//   custom user-defined tools -- Groq's compound systems explicitly do not, so this stays on
//   a regular model even though it means a smaller token budget for Agent mode specifically.
const AI_MODEL = process.env.AI_MODEL || 'ministral-3b-2512';
const AI_FAST_MODEL = process.env.AI_FAST_MODEL || 'ministral-3b-2512';
const AI_AGENT_MODEL = process.env.AI_AGENT_MODEL || 'ministral-8b-2512';
function getAiApiKey() {
    return process.env.AI_API_KEY || process.env.GROQ_API_KEY;
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain; charset=utf-8'
};

// Monaco refuses to create web workers on file:// pages, which silently breaks
// the editor. Serving the app over a local http:// origin avoids that entirely.
function startLocalServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const reqUrl = new URL(req.url, 'http://localhost');

                // /__preview__/<url-encoded absolute path, / separated> serves an
                // arbitrary file straight from disk by absolute path. This lets the
                // HTML preview set a <base> at the file's directory so <link href>,
                // <script src>, <img src> etc. resolve to their real sibling files,
                // instead of only working for content that's fully inlined.
                if (reqUrl.pathname.startsWith('/__preview__/')) {
                    let fsPath = reqUrl.pathname.slice('/__preview__/'.length).split('/').map(decodeURIComponent).join('/');
                    if (process.platform !== 'win32' && !fsPath.startsWith('/')) fsPath = '/' + fsPath;
                    fs.readFile(fsPath, (err, data) => {
                        if (err) { res.writeHead(404); res.end('Not found'); return; }
                        const ext = path.extname(fsPath);
                        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                        res.end(data);
                    });
                    return;
                }

                let filePath = path.join(__dirname, decodeURIComponent(reqUrl.pathname));
                if (!filePath.startsWith(__dirname)) {
                    res.writeHead(403); res.end('Forbidden'); return;
                }
                if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                    filePath = path.join(filePath, 'index.html');
                }
                fs.readFile(filePath, (err, data) => {
                    if (err) { res.writeHead(404); res.end('Not found'); return; }
                    const ext = path.extname(filePath);
                    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                    res.end(data);
                });
            } catch (e) {
                res.writeHead(500); res.end('Server error');
            }
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// ─── Open files/folders from the command line ───
// Lets `wizard-code <path>` (and GitHub Desktop's "%TARGET_PATH%", file-manager "Open with", etc.) open
// a folder in the explorer and/or files as tabs, like `code <path>`. Also accepts `file:line[:col]`.
// A second launch hands its paths to the already-running window instead of starting another copy.
let launchQueue = [];          // requests waiting for the window/editor to be ready
let rendererReady = false;

function parseLaunchArgs(argv, cwd) {
    const args = argv.slice(process.defaultApp ? 2 : 1);   // drop executable (and the app path in `electron .`)
    const req = { folder: null, files: [], missing: [] };
    for (let a of args) {
        if (!a || a.startsWith('-')) continue;               // Chromium/Electron flags, --goto etc.
        if (/^file:\/\//i.test(a)) { try { a = require('url').fileURLToPath(a); } catch (e) { continue; } }
        let abs = path.resolve(cwd || process.cwd(), a);
        let line = null, col = null;
        if (!fs.existsSync(abs)) {
            const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(abs);
            if (m && fs.existsSync(m[1])) { abs = m[1]; line = +m[2]; col = m[3] ? +m[3] : null; }
        }
        let st;
        try { st = fs.statSync(abs); } catch (e) { req.missing.push(a); continue; }
        if (st.isDirectory()) { if (!req.folder) req.folder = abs; }
        else if (st.isFile()) req.files.push({ path: abs, line, col });
        try { if (process.platform !== 'linux') app.addRecentDocument(abs); } catch (e) {}   // Windows jump list > Recent
    }
    return (req.folder || req.files.length || req.missing.length) ? req : null;
}

function deliverOpenRequest(req) {
    if (!req) return;
    launchQueue.push(req);
    flushLaunchQueue();
}

async function flushLaunchQueue() {
    if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
    while (launchQueue.length) {
        const req = launchQueue.shift();
        // The editor lives in a closure in index.html; it exposes window.wizOpenPaths for this.
        const js = `(async (req) => {
            const t0 = Date.now();
            while (typeof window.wizOpenPaths !== 'function') {
                if (Date.now() - t0 > 30000) return false;
                await new Promise(r => setTimeout(r, 100));
            }
            return window.wizOpenPaths(req);
        })(${JSON.stringify(req)})`;
        try { await mainWindow.webContents.executeJavaScript(js); } catch (e) { /* window closed mid-launch */ }
    }
}

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

// ─── Window ───
// Size, position, maximized state and the last theme colours are remembered between launches.
const winStatePath = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWinState() { try { return JSON.parse(fs.readFileSync(winStatePath(), 'utf-8')) || {}; } catch (e) { return {}; } }
let winState = {};
let saveStateTimer = null;
function saveWinState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized() && !mainWindow.isFullScreen()) winState.bounds = mainWindow.getBounds();
    winState.maximized = mainWindow.isMaximized();
    try { fs.writeFileSync(winStatePath(), JSON.stringify(winState)); } catch (e) {}
}
function queueSaveState() { clearTimeout(saveStateTimer); saveStateTimer = setTimeout(saveWinState, 400); }
function boundsVisible(b) {
    const { screen } = require('electron');
    return !!b && screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80; });
}
// Windows: Wizard Code draws its own title bar (menus + file name) and Windows draws the caption buttons, so Snap Layouts works.
const TITLEBAR_H = 38;
function useOverlay() { return IS_WIN; }

function createWindow() {
    const iconPath = path.join(__dirname, "icons", "icon-512.png");
    const windowOptions = {
        width: 1500,
        height: 940,
        ...(winState.bounds && boundsVisible(winState.bounds) ? winState.bounds : {}),
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            additionalArguments: useOverlay() ? ['--wiz-overlay=' + TITLEBAR_H] : []
        },
        ...(useOverlay() ? { titleBarStyle: 'hidden', titleBarOverlay: { color: winState.bg || '#0b0919', symbolColor: winState.fg || '#d4d0e8', height: TITLEBAR_H } } : {}),
        backgroundColor: winState.bg || '#080612',
        title: 'Wizard Code',
        autoHideMenuBar: IS_LINUX || IS_WIN,   // Alt shows the menu, like VS Code on Linux
        show: false
    };
    if (fs.existsSync(iconPath)) windowOptions.icon = iconPath;

    mainWindow = new BrowserWindow(windowOptions);

    const port = localServer.address().port;
    mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

    mainWindow.once('ready-to-show', () => {
        if (winState.maximized) mainWindow.maximize();
        mainWindow.show();
        if (IS_WIN) winIntegration();
    });
    ['resize', 'move', 'maximize', 'unmaximize'].forEach(ev => mainWindow.on(ev, queueSaveState));
    mainWindow.on('close', saveWinState);

    mainWindow.webContents.on('did-finish-load', () => { rendererReady = true; flushLaunchQueue(); });

    mainWindow.on('closed', () => {
        mainWindow = null;
        rendererReady = false;
    });
}

// ─── Windows integration ───
function winIntegration() {
    try {
        app.setUserTasks([
            { program: process.execPath, arguments: '--new-file', iconPath: process.execPath, iconIndex: 0, title: 'New file', description: 'Start with an empty file' },
            { program: process.execPath, arguments: '--open-folder', iconPath: process.execPath, iconIndex: 0, title: 'Open folder…', description: 'Pick a project folder' }
        ]);
    } catch (e) {}
    mainWindow.on('focus', () => { try { mainWindow.flashFrame(false); } catch (e) {} });
}
// Flags from the jump list / shortcuts: --new-file, --open-folder.
const pendingChannels = [];
function flagChannels(argv) {
    const a = argv.slice(1), out = [];
    if (a.includes('--new-file')) out.push('menu:new-file');
    if (a.includes('--open-folder')) out.push('menu:open-folder');
    return out;
}
async function deliverFlags(argv) {
    const ch = flagChannels(argv); if (!ch.length) return;
    pendingChannels.push(...ch);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
        if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
            try { if (await mainWindow.webContents.executeJavaScript("typeof window.wizOpenPaths === 'function'")) break; } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 150));
    }
    while (pendingChannels.length) { const c = pendingChannels.shift(); try { mainWindow.webContents.send(c); } catch (e) {} }
}
// Windows has no `python3`; the `py` launcher, then `python`, are what is normally installed. Cached after the first lookup.
const whichCache = new Map();
function which(cmd) {
    if (whichCache.has(cmd)) return whichCache.get(cmd);
    let found = null;
    try {
        const r = require('child_process').spawnSync(IS_WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf-8', timeout: 4000 });
        if (r.status === 0) {
            const lines = (r.stdout || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
            // Skip the Microsoft Store "python.exe" stub in WindowsApps: it opens the Store instead of running code.
            found = lines.find(l => !/WindowsApps/i.test(l)) || null;
        }
    } catch (e) {}
    whichCache.set(cmd, found);
    return found;
}
function pythonCmd() {
    if (!IS_WIN) return { cmd: 'python3', args: [] };
    if (which('py')) return { cmd: 'py', args: ['-3'] };
    if (which('python')) return { cmd: 'python', args: [] };
    return { cmd: 'python', args: [] };
}
const q = (x) => '"' + String(x).replace(/"/g, '\\"') + '"';
// .cmd shims (npx, npm) cannot be spawned directly on Windows.
function shimmed(cmd, args) {
    if (!IS_WIN || !/^(npx|npm|pnpm|yarn|tsc|ts-node)$/i.test(cmd)) return { cmd, args };
    return { cmd: 'cmd.exe', args: ['/d', '/s', '/c', [cmd, ...args.map(q)].join(' ')], windowsVerbatimArguments: true };
}
const WINGET = { node: 'OpenJS.NodeJS.LTS', python: 'Python.Python.3.12', py: 'Python.Python.3.12', ruby: 'RubyInstallerTeam.Ruby.3.3', php: 'PHP.PHP.8.3', go: 'GoLang.Go', gcc: 'BrechtSanders.WinLibs.POSIX.UCRT', 'g++': 'BrechtSanders.WinLibs.POSIX.UCRT', javac: 'Microsoft.OpenJDK.21', java: 'Microsoft.OpenJDK.21', rustc: 'Rustlang.Rustup', git: 'Git.Git', npx: 'OpenJS.NodeJS.LTS' };
function missingHint(cmd) {
    const base = String(cmd).replace(/\.exe$/i, '');
    if (IS_WIN && WINGET[base]) return `"${base}" isn't installed or isn't on PATH. Install it with:  winget install ${WINGET[base]}   (then restart Wizard Code).`;
    return `"${cmd}" isn't available on this system.`;
}
// On Windows, bash scripts run through Git Bash, or WSL if that is what is installed.
function bashCommand(file) {
    if (!IS_WIN) return { cmd: 'bash', args: [file] };
    const cands = [process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'), process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe')].filter(Boolean);
    const gb = cands.find(c => fs.existsSync(c));
    if (gb) return { cmd: gb, args: [file] };
    if (which('wsl')) { const m = /^([A-Za-z]):[\\/](.*)$/.exec(file); return { cmd: 'wsl.exe', args: ['bash', m ? '/mnt/' + m[1].toLowerCase() + '/' + m[2].replace(/\\/g, '/') : file] }; }
    return null;
}
function killTree(proc) {
    if (!proc) return;
    if (IS_WIN && proc.pid) { try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch (e) {} }
    try { proc.kill('SIGKILL'); } catch (e) {}
}
// Taskbar button shows an indeterminate bar while code is running, and flashes if it finishes in the background.
function updateRunProgress(finished) {
    if (!mainWindow || mainWindow.isDestroyed() || process.platform === 'linux') return;
    try {
        mainWindow.setProgressBar(runningProcesses.size ? 2 : -1, runningProcesses.size ? { mode: 'indeterminate' } : undefined);
        if (finished && !mainWindow.isFocused()) mainWindow.flashFrame(true);
    } catch (e) {}
}

// ─── File tree helpers ───
const IGNORED_DIRS = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'build', '__pycache__']);

function buildTree(dirPath, depth = 0) {
    const name = path.basename(dirPath);
    let stat;
    try {
        stat = fs.statSync(dirPath);
    } catch (e) {
        return null;
    }

    if (!stat.isDirectory()) {
        return { name, path: dirPath, type: 'file' };
    }

    if (IGNORED_DIRS.has(name) && depth > 0) {
        return { name, path: dirPath, type: 'folder', children: [], truncated: true };
    }

    let entries = [];
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
        return { name, path: dirPath, type: 'folder', children: [] };
    }

    entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    const children = entries
        .filter(e => !IGNORED_DIRS.has(e.name))
        .map(e => {
            const fullPath = path.join(dirPath, e.name);
            if (e.isDirectory()) {
                return buildTree(fullPath, depth + 1);
            }
            return { name: e.name, path: fullPath, type: 'file' };
        })
        .filter(Boolean);

    return { name, path: dirPath, type: 'folder', children };
}

// ─── Interactive code execution ───
// Each run is streamed to the renderer over `run:event:<runId>` as it happens,
// and stdin stays open so programs that call input()/Scanner/scanf etc. work —
// the renderer's terminal panel can send keystrokes back via `run:input`.
const runningProcesses = new Map(); // runId -> ChildProcess

// Java requires a public class/interface/enum to live in a file named after it.
// We must detect the real name rather than renaming the user's type — renaming it
// while leaving constructors/refs untouched breaks the file (constructor name must
// match the class name exactly, so a mismatched rename turns it into an invalid method).
function detectJavaTypeName(code) {
    let m = code.match(/public\s+(?:final\s+|abstract\s+|static\s+)*class\s+(\w+)/);
    if (m) return m[1];
    m = code.match(/public\s+(?:final\s+|abstract\s+)*interface\s+(\w+)/);
    if (m) return m[1];
    m = code.match(/public\s+enum\s+(\w+)/);
    if (m) return m[1];
    m = code.match(/public\s+record\s+(\w+)/);
    if (m) return m[1];
    // No public type — fall back to the first declared type of any visibility.
    m = code.match(/\b(?:class|interface|enum|record)\s+(\w+)/);
    if (m) return m[1];
    return null;
}

function startRun(language, code, runId, sender) {
    const channel = `run:event:${runId}`;
    const send = (evt) => { try { sender.send(channel, evt); } catch (e) {} };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-run-'));
    const cleanupDir = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} };

    let file;
    try {
        switch (language) {
            case 'javascript':
            case 'jsx':
                file = path.join(tmpDir, 'main.js');
                fs.writeFileSync(file, code);
                spawnRun('node', [file], tmpDir, runId, send, cleanupDir);
                break;
            case 'typescript':
            case 'tsx':
                file = path.join(tmpDir, 'main.ts');
                fs.writeFileSync(file, code);
                spawnRun('npx', ['-y', 'ts-node', '--transpile-only', file], tmpDir, runId, send, cleanupDir);   // .cmd shim handled in spawnRun
                break;
            case 'python':
                file = path.join(tmpDir, 'main.py');
                fs.writeFileSync(file, code);
                { const py = pythonCmd(); spawnRun(py.cmd, [...py.args, '-u', file], tmpDir, runId, send, cleanupDir); }
                break;
            case 'ruby':
                file = path.join(tmpDir, 'main.rb');
                fs.writeFileSync(file, code);
                spawnRun('ruby', [file], tmpDir, runId, send, cleanupDir);
                break;
            case 'php':
                file = path.join(tmpDir, 'main.php');
                fs.writeFileSync(file, code);
                spawnRun('php', [file], tmpDir, runId, send, cleanupDir);
                break;
            case 'go':
                file = path.join(tmpDir, 'main.go');
                fs.writeFileSync(file, code);
                spawnRun('go', ['run', file], tmpDir, runId, send, cleanupDir);
                break;
            case 'shell': {
                file = path.join(tmpDir, 'main.sh');
                fs.writeFileSync(file, code.replace(/\r\n/g, '\n'));
                const b = bashCommand(file);
                if (!b) { cleanupDir(); send({ type: 'error', error: 'Running .sh needs bash. Install Git for Windows (winget install Git.Git) or WSL, then restart Wizard Code. For Windows scripts use PowerShell (.ps1) or Batch (.bat).' }); break; }
                spawnRun(b.cmd, b.args, tmpDir, runId, send, cleanupDir);
                break;
            }
            case 'powershell': {
                file = path.join(tmpDir, 'main.ps1');
                fs.writeFileSync(file, '\ufeff' + code);
                const ps = which('pwsh') ? 'pwsh' : (IS_WIN ? 'powershell.exe' : 'pwsh');
                spawnRun(ps, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], tmpDir, runId, send, cleanupDir);
                break;
            }
            case 'bat': {
                file = path.join(tmpDir, 'main.bat');
                fs.writeFileSync(file, code.replace(/\r?\n/g, '\r\n'));
                if (!IS_WIN) { cleanupDir(); send({ type: 'error', error: 'Batch files only run on Windows.' }); break; }
                spawnRun('cmd.exe', ['/d', '/c', file], tmpDir, runId, send, cleanupDir);
                break;
            }
            case 'c': {
                file = path.join(tmpDir, 'main.c');
                const outBin = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main.out');
                fs.writeFileSync(file, code);
                compileThenRun('gcc', [file, '-o', outBin], outBin, [], tmpDir, runId, send, cleanupDir);
                break;
            }
            case 'cpp': {
                file = path.join(tmpDir, 'main.cpp');
                const outBin = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main.out');
                fs.writeFileSync(file, code);
                compileThenRun('g++', [file, '-o', outBin, '-std=c++17'], outBin, [], tmpDir, runId, send, cleanupDir);
                break;
            }
            case 'java': {
                const className = detectJavaTypeName(code) || 'Main';
                file = path.join(tmpDir, `${className}.java`);
                fs.writeFileSync(file, code);
                compileThenRun('javac', [file], 'java', ['-cp', tmpDir, className], tmpDir, runId, send, cleanupDir);
                break;
            }
            case 'rust': {
                file = path.join(tmpDir, 'main.rs');
                const outBin = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main.out');
                fs.writeFileSync(file, code);
                compileThenRun('rustc', [file, '-o', outBin], outBin, [], tmpDir, runId, send, cleanupDir);
                break;
            }
            default:
                cleanupDir();
                send({ type: 'error', error: `Running "${language}" isn't supported yet.` });
        }
    } catch (error) {
        cleanupDir();
        send({ type: 'error', error: error.message });
    }
}

function compileThenRun(compileCmd, compileArgs, runCmd, runArgs, tmpDir, runId, send, cleanupDir) {
    const compiler = spawn(compileCmd, compileArgs, { cwd: tmpDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let compileErr = '';
    compiler.stderr?.on('data', (d) => (compileErr += d.toString()));

    compiler.on('error', (err) => {
        cleanupDir();
        send({ type: 'error', error: missingHint(compileCmd) });
    });

    compiler.on('close', (code) => {
        if (code !== 0) {
            cleanupDir();
            if (compileErr) send({ type: 'stderr', text: compileErr });
            send({ type: 'error', error: 'Compilation failed' });
            return;
        }
        spawnRun(runCmd, runArgs, tmpDir, runId, send, cleanupDir);
    });
}

function spawnRun(cmd, args, tmpDir, runId, send, cleanupDir) {
    let child;
    try {
        // stdin is left open (piped) on purpose so interactive programs (input(),
        // Scanner, scanf...) work — the renderer's terminal can write to it via run:input.
        const sh = shimmed(cmd, args);
        child = spawn(sh.cmd, sh.args, { cwd: tmpDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, windowsVerbatimArguments: sh.windowsVerbatimArguments, env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }) });
    } catch (err) {
        cleanupDir();
        send({ type: 'error', error: missingHint(cmd) });
        return;
    }

    runningProcesses.set(runId, child);
    updateRunProgress(false);

    // Safety net only, not a normal-operation timeout: a program legitimately waiting
    // on input should run as long as it needs to. This just guards against a truly
    // forgotten/runaway process consuming resources forever.
    const safety = setTimeout(() => {
        if (runningProcesses.has(runId)) {
            killTree(child);
        }
    }, 5 * 60 * 1000);

    child.stdout?.on('data', (d) => send({ type: 'stdout', text: d.toString() }));
    child.stderr?.on('data', (d) => send({ type: 'stderr', text: d.toString() }));

    child.on('error', (err) => {
        clearTimeout(safety);
        runningProcesses.delete(runId);
        updateRunProgress(true);
        cleanupDir();
        send({ type: 'error', error: missingHint(cmd) });
    });

    child.on('close', (code) => {
        clearTimeout(safety);
        runningProcesses.delete(runId);
        updateRunProgress(true);
        cleanupDir();
        send({ type: 'exit', code, success: code === 0 });
    });
}

// ─── Git (shells out to the real `git` CLI — no bundled git library, so it behaves
// exactly like the git already on your system, same as VS Code's own Git integration) ───
function runGit(args, cwd) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn('git', ['-c', 'core.quotepath=false', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        } catch (err) {
            resolve({ success: false, error: `git isn't available on this system. (${err.message})` });
            return;
        }
        let stdout = '', stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', (err) => resolve({ success: false, error: `git isn't available on this system. (${err.message})` }));
        child.on('close', (code) => resolve({ success: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code }));
    });
}

function parseGitStatus(porcelain) {
    const lines = porcelain.split('\n').filter(Boolean);
    let branch = null, tracking = null, ahead = 0, behind = 0;
    const staged = [], unstaged = [], untracked = [];
    const statusLabel = (code) => ({ M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'unmerged' }[code] || 'modified');

    lines.forEach((line) => {
        if (line.startsWith('##')) {
            const info = line.slice(3);
            const m = info.match(/^(\S+?)(?:\.\.\.(\S+))?(?:\s+\[(.+)\])?$/);
            if (m) {
                branch = m[1] === 'HEAD (no branch)' ? null : m[1];
                tracking = m[2] || null;
                if (m[3]) {
                    const aheadMatch = m[3].match(/ahead (\d+)/);
                    const behindMatch = m[3].match(/behind (\d+)/);
                    if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
                    if (behindMatch) behind = parseInt(behindMatch[1], 10);
                }
            }
            return;
        }
        const x = line[0], y = line[1];
        const rest = line.slice(3);
        let filePath = rest, oldPath = null;
        if (rest.includes(' -> ')) {
            const parts = rest.split(' -> ');
            oldPath = parts[0];
            filePath = parts[1];
        }
        const unq = (v) => (v.length > 1 && v[0] === '"' && v[v.length - 1] === '"') ? v.slice(1, -1).replace(/\\(["\\])/g, '$1') : v;   // git quotes names with spaces
        filePath = unq(filePath); if (oldPath) oldPath = unq(oldPath);
        if (x === '?' && y === '?') { untracked.push({ path: filePath }); return; }
        if (x !== ' ' && x !== '?') staged.push({ path: filePath, oldPath, status: statusLabel(x) });
        if (y !== ' ' && y !== '?') unstaged.push({ path: filePath, oldPath, status: statusLabel(y) });
    });

    return { branch, tracking, ahead, behind, staged, unstaged, untracked };
}

// ─── AI commit message from the actual staged diff ───
async function generateCommitMessageGroq(diffText) {
    const trimmed = (diffText || '').slice(0, 6000);
    return callGroqOnce([
        {
            role: 'system',
            content: 'You write concise, conventional git commit messages. Given a git diff of staged changes, respond with ONLY the commit message: a short imperative-mood subject line under 72 characters with no trailing period, optionally followed by a blank line and up to 3 short bullet points if genuinely useful for a non-trivial change. No markdown code fences, no commentary, no quotes around the message.'
        },
        { role: 'user', content: `Staged diff:\n${trimmed}\n\nCommit message:` }
    ], { temperature: 0.3, maxTokens: 200 });
}

function openExternalTerminal(cwd) {
    const dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    const tryRun = (cmd, args, opts) => { try { const c = spawn(cmd, args, Object.assign({ cwd: dir, detached: true, stdio: 'ignore' }, opts)); c.on('error', () => {}); c.unref(); return true; } catch (e) { return false; } };
    if (IS_WIN) {
        if (which('wt')) return tryRun('wt.exe', ['-d', dir]);
        return tryRun('cmd.exe', ['/c', 'start', '', 'powershell.exe', '-NoExit'], { windowsHide: false });
    }
    if (process.platform === 'darwin') return tryRun('open', ['-a', 'Terminal', dir]);
    for (const [c, a] of [['x-terminal-emulator', []], ['konsole', ['--workdir', dir]], ['gnome-terminal', ['--working-directory=' + dir]], ['kgx', []], ['alacritty', ['--working-directory', dir]], ['xterm', []]]) if (which(c) && tryRun(c, a)) return true;
    return false;
}

function registerIpcHandlers() {
    // ─── Dialogs ───
    ipcMain.handle('dialog:open-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('win:overlay', (event, bg, fg) => {
        const ok = v => typeof v === 'string' && /^(#[0-9a-f]{6}|rgba?\([\d\s,.%]+\))$/i.test(v.trim());
        if (ok(bg)) winState.bg = bg;
        if (ok(fg)) winState.fg = fg;
        queueSaveState();
        if (!useOverlay() || !mainWindow || mainWindow.isDestroyed() || !mainWindow.setTitleBarOverlay) return false;
        try { mainWindow.setTitleBarOverlay({ color: ok(bg) ? bg : '#0b0919', symbolColor: ok(fg) ? fg : '#d4d0e8', height: TITLEBAR_H }); return true; } catch (e) { return false; }
    });
    // The in-app title bar opens the real native menus.
    ipcMain.handle('win:menu', (event, index, x, y) => {
        const t = appMenuTemplate[index]; if (!t || !t.submenu || !mainWindow) return false;
        Menu.buildFromTemplate(t.submenu).popup({ window: mainWindow, x: Math.round(x), y: Math.round(y) });
        return true;
    });
    ipcMain.handle('win:menu-labels', () => appMenuTemplate.map(t => String(t.label || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()));
    ipcMain.handle('shell:reveal', (event, p) => { if (typeof p === 'string' && fs.existsSync(p)) { shell.showItemInFolder(p); return true; } return false; });
    ipcMain.handle('shell:terminal', (event, cwd) => openExternalTerminal(cwd));
    ipcMain.handle('dialog:open-file', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'All Files', extensions: ['*'] },
                { name: 'Code Files', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'json', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'rb', 'php', 'sh', 'sql', 'md', 'yaml', 'yml', 'cs'] }
            ]
        });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('dialog:save-file', async (event, defaultPath) => {
        const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultPath || 'untitled.js' });
        if (result.canceled) return null;
        return result.filePath;
    });

    // ─── File system ───
    ipcMain.handle('fs:read-file', async (event, filePath) => {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return { success: true, content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:write-file', async (event, filePath, content) => {
        try {
            fs.writeFileSync(filePath, content, 'utf-8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:read-tree', async (event, rootPath) => {
        try {
            const tree = buildTree(rootPath);
            return { success: true, tree };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:create-file', async (event, dirPath, name) => {
        try {
            const fullPath = path.join(dirPath, name);
            if (fs.existsSync(fullPath)) return { success: false, error: 'A file with that name already exists' };
            fs.writeFileSync(fullPath, '', 'utf-8');
            return { success: true, path: fullPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:create-folder', async (event, dirPath, name) => {
        try {
            const fullPath = path.join(dirPath, name);
            if (fs.existsSync(fullPath)) return { success: false, error: 'A folder with that name already exists' };
            fs.mkdirSync(fullPath);
            return { success: true, path: fullPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:rename', async (event, oldPath, newName) => {
        try {
            const newPath = path.join(path.dirname(oldPath), newName);
            fs.renameSync(oldPath, newPath);
            return { success: true, newPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:delete', async (event, targetPath) => {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:move', async (event, sourcePath, destDirPath) => {
        try {
            const destPath = path.join(destDirPath, path.basename(sourcePath));
            if (path.resolve(destPath) === path.resolve(sourcePath)) {
                return { success: true, newPath: destPath };
            }
            if (fs.existsSync(destPath)) {
                return { success: false, error: 'A file or folder with that name already exists there' };
            }
            const normSrc = path.resolve(sourcePath) + path.sep;
            const normDestDir = path.resolve(destDirPath) + path.sep;
            if (normDestDir === normSrc || normDestDir.startsWith(normSrc)) {
                return { success: false, error: "Can't move a folder into itself or one of its own subfolders" };
            }
            fs.renameSync(sourcePath, destPath);
            return { success: true, newPath: destPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:get-home', async () => app.getPath('home'));

    // ─── Settings persistence ───
    const settingsPath = path.join(app.getPath('userData'), 'wizard-settings.json');
    ipcMain.handle('settings:load', async () => {
        try {
            if (!fs.existsSync(settingsPath)) return {};
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        } catch (e) {
            return {};
        }
    });
    ipcMain.handle('settings:save', async (event, settings) => {
        try {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ─── Run code (interactive, streaming) ───
    ipcMain.handle('run:start', async (event, { language, code, runId }) => {
        startRun(language, code, runId, event.sender);
        return { started: true };
    });

    ipcMain.on('run:input', (event, { runId, text }) => {
        const proc = runningProcesses.get(runId);
        if (proc && proc.stdin && !proc.stdin.destroyed) {
            try { proc.stdin.write(text); } catch (e) {}
        }
    });

    ipcMain.on('run:kill', (event, { runId }) => {
        const proc = runningProcesses.get(runId);
        if (proc) killTree(proc);
    });

    // ─── AI chat (streaming via Groq) ───
    ipcMain.handle('ai:chat', async (event, { messages, requestId }) => {
        return streamGroqChat(messages, requestId, event.sender);
    });

    // ─── AI inline code completion (single-shot, low-latency) ───
    ipcMain.handle('ai:complete', async (event, { prefix, suffix, language }) => {
        return completeGroqInline(prefix, suffix, language);
    });

    // ─── AI agent turn (tool-calling loop step for multi-file agent mode) ───
    ipcMain.handle('ai:agent-turn', async (event, { messages, tools }) => {
        return agentTurnGroq(messages, tools);
    });

    // ─── Real syntax/compile check (no AI — the actual compiler/interpreter, same as VS Code's language extensions use) ───
    ipcMain.handle('lint:check', async (event, { code, language }) => {
        return new Promise((resolve) => runSyntaxCheck(language, code, resolve));
    });

    // ─── AI hover explanation for a diagnostic ───
    ipcMain.handle('ai:explain-error', async (event, { message, codeWindow, language }) => {
        return explainErrorGroq(message, codeWindow, language);
    });

    // ─── AI scoped fix for a diagnostic ───
    ipcMain.handle('ai:fix-range', async (event, { message, codeWindow, language }) => {
        return fixRangeGroq(message, codeWindow, language);
    });

    ipcMain.handle('ai:status', async () => {
        return { configured: !!getAiApiKey() };
    });

    // ─── Git ───
    ipcMain.handle('git:status', async (event, { cwd }) => {
        const check = await runGit(['rev-parse', '--is-inside-work-tree'], cwd);
        if (!check.success) return { success: true, isRepo: false };
        const res = await runGit(['status', '--porcelain=v1', '-b'], cwd);
        if (!res.success) return { success: false, error: res.stderr };
        return { success: true, isRepo: true, ...parseGitStatus(res.stdout) };
    });

    ipcMain.handle('git:diff-content', async (event, { cwd, relPath, staged, isUntracked, isDeleted }) => {
        let original = '';
        let modified = '';
        if (!isUntracked) {
            const showRes = await runGit(['show', `HEAD:${relPath}`], cwd);
            original = showRes.success ? showRes.stdout : '';
        }
        if (staged && isDeleted) {
            modified = '';
        } else if (staged) {
            const showStaged = await runGit(['show', `:${relPath}`], cwd);
            modified = showStaged.success ? showStaged.stdout : '';
        } else if (isDeleted) {
            modified = '';
        } else {
            try { modified = fs.readFileSync(path.join(cwd, relPath), 'utf-8'); } catch (e) { modified = ''; }
        }
        return { success: true, original, modified };
    });

    ipcMain.handle('git:stage', async (event, { cwd, paths }) => runGit(['add', '--', ...paths], cwd));
    ipcMain.handle('git:unstage', async (event, { cwd, paths }) => runGit(['reset', 'HEAD', '--', ...paths], cwd));

    ipcMain.handle('git:discard', async (event, { cwd, relPath, isUntracked }) => {
        if (isUntracked) {
            try { fs.rmSync(path.join(cwd, relPath), { force: true }); return { success: true }; }
            catch (e) { return { success: false, error: e.message }; }
        }
        return runGit(['checkout', '--', relPath], cwd);
    });

    ipcMain.handle('git:commit', async (event, { cwd, message }) => {
        if (!message || !message.trim()) return { success: false, error: 'Commit message required' };
        return runGit(['commit', '-m', message], cwd);
    });

    ipcMain.handle('git:push', async (event, { cwd }) => {
        let res = await runGit(['push'], cwd);
        if (!res.success && /no upstream branch/i.test(res.stderr)) {
            const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
            const branch = branchRes.stdout.trim();
            if (branch) res = await runGit(['push', '-u', 'origin', branch], cwd);
        }
        return res;
    });
    ipcMain.handle('git:pull', async (event, { cwd }) => runGit(['pull'], cwd));

    ipcMain.handle('git:branches', async (event, { cwd }) => {
        const currentRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
        const listRes = await runGit(['branch', '--format=%(refname:short)'], cwd);
        if (!listRes.success) return { success: false, error: listRes.stderr };
        const branches = listRes.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
        return { success: true, branches, current: currentRes.stdout.trim() };
    });
    ipcMain.handle('git:checkout-branch', async (event, { cwd, branch }) => runGit(['checkout', branch], cwd));
    ipcMain.handle('git:create-branch', async (event, { cwd, branch }) => runGit(['checkout', '-b', branch], cwd));
    ipcMain.handle('git:init', async (event, { cwd }) => runGit(['init'], cwd));

    ipcMain.handle('git:staged-diff-text', async (event, { cwd }) => {
        const res = await runGit(['diff', '--cached'], cwd);
        return { success: res.success, text: res.stdout, error: res.stderr };
    });

    ipcMain.handle('git:log', async (event, { cwd, limit }) => {
        const res = await runGit(['log', `-${limit || 20}`, '--pretty=format:%H|%an|%ad|%s', '--date=relative'], cwd);
        if (!res.success) return { success: true, commits: [] }; // likely just no commits yet
        const commits = res.stdout.split('\n').filter(Boolean).map((line) => {
            const [hash, author, date, ...msgParts] = line.split('|');
            return { hash, author, date, message: msgParts.join('|') };
        });
        return { success: true, commits };
    });

    ipcMain.handle('ai:commit-message', async (event, { diffText }) => generateCommitMessageGroq(diffText));
}

// ─── Groq inline completion (non-streaming, short + fast) ───
async function completeGroqInline(prefix, suffix, language) {
    const apiKey = getAiApiKey();
    if (!apiKey) return { success: false, error: 'No AI_API_KEY (or GROQ_API_KEY) configured' };

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: AI_FAST_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a code-completion engine embedded in a code editor. Given the code immediately before and after the cursor, respond with ONLY the raw text that should be inserted at the cursor to continue the code naturally and correctly. Never include markdown code fences, explanations, or repeat code that is already present. Keep completions short — usually one line, at most a few lines. If nothing sensible should be inserted, respond with an empty string.'
                    },
                    {
                        role: 'user',
                        content: `Language: ${language}\n\n--- CODE BEFORE CURSOR ---\n${prefix}\n--- CODE AFTER CURSOR ---\n${suffix}\n--- END ---\n\nInsert text at the cursor:`
                    }
                ],
                temperature: 0.2,
                max_tokens: 150,
                stream: false
            })
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { success: false, error: `Groq API error (${response.status}): ${text || response.statusText}` };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        return { success: true, text };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ─── Agent turn: a single tool-calling capable Groq request (non-streaming, since
// tool_calls need to be parsed as structured JSON before the renderer can act on them) ───
async function agentTurnGroq(messages, tools) {
    const apiKey = getAiApiKey();
    if (!apiKey) return { success: false, error: 'No AI_API_KEY (or GROQ_API_KEY) configured' };
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: AI_AGENT_MODEL,
                messages,
                tools,
                tool_choice: 'auto',
                temperature: 0.2,
                max_tokens: 3000,
                stream: false
            })
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { success: false, error: `Groq API error (${response.status}): ${text || response.statusText}` };
        }
        const data = await response.json();
        const message = data.choices?.[0]?.message;
        if (!message) return { success: false, error: 'No response from model' };
        return { success: true, message };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ─── Shared non-streaming Groq call (defaults to the fast model) ───
async function callGroqOnce(messages, { temperature = 0.2, maxTokens = 400, model = AI_FAST_MODEL } = {}) {
    const apiKey = getAiApiKey();
    if (!apiKey) return { success: false, error: 'No AI_API_KEY (or GROQ_API_KEY) configured' };

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false })
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { success: false, error: `Groq API error (${response.status}): ${text || response.statusText}` };
        }
        const data = await response.json();
        return { success: true, text: data.choices?.[0]?.message?.content || '' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ─── Background lint: catches syntax/logic issues an AI can spot, across any language ───
// Real, no-AI syntax/compile checking — each language's own toolchain in "check only"
// mode, the same category of tool VS Code's language extensions run under the hood.
// Returns { success: true, text } where text is the raw diagnostic output for the
// renderer to parse with parseCompilerErrors (same parser the Run pipeline already
// uses for compile failures, so formats line up).
function runSyntaxCheck(language, code, callback) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-lint-'));
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} };
    const skip = () => { cleanup(); callback({ success: true, text: '' }); };

    let file, cmd, args;
    try {
        switch (language) {
            case 'python':
                file = path.join(tmpDir, 'lint.py');
                fs.writeFileSync(file, code);
                cmd = process.platform === 'win32' ? 'python' : 'python3';
                args = ['-m', 'py_compile', file];
                break;
            case 'ruby':
                file = path.join(tmpDir, 'lint.rb');
                fs.writeFileSync(file, code);
                cmd = 'ruby'; args = ['-c', file];
                break;
            case 'php':
                file = path.join(tmpDir, 'lint.php');
                fs.writeFileSync(file, code);
                cmd = 'php'; args = ['-l', file];
                break;
            case 'shell':
                if (process.platform === 'win32') { skip(); return; }
                file = path.join(tmpDir, 'lint.sh');
                fs.writeFileSync(file, code);
                cmd = 'bash'; args = ['-n', file];
                break;
            case 'c':
                file = path.join(tmpDir, 'lint.c');
                fs.writeFileSync(file, code);
                cmd = 'gcc'; args = ['-fsyntax-only', '-Wall', file];
                break;
            case 'cpp':
                file = path.join(tmpDir, 'lint.cpp');
                fs.writeFileSync(file, code);
                cmd = 'g++'; args = ['-fsyntax-only', '-Wall', '-std=c++17', file];
                break;
            case 'java': {
                const className = detectJavaTypeName(code) || 'Main';
                file = path.join(tmpDir, `${className}.java`);
                fs.writeFileSync(file, code);
                cmd = 'javac'; args = ['-Xlint', '-d', tmpDir, file];
                break;
            }
            case 'go':
                file = path.join(tmpDir, 'lint.go');
                fs.writeFileSync(file, code);
                cmd = 'go'; args = ['vet', file];
                break;
            case 'rust':
                file = path.join(tmpDir, 'lint.rs');
                fs.writeFileSync(file, code);
                cmd = 'rustc'; args = ['--edition', '2021', '-o', path.join(tmpDir, 'lint.out'), file];
                break;
            default:
                // javascript/typescript/json/css/html etc. already get live diagnostics
                // straight from Monaco's built-in language services — nothing to shell out to.
                skip();
                return;
        }
    } catch (error) {
        cleanup();
        callback({ success: false, error: error.message });
        return;
    }

    let child;
    try {
        child = spawn(cmd, args, { cwd: tmpDir, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
        skip();
        return;
    }

    let out = '';
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => (out += d.toString()));
    child.on('error', () => skip()); // tool not installed on this system -- fail quiet, don't nag
    child.on('close', () => { cleanup(); callback({ success: true, text: out }); });
}

// ─── Hover explanation for a single diagnostic ───
async function explainErrorGroq(message, codeWindow, language) {
    const res = await callGroqOnce([
        {
            role: 'system',
            content: 'You explain code errors concisely for a hover tooltip in an editor. Given an error/warning message and the surrounding code, explain in 1-2 short sentences WHY it happens. No markdown, no code fences, no restating the message verbatim, no preamble like "This error occurs because" -- just the reason.'
        },
        { role: 'user', content: `Language: ${language}\nDiagnostic: ${message}\n\nSurrounding code:\n${codeWindow}\n\nExplain why, in 1-2 sentences:` }
    ], { temperature: 0.3, maxTokens: 150 });
    return res;
}

// ─── Scoped fix for a single diagnostic — returns only the corrected snippet ───
async function fixRangeGroq(message, codeWindow, language) {
    const res = await callGroqOnce([
        {
            role: 'system',
            content: 'You fix a small snippet of code that has an error. Respond with ONLY the corrected version of the exact snippet given -- same number of lines where possible, no markdown code fences, no explanations, no commentary. Preserve the original indentation style.'
        },
        { role: 'user', content: `Language: ${language}\nDiagnostic to fix: ${message}\n\nSnippet:\n${codeWindow}\n\nCorrected snippet:` }
    ], { temperature: 0.1, maxTokens: 400 });
    return res;
}

// ─── Groq streaming chat ───
async function streamGroqChat(messages, requestId, sender) {
    const apiKey = getAiApiKey();
    const channel = `ai:chunk:${requestId}`;

    if (!apiKey) {
        const msg = 'No API key found. Add a .env file next to main.js with either:\nAI_API_KEY="your_key_here"   (any OpenAI-compatible provider)\nor\nGROQ_API_KEY="your_key_here"  (Groq specifically)\nthen restart Wizard Code.';
        sender.send(channel, { type: 'error', error: msg });
        return { success: false, error: msg };
    }

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages,
                stream: true,
                temperature: 0.4
            })
        });

        if (!response.ok || !response.body) {
            const text = await response.text().catch(() => '');
            const msg = `Groq API error (${response.status}): ${text || response.statusText}`;
            sender.send(channel, { type: 'error', error: msg });
            return { success: false, error: msg };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
                const line = part.trim();
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullText += delta;
                        sender.send(channel, { type: 'delta', text: delta });
                    }
                } catch (e) {
                    // ignore malformed chunk
                }
            }
        }

        sender.send(channel, { type: 'done' });
        return { success: true, text: fullText };
    } catch (error) {
        const msg = `Connection error: ${error.message}`;
        sender.send(channel, { type: 'error', error: msg });
        return { success: false, error: msg };
    }
}

// ─── Menu ───
let appMenuTemplate = [];
function aiConfigFile() {
    const f = path.join(app.getPath('userData'), '.env');
    if (!fs.existsSync(f)) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '# Wizard Code AI settings. Save, then restart Wizard Code.\nAI_API_KEY=\n# Optional overrides (any OpenAI-compatible provider):\n# AI_BASE_URL=https://api.mistral.ai/v1/chat/completions\n# AI_MODEL=\n# AI_FAST_MODEL=\n# AI_AGENT_MODEL=\n'); } catch (e) {} }
    return f;
}
function buildMenu() {
    const send = (channel) => () => mainWindow?.webContents.send(channel);

    const menuTemplate = [
        {
            label: '🧙 Wizard Code',
            submenu: [
                {
                    label: 'About Wizard Code',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Wizard Code',
                            message: 'Wizard Code v2.0.0',
                            detail: 'A Monaco-powered code editor with a real file explorer, multi-language execution, and Wizard AI.\n\nBuilt by Arnav Gupta',
                            buttons: ['OK']
                        });
                    }
                },
                { type: 'separator' },
                { label: 'Preferences', click: send('menu:settings') },
                { type: 'separator' },
                { label: 'Quit', role: 'quit', accelerator: 'CmdOrCtrl+Q' }
            ]
        },
        {
            label: '📁 File',
            submenu: [
                { label: 'New File', click: send('menu:new-file') },
                { label: 'Open File…', click: send('menu:open-file') },
                { label: 'Open Folder…', click: send('menu:open-folder') },
                { type: 'separator' },
                { label: 'Save', click: send('menu:save') },
                { label: 'Save As…', click: send('menu:save-as') },
                { label: 'Save All', click: send('menu:save-all') },
                { type: 'separator' },
                { label: 'Open Terminal Here', click: send('menu:terminal') },
                { label: IS_WIN ? 'Reveal in File Explorer' : 'Reveal in File Manager', click: send('menu:reveal') }
            ]
        },
        {
            label: '✏️ Edit',
            submenu: [
                { label: 'Undo', role: 'undo', accelerator: 'CmdOrCtrl+Z' },
                { label: 'Redo', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
                { type: 'separator' },
                { label: 'Cut', role: 'cut', accelerator: 'CmdOrCtrl+X' },
                { label: 'Copy', role: 'copy', accelerator: 'CmdOrCtrl+C' },
                { label: 'Paste', role: 'paste', accelerator: 'CmdOrCtrl+V' },
                { label: 'Select All', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
                { type: 'separator' },
                { label: 'Find', click: send('menu:find') },
                { label: 'Replace', click: send('menu:replace') },
                { label: 'Go to Line…', click: send('menu:goto-line') },
                { label: 'Command Palette…', click: send('menu:command-palette') }
            ]
        },
        {
            label: '🔧 View',
            submenu: [
                { label: 'Reload', role: 'reload', accelerator: 'CmdOrCtrl+R' },
                { label: 'Toggle Developer Tools', role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
                { type: 'separator' },
                { label: 'Toggle Sidebar', click: send('menu:toggle-sidebar') },
                { label: 'Toggle Terminal', click: send('menu:toggle-terminal') },
                { label: 'Toggle Wizard AI', click: send('menu:toggle-ai') },
                { type: 'separator' },
                { label: 'Zoom In', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
                { label: 'Zoom Out', role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
                { label: 'Actual Size', role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
                { label: 'Toggle Full Screen', role: 'togglefullscreen', accelerator: 'F11' }
            ]
        },
        {
            label: '🤖 AI',
            submenu: [
                { label: 'Explain Selection', click: send('menu:ai-explain') },
                { label: 'Fix Selection', click: send('menu:ai-fix') },
                { label: 'Generate Code…', click: send('menu:ai-generate') },
                { label: 'Add Comments', click: send('menu:ai-comment') }
            ]
        },
        {
            label: '▶️ Run',
            submenu: [
                { label: 'Run / Stop', click: send('menu:run') },
                { label: 'Preview', click: send('menu:preview') }
            ]
        },
        {
            label: '❓ Help',
            submenu: [
                { label: 'Documentation', click: () => shell.openExternal('https://github.com/AG-Ultima/wizard-code') },
                { label: 'Open AI Settings File (.env)', click: () => shell.openPath(aiConfigFile()) },
                {
                    label: 'Keyboard Shortcuts',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Keyboard Shortcuts',
                            message: 'Wizard Code Shortcuts',
                            detail: '⌘/Ctrl+N New File\n⌘/Ctrl+O Open File\n⌘/Ctrl+Shift+O Open Folder\n⌘/Ctrl+S Save\n⌘/Ctrl+Shift+S Save As\n⌘/Ctrl+W Close Tab\n⌘/Ctrl+Tab Next Tab\n⌘/Ctrl+Shift+Tab Previous Tab\n⌘/Ctrl+Shift+T Reopen Closed Tab\n⌘/Ctrl+Enter Run / Stop\n⌘/Ctrl+Shift+V Preview\n⌘/Ctrl+` Toggle Terminal\n⌘/Ctrl+Shift+A Toggle Wizard AI\n⌘/Ctrl+Shift+P Command Palette\n⌘/Ctrl+B Toggle Sidebar\n⌘/Ctrl+Shift+E Focus Explorer\n⌘/Ctrl+Shift+F Search\n⌘/Ctrl+F Find\n⌘/Ctrl+H Replace\n⌘/Ctrl+G Go to Line\nDelete Delete selected file/folder',
                            buttons: ['Got it!']
                        });
                    }
                }
            ]
        }
    ];

    appMenuTemplate = menuTemplate;
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// One running copy: a second launch (e.g. GitHub Desktop opening another repo) opens its paths in the existing window.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        focusMainWindow();
        deliverOpenRequest(parseLaunchArgs(commandLine, workingDirectory));
        deliverFlags(commandLine);
    });
    // macOS: Finder "Open with" / dropping a file or folder on the dock icon
    app.on('open-file', (event, p) => { event.preventDefault(); deliverOpenRequest(parseLaunchArgs(['x', p], process.cwd())); });
}

app.whenReady().then(async () => {
    if (!gotInstanceLock) return;   // a copy is already running; it receives our paths
    nativeTheme.themeSource = 'dark';   // dark GTK/Qt dialogs and context menus to match the app
    registerIpcHandlers();
    buildMenu();
    try {
        localServer = await startLocalServer();
    } catch (err) {
        dialog.showErrorBox('Wizard Code failed to start', `Could not start the local server: ${err.message}`);
        app.quit();
        return;
    }
    launchQueue.push(parseLaunchArgs(process.argv, process.cwd()));
    launchQueue = launchQueue.filter(Boolean);
    deliverFlags(process.argv);
    winState = loadWinState();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (localServer) localServer.close();
    if (process.platform !== 'darwin') app.quit();
});