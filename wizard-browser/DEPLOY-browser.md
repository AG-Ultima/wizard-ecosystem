# Wizard Browser v11 — build and install (Linux / AppImage)

Replace the old project files with these (keep `node_modules` out; run `npm install` again):
`main.js preload.js webview-preload.js index.html package.json lib/ icons/`

## Build on Garuda
```
npm install
npm start                  # run it
npm run build:linux        # dist/Wizard-Browser-11.0.0-x86_64.AppImage
```
If `npm install` skips Electron's download script, run `node node_modules/electron/install.js` once.
Electron is now ^39 (was 28): newer Chromium, KWallet 6 support, current security fixes.

## First run
Settings > General > **Make default** (or the first-run prompt): for an AppImage this writes `~/.local/share/applications/wizard-browser.desktop`, copies the icon into `~/.local/share/icons/hicolor/*`, refreshes the KDE menu cache and sets it as the default browser. Nothing needs root. Keep the AppImage somewhere stable (`~/Applications/`); the menu entry points to where it was when you clicked.
Wayland vs X11 is detected automatically (About tab shows which). If a GPU driver misbehaves: `WIZBROWSER_SAFE=1 ./Wizard-Browser-*.AppImage`. If the AppImage won't start because the sandbox is unavailable: `WIZBROWSER_NOSANDBOX=1` as a last resort.

## Backend
No backend changes. It uses what already exists:
- `browser_routes.py` (`/api/browser/sync`, `/api/browser/data`): bookmarks, workspaces, panels and main settings are stored under `settings.wizardBrowser`, bookmarks in `bookmarks`, tab groups in `tabGroups`. `memory` is never sent. Other keys already in `browser_settings` are kept. Passwords, history and open tabs stay on the computer.
- `/api/login`, `/api/logout`, `/api/check-auth`: sign-in.
- `/api/notes` (+ `/api/notes/ai`): Notes panel, "clip page", Ask AI (summarize / key points / action items / free question about the page).
- `/api/chat/poll`: unread badge on the Chat panel.
Optional: `browser_routes.py` replaces the whole `browser_settings` JSON on every push and has no size limit. A cap of about 1 MB on the request body would be worth adding.

## What's new
- Workspaces share sign-ins by default (Settings > Privacy > "Keep workspaces separate" gives each its own cookie jar), emoji + colour, Ctrl+Alt+1…9. Colour tints the window's top edge.
- Tabs on top (or vertical), pinned tabs, groups, drag to reorder, sleeping tabs, private tabs, reopen closed, per-site zoom.
- Left panel rail: Bookmarks, History, Downloads, Wizard Notes, Ask AI, plus web panels (Chat, Mail, Calendar by default; "+" adds the current page).
- Command palette (Ctrl+K), address bar with tabs/bookmarks/history/DuckDuckGo suggestions and `!g !yt !gh !aur !w !mdn` bangs.
- Built-in ad/tracker blocking (~300 domains, per-page counter), Global Privacy Control, Chrome-like user agent.
- Passwords: encrypted (system keyring, KWallet 6 supported), auto-save prompt, auto-fill on the saved site only, CSV import/export. **Old plain-text passwords from v10 are moved into the vault on first launch and the plain copy is deleted.**
- Chrome Web Store: paste a link/ID in Settings > Extensions, or open a store page and use the bar. Themes apply to the whole UI and new-tab page. Start page wallpaper from any image.
- Import bookmarks from Vivaldi/Chrome/Firefox (HTML export).
- Security: the UI has no Node access; web pages are sandboxed, isolated and cannot choose their own preload or partition; permission prompts; unknown URL schemes are not opened.

## Honest limits
- Extensions use Electron's built-in support: content scripts, storage, messaging and popups work; extensions needing blocking network requests (uBlock Origin MV2) or full tabs/windows APIs only partly work. Ad blocking is built in instead. Extensions are off in private tabs.
- Google sign-in may refuse non-Chrome browsers. Widevine DRM (Netflix, Spotify web) is not in stock Electron.
- Sync merges by union: a bookmark deleted on one machine can come back from another.
- Workspace delete clears that workspace's cookies and site data.

## Tested
- 71 checks in real Chromium against the UI with a stand-in for Electron and `<webview>` (tabs, search/bangs, workspaces + partitions, private tabs, find, zoom, error page, passwords, permissions, palette, panels, Notes/AI calls, sync payload, settings, extension/theme install, sleeping tabs, vertical layout, light theme, narrow width, no page errors).
- 26 unit tests (ad blocker, JSON store, vault with both encryption backends + tamper check, CSV, shortcuts, URL handling, CRX/ZIP reader incl. zip-slip, Web Store ID parsing, theme reader, bookmark import, desktop entry).
- Main process smoke test against a mocked Electron (hardening of webview attach, IPC allow-list, ad blocking, permissions, popups, shortcuts, API path/method limits).
- **Not tested: a real Electron window, real Wayland/X11, the AppImage build, a real Chrome Web Store download, KWallet.** Run it once and tell me what breaks.

## v11 update notes
- Themes: Settings → Appearance (Grimoire, Dr460nized, Amethyst, Midnight, Ember, Aurora, Parchment).
- Workspaces: emoji grid, paste/choose any image as icon, 24 colours + custom colour, drag to reorder.
- Back/Forward: right-click for a history list to jump several pages.
- Sites that block leaving (beforeunload) now ask "Leave site?" instead of silently refusing.
- Sign-in no longer drops on transient network errors; only a real 401 signs you out.
- Frameless window: drag the empty tab-strip area. If dragging fails on Wayland, run with `WIZBROWSER_X11=1`.

## New in this build (original features)
- **Conjure:** Ctrl+K, type plain English (start with `>` to put it first). Wizard AI proposes tab actions (group, close, sleep, move, open); nothing runs until you press "Do it". Pinned and private tabs are never touched. Needs sign-in and the existing /api/notes/ai route.
- **Rewind:** Ctrl+K → "Rewind this workspace…". Tab sets are saved locally every 5 minutes when they change (last 48 per workspace); Restore reopens the missing tabs.
- **Sleeping digests:** when a tab sleeps, Wizard AI keeps a one-line summary shown on hover. Turn off in Settings → General.

## Animated start page, more themes, QoL
- Every theme except Parchment has its own animated start-page scene (Dr460nized: neon grid, circuit pulses, embers). Settings → Appearance: Animated start page (Auto/On/Off), intensity (Low/Medium/High), accent colour, 24-hour clock, greeting and frequent-sites toggles. Auto respects the system reduce-motion setting; animation pauses when the window is unfocused or hidden.
- New themes: Synthwave, Terminal.
- Ctrl+K commands: duplicate tab, copy address (tracking params stripped; switch in Privacy), copy as Markdown link, copy all tab addresses, close other tabs / to the right, sleep other tabs, mute, pin, focus mode, open all bookmarks as a group, toggle animation.

## Point-and-click QoL (no shortcuts needed)
- Hover cards on tabs (title, address, state, AI summary), Undo button after closing tabs (bulk closes grouped), copy-address button and right-click menu (Paste and go) in the address bar, tabs ease in, thin loading/scroll-progress line under the toolbar, option to show the bookmarks bar only on the start page, tab tools (duplicate, copy address/Markdown link, close others, sleep others, focus mode, Rewind) in the ⋯ menu and Copy address in the tab menu. All have switches in Settings → Appearance/Privacy.

## Start page widgets, Conjure fix, themed scrollbars
- **Conjure fix:** `/api/notes/ai` cuts `instruction` at 500 characters, and the old request packed the whole tab list into it, so the AI never saw your tabs. The instruction is now short and the tab list travels in `text`. If the AI returns nothing usable, a local matcher handles "group/close/sleep <site names>" by matching words against tab titles and sites, so "Group together all my tabs for wizard maps or calendar" works even offline. Real server errors (rate limit, AI busy) are now shown instead of the generic message.
- **Settings scroll:** every settings tab scrolls inside the modal (the grid row had no fixed height, so the pane never overflowed). Scrollbars app-wide are now a slow-moving gradient of the theme's own colours (Dr460nized uses its rainbow); reduced-motion turns the animation off.
- **Widgets:** the start page is a grid of widgets. Wizard Ecosystem and Frequently visited are the defaults. "Add widget" opens a gallery with 14: Wizard Ecosystem, Frequently visited, Daily digest (weather + mail + calendar + notes, with a "Write my briefing" button that uses `/api/notes/ai`), Weather, Mail, Calendar, Notes (with a quick-add box → `POST /api/notes`), Finance, FireWatch, Bookmarks, Jump back in, Sleeping tabs (shows their one-line summaries), Focus timer, Protection. Move with the arrows or drag by the title, resize with the corner button, remove with ✕. Layout and weather location sync with your other settings (`widgets`, `wxLoc`). No new endpoints and no new DB: it reads `/api/mail/emails`, `/api/calendar/events`, `/api/notes`, `/api/heat/current`, `/api/firewatch/status`, `/api/finance/transactions`.
- Weather defaults to Phoenix; "change" on the Weather widget picks a city or takes coordinates.
- Tests: `tests/t8.js` (44 checks: widgets, gallery, drag, signed-out state, Conjure regression, every settings tab scrolls).

## Netflix and other protected content (Widevine)
**Why Netflix said "Pardon the interruption" (M7701-1003):** stock Electron has no Widevine decryption module, so there is nothing to switch on. `chrome://settings` does not exist in Electron either.
- `package.json` now uses castlabs' Widevine-enabled Electron: `"electron": "github:castlabs/electron-releases#v39.8.10+wvcus"`. `build.electronDist` points electron-builder at that install, so it does not download stock Electron again.
- Fresh install: `rm -rf node_modules && npm install`, then `npm start` to test, `npm run build:linux` for the AppImage. First launch downloads the Widevine module (a few MB, needs internet); the browser waits up to 8 seconds for it before restoring tabs.
- Linux needs no VMP signing (Windows and macOS do). Expect Widevine L3, so Netflix streams up to about 720p.
- Settings → Privacy → **Play protected content** (on by default) reports Widevine's status with a "Check again" link, and decides the `mediaKeySystem` permission with no per-site prompt.
- **wizard://settings** opens Settings (also `wizard://settings/privacy`, `/appearance`, `/passwords`, `/extensions`, `/sync`, `/about`). Type it in the address bar.
- Not verifiable in my sandbox (no real Electron, no network to castlabs): if `npm install` cannot fetch that tag, pick another `v39.x.x+wvcus` release from https://github.com/castlabs/electron-releases/releases and update both `electron` and `build.electronVersion`.
- Tests: `tests/main-smoke.js` covers the DRM permission switch and status; `tests/t8.js` covers the Settings row and wizard:// URLs.

## wizard://settings (full-page settings), widget refresh, Ctrl+scroll zoom
- **Settings is now a tab.** `wizard://settings` (also from the gear, the menu and the settings shortcut) opens a full-size page: sidebar with eight sections (General, Appearance, Start page, Privacy and security, Passwords, Extensions, Account and sync, About), a **search box** that finds any setting across all sections, and an address bar that follows the section (`wizard://settings/privacy`, `/appearance`, `/start`, `/passwords`, `/extensions`, `/sync`, `/about`). Opening it again reuses the same tab; it is saved and restored with your session. The old pop-up window is gone.
- **New "Start page" section:** switches for every widget, **Update widgets** (only on reload, every minute, 5 (default), 15, 30 minutes, hourly), weather location, Refresh now, Reset.
- **Widgets update while the browser stays open** (the bug: they only loaded when the browser started). Updates run on a timer while the start page is showing, swap in place with no flicker, keep the old data if a request fails, and skip a widget while you are typing in it. Coming back to the window after a long gap also refreshes. The start page has a Refresh button too. The setting syncs as `widgetRefresh`.
- **Ctrl + mouse wheel (and touchpad pinch) zooms the page.** Pages swallow wheel events, so `webview-preload.js` catches them and tells the UI; zoom is remembered per site as before. Plain scrolling is untouched.
- Tests: `tests/t8.js` now has 73 checks (settings tab, every section, search, deep links, Ctrl+wheel, auto-refresh timing).


---

## v11.1: bug report 3, Windows build, OLED Ribbon theme

**Bug fixes**
- Start-page widgets no longer say "Sign in to see…" after a restart. The browser now waits for the sign-in check (retrying for ~45 s) and shows skeletons meanwhile; "Could not reach Wizard right now" with a retry link appears only if the server is truly unreachable.
- **Ctrl+Space** opens Conjure. Ctrl+K stays the command palette and web search.
- Greeting setting (Settings > Start page > Greeting): *Rotating* (default, changes every 8 s), *Wizard AI* (one line written from mail, calendar, notes and weather; at most one request per 10 min, cached), or *Workspace name*.

**Windows**
- Build: `npm install` then `npm run build:win` produces `dist/Wizard-Browser-Setup-<version>-x64.exe` (per-user NSIS installer, no admin needed, choose install folder).
- Windows draws the caption buttons (Snap Layouts on the maximize button). Toggle: Settings > Appearance > Windows. Restart to apply.
- Window material: None (true black, best for OLED), Mica, Acrylic or Mica Alt. Applies live.
- Taskbar: grouped under its own AppUserModelId, jump list (New tab, New private tab), download progress on the taskbar button.
- Settings > General: *Start with Windows*, and *Default browser* registers Wizard Browser then opens Windows' Default apps page (Windows does not let apps set themselves).
- Segoe UI Variable is used as the UI font.
- Netflix/Disney+ (Widevine L1/L3 on Windows) need the build signed with castlabs EVS. See https://github.com/castlabs/electron-releases/wiki/EVS. I could not verify these steps from here, so treat them as untested.

**Theme: OLED Ribbon** (Settings > Appearance). True #000 background so pixels switch off, deep navy glass panels, a blue-white stippled ribbon (right) and an ember ribbon (left) in the wallpaper and the animated start page. The native caption buttons turn true black with it. Dr460nized is unchanged.

**Not testable in my sandbox:** Electron itself, the installer, jump list, Mica, taskbar progress. They are written against the documented Electron APIs; please report anything that misbehaves.
