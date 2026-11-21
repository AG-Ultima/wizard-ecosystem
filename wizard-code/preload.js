// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Dialogs
    openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
    openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
    saveFileDialog: (defaultPath) => ipcRenderer.invoke('dialog:save-file', defaultPath),

    // File system
    readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:write-file', filePath, content),
    readTree: (rootPath) => ipcRenderer.invoke('fs:read-tree', rootPath),
    createFile: (dirPath, name) => ipcRenderer.invoke('fs:create-file', dirPath, name),
    createFolder: (dirPath, name) => ipcRenderer.invoke('fs:create-folder', dirPath, name),
    renamePath: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),
    deletePath: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
    movePath: (sourcePath, destDirPath) => ipcRenderer.invoke('fs:move', sourcePath, destDirPath),
    getHomeDir: () => ipcRenderer.invoke('fs:get-home'),

    // Settings
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

    // Interactive code execution — onEvent receives {type:'stdout'|'stderr'|'exit'|'error', ...}
    // and is automatically unsubscribed once a terminal ('exit' or 'error') event fires.
    runCodeStart: (language, code, runId, onEvent) => {
        const channel = `run:event:${runId}`;
        const listener = (event, data) => {
            onEvent(data);
            if (data.type === 'exit' || data.type === 'error') {
                ipcRenderer.removeListener(channel, listener);
            }
        };
        ipcRenderer.on(channel, listener);
        return ipcRenderer.invoke('run:start', { language, code, runId });
    },
    sendRunInput: (runId, text) => ipcRenderer.send('run:input', { runId, text }),
    killRun: (runId) => ipcRenderer.send('run:kill', { runId }),

    // AI status + streaming chat
    aiStatus: () => ipcRenderer.invoke('ai:status'),
    aiComplete: (prefix, suffix, language) => ipcRenderer.invoke('ai:complete', { prefix, suffix, language }),
    lintCheck: (code, language) => ipcRenderer.invoke('lint:check', { code, language }),
    aiExplainError: (message, codeWindow, language) => ipcRenderer.invoke('ai:explain-error', { message, codeWindow, language }),
    aiFixRange: (message, codeWindow, language) => ipcRenderer.invoke('ai:fix-range', { message, codeWindow, language }),
    aiAgentTurn: (messages, tools) => ipcRenderer.invoke('ai:agent-turn', { messages, tools }),

    // Git
    gitStatus: (cwd) => ipcRenderer.invoke('git:status', { cwd }),
    gitDiffContent: (cwd, relPath, staged, isUntracked, isDeleted) => ipcRenderer.invoke('git:diff-content', { cwd, relPath, staged, isUntracked, isDeleted }),
    gitStage: (cwd, paths) => ipcRenderer.invoke('git:stage', { cwd, paths }),
    gitUnstage: (cwd, paths) => ipcRenderer.invoke('git:unstage', { cwd, paths }),
    gitDiscard: (cwd, relPath, isUntracked) => ipcRenderer.invoke('git:discard', { cwd, relPath, isUntracked }),
    gitCommit: (cwd, message) => ipcRenderer.invoke('git:commit', { cwd, message }),
    gitPush: (cwd) => ipcRenderer.invoke('git:push', { cwd }),
    gitPull: (cwd) => ipcRenderer.invoke('git:pull', { cwd }),
    gitBranches: (cwd) => ipcRenderer.invoke('git:branches', { cwd }),
    gitCheckoutBranch: (cwd, branch) => ipcRenderer.invoke('git:checkout-branch', { cwd, branch }),
    gitCreateBranch: (cwd, branch) => ipcRenderer.invoke('git:create-branch', { cwd, branch }),
    gitInit: (cwd) => ipcRenderer.invoke('git:init', { cwd }),
    gitStagedDiffText: (cwd) => ipcRenderer.invoke('git:staged-diff-text', { cwd }),
    gitLog: (cwd, limit) => ipcRenderer.invoke('git:log', { cwd, limit }),
    aiCommitMessage: (diffText) => ipcRenderer.invoke('ai:commit-message', { diffText }),
    aiChatStream: (messages, onChunk) => {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const channel = `ai:chunk:${requestId}`;
        const listener = (event, data) => onChunk(data);
        ipcRenderer.on(channel, listener);
        return ipcRenderer
            .invoke('ai:chat', { messages, requestId })
            .finally(() => ipcRenderer.removeListener(channel, listener));
    },

    // Window chrome (Windows draws the caption buttons; the app draws the title bar + menus)
    chrome: (() => { const a = process.argv.find(x => x.startsWith('--wiz-overlay=')); return { overlay: !!a, height: a ? +a.split('=')[1] : 0 }; })(),
    winOverlay: (bg, fg) => ipcRenderer.invoke('win:overlay', bg, fg),
    winMenu: (i, x, y) => ipcRenderer.invoke('win:menu', i, x, y),
    winMenuLabels: () => ipcRenderer.invoke('win:menu-labels'),
    revealInFolder: (p) => ipcRenderer.invoke('shell:reveal', p),
    openTerminal: (cwd) => ipcRenderer.invoke('shell:terminal', cwd),

    // Menu-triggered events
    onMenu: (channel, callback) => ipcRenderer.on(channel, callback),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
