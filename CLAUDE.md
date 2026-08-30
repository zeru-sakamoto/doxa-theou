# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

doxa-theou (display name **Doxa Theou**; the repo/crate/bundle-identifier keep the hyphenated `doxa-theou` form) is a Bible Study App, built as a desktop app with Tauri 2 (Rust backend) + React 19 + TypeScript (Vite frontend).

## Commands

- `npm install` — install frontend deps (run once, and after pulling changes to package.json)
- `npm run tauri dev` — run the full app (starts Vite dev server on port 1420 and launches the Rust/Tauri window)
- `npm run dev` — frontend-only Vite dev server (no native window)
- `npm run build` — typecheck (`tsc`) then build the frontend bundle
- `npm run tauri build` — produce a release desktop bundle
- `cargo build` / `cargo check` (run from `src-tauri/`) — build/check the Rust side directly
- `cargo test` (run from `src-tauri/`) — run Rust tests (currently `db.rs`, `notes.rs`, `logos_import.rs`); no frontend test runner exists yet
- `python scripts/import_bible.py` — one-time (stdlib only, no deps): build the normalized `bible.sqlite` from the source DB, then copy it into the app-local-data dir. First copy `.env.example` to `.env` and set `BIBLE_SOURCE_DB` to your local source DB's path (the DB isn't shipped with the source). Verse data comes from this local import, **not** an ESV/network API. See `DESIGN.md`.

## Architecture

- `src/` — React/TypeScript frontend. Entry `src/main.tsx` (imports fonts + `styles/{tokens,base,shell}.css` and dockview CSS), root `src/App.tsx` (wraps `WorkspaceShell` in `WorkspaceProvider`). Talks to native code via `@tauri-apps/api` (`invoke`), wrapped with types in `src/api.ts`.
  - `src/workspace/` — the app shell: custom window-bar `Header`, `StatusBar` (live clock), `CommandPalette` (⌘K go-to-reference), `dock.tsx` (dockview wrapper + panel registry + `DockProvider`/`useDock` imperative API + layout save/restore in localStorage), reusable `Menu`, hand-rolled SVG `icons`.
  - `src/panels/` — dockable panel components: `ReaderPanel` (shows one chapter at a time, no continuous scroll; `reader/ChapterView` renders the chapter's verses split into heading segments, `reader/TocDrawer` is the book/chapter accordion), `NotesPanel` (+ `notes/NotesDrawer` collapsible note-list sidebar — pushes the editor over rather than overlaying, `notes/NotesFilterMenu` tag/book/notebook filter popover, `notes/NotesEditor` a real Tiptap Markdown editor with toolbar/anchors, `notes/notes.ts` frontmatter loader — notes persist to disk via Rust commands, `notes.sqlite` is a rebuilt search index), `SearchPanel`, `SettingsPanel` (theme toggle lives here), `TypingPanel` (+ `typing/` subfolder — Monkeytype-style typing practice: `typingEngine.ts` pure keystroke/WPM/accuracy state machine, `passageSource.ts` random/sequential passage/chapter selection, `typingStats.ts` localStorage history + panel settings). One Reader = one translation, chosen at open time.
  - `src/state/workspace.tsx` — React-context store: theme (writes `data-theme`), books/translations loaded once, active reference/translation.
  - Modular workspace uses **dockview-react** (drag-to-dock, themed via `themeVisualStudio` + `--dv-*` overrides in `tokens.css`, scoped under `.dock-host`). Custom titlebar: `decorations:false` + window permissions in `capabilities/default.json`, controls via `getCurrentWindow()`.
- `src-tauri/` — Rust backend, crate name `doxa_theou_lib` (see `src-tauri/Cargo.toml`).
  - `src-tauri/src/main.rs` — binary entry point, just calls `doxa_theou_lib::run()`.
  - `src-tauri/src/lib.rs` — actual app setup: Tauri builder, plugin registration, and `#[tauri::command]` functions exposed to the frontend via `invoke_handler(tauri::generate_handler![...])`. New Rust commands callable from JS/TS go here and must be added to that handler list. Opens the DB in `setup` and stores it as `State<Mutex<Connection>>`.
  - `src-tauri/src/db.rs` — read-only `rusqlite` (bundled) access to `bible.sqlite`: verse/book/search queries and the structs returned to the frontend. The DB is loaded from the app-local-data dir and produced by `scripts/import_bible.py`. Backend design in `DESIGN.md`.
  - `src-tauri/tauri.conf.json` — app identifier, window config, build hooks (`beforeDevCommand`/`beforeBuildCommand` wire this to the Vite scripts above), and bundler target/icon config.
  - `src-tauri/capabilities/` — Tauri 2 permission/capability grants for the webview.
- `vite.config.ts` — dev server is pinned to port 1420 (`strictPort: true`) because `tauri.conf.json` expects it there; `src-tauri/` is excluded from Vite's watcher.
- `docs/` — project documentation.
- `site-content/` — content for a companion website/marketing site (separate from the app itself).

### Dev server hygiene

`npm run tauri dev` / `npm run dev` are long-running processes, not one-shot commands — never launch either in the background just to "check it compiles"; use `npm run build` / `cargo check` for that instead. Because Vite's port is `strictPort: true`, a second instance never silently shares port 1420 — it fails loudly with `Port 1420 is already in use`, which almost always means a dev server (yours from an earlier step, or the user's own) is already running; check with `netstat -ano | grep :1420` (or `tasklist //FI "IMAGENAME eq node.exe"`) before assuming you need to start one. If you do start one in the background for a specific reason, stop that process yourself once you're done with it — don't leave it dangling for the user to notice and ask about. Never kill a dev server you didn't start (e.g. one already bound to 1420 before your first command) without confirming with the user first — it may be their active session.

The frontend and Rust backend are two separate build systems (Vite/tsc for TS, Cargo for Rust) orchestrated together by the Tauri CLI; when adding a native capability, expose it as a `#[tauri::command]` in `lib.rs` and call it from React via `invoke()`.

## Docs maintenance

After any major change or behavior-affecting modification (a new feature, a
changed panel/UI behavior, a fixed bug that alters documented behavior, a
version bump), update the relevant docs in the same turn — don't leave it for
a follow-up:

- `README.md` — if the change affects what's described there (features, dev
  workflow).
- `docs/architecture.md` / `docs/front-end.md` / `docs/database.md` — whichever
  covers the changed area (IPC surface, data stores, panels, tokens, file map).
- This file, if the change makes an existing claim here stale (a file's
  described role, a command, a listed convention).

Skip only for changes with no user- or architecture-visible effect (pure
refactors, formatting, comment-only edits).

## UI / Design workflow

Design language is **"Koine Ink"** (see `Bible Study App.md`): utilitarian, low-chrome, information-dense — Logos × code-editor. Light + dark are both first-class. Fonts: Newsreader (verse/body), IBM Plex Sans (UI), IBM Plex Mono (refs/data). All of this is locked into `src/styles/tokens.css` as three-layer CSS-variable tokens (primitive → semantic → component); **components reference `var(--…)`, never raw hex**.

When **building or modifying any UI component**, follow this pipeline in order (do not skip steps):
**ui-ux-pro-max** (pick/validate style·palette·fonts, WCAG contrast) → **design-system** (lock decisions into `tokens.css`) → **ui-styling** (build against tokens) → **motion-framer** (`motion/react`; restrained, honor `prefers-reduced-motion`).
