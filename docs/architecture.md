# Architecture & Features — Doxa Theou

Top-level map of how **Doxa Theou** is put together: the process model, the
native command surface (IPC), the two data stores, the security model, and the
feature set. Companion docs go deeper on their slices:

- [`front-end.md`](front-end.md) — the React UI (shell, panels, navigation, tokens).
- [`database.md`](database.md) — building `bible.sqlite` from a source DB.
- [`../DESIGN.md`](../DESIGN.md) — the verse-data read path and import rationale.
- [`../Bible Study App.md`](../Bible%20Study%20App.md) — product brief and brand.

---

## 1. Process model

A single-window **Tauri 2** desktop app: a **Rust** backend hosts a **webview**
running the **React 19 + TypeScript (Vite)** frontend. There is no server and no
network access — everything is local.

```
┌─────────────────────────────────────────────────────────────┐
│ Rust (doxa_theou_lib)                                        │
│   main.rs → run()                                            │
│   lib.rs  → Tauri builder, #[tauri::command]s, managed state │
│   db.rs   → read-only bible.sqlite  (verses/search)          │
│   notes.rs→ read-write notes.sqlite (+ Markdown on disk)     │
└───────────────▲─────────────────────────────────────────────┘
                │  invoke() / IPC  (typed in src/api.ts)
┌───────────────┴─────────────────────────────────────────────┐
│ Webview (React 19 / Vite)                                    │
│   main.tsx → <App/> → WorkspaceProvider → NotesProvider →    │
│              WorkspaceShell (header · dock · status bar)     │
└─────────────────────────────────────────────────────────────┘
```

- **Native entry:** `src-tauri/src/main.rs` calls `doxa_theou_lib::run()`
  (`lib.rs`), which builds the Tauri app, registers plugins
  (`opener`, `dialog`), opens both databases in `setup`, and registers the
  command handlers.
- **Frontend entry:** `src/main.tsx` loads self-hosted fonts + the CSS layers,
  disables the browser context menu, and mounts `<App/>`
  (`WorkspaceProvider` → `NotesProvider` → `WorkspaceShell`).
- **Custom titlebar:** the OS titlebar is disabled (`decorations: false`); the
  React `Header` is the drag region and window controls, driven through
  `getCurrentWindow()`. Display name (`productName`, window `title`, `<title>`)
  is **Doxa Theou**; the bundle **identifier** stays
  `com.zeru-sakamoto.doxa-theou` (it keys the app-data dir — see §4).

---

## 2. IPC command surface

All native calls are `#[tauri::command]`s in `lib.rs`, registered in
`invoke_handler(generate_handler![...])`, and wrapped with types in
`src/api.ts`. Tauri maps JS `camelCase` args to Rust `snake_case`. Every command
returns `Result<T, String>`, so failures arrive as a rejected promise carrying a
message (surfaced in-panel, never a hard crash — see §6 error handling).

| Command                        | Args                           | Returns            | Backing            |
| ------------------------------ | ------------------------------ | ------------------ | ------------------ |
| `list_books`                   | —                              | `Book[]`           | `db.rs`            |
| `list_translations`            | —                              | `Translation[]`    | `db.rs`            |
| `get_chapter`                  | `bookId, chapter, translation` | `Verse[]`          | `db.rs`            |
| `section_headings_for_chapter` | `bookId, chapter, translation` | `SectionHeading[]` | `db.rs`            |
| `search`                       | `query, translation?`          | `SearchHit[]`      | `db.rs`            |
| `import_bible_db`              | `source`                       | `void`             | `db.rs` / `lib.rs` |
| `load_notes`                   | `folder?`                      | `Note[]`           | `notes.rs`         |
| `save_note`                    | `folder?, note`                | `void`             | `notes.rs`         |
| `delete_note`                  | `folder?, id`                  | `void`             | `notes.rs`         |
| `notes_for_chapter`            | `bookId, chapter`              | `ChapterNote[]`    | `notes.rs`         |
| `import_logos_notes`           | `paths, folder?, now, color?`  | `ImportSummary`    | `logos_import.rs`  |

The verse-read commands are detailed in [`../DESIGN.md`](../DESIGN.md); the notes
commands are covered in §3 below. App-defined commands are invocable by default
in Tauri 2 — no `capabilities/` grant is needed for them (grants are only for
plugin/core APIs; see §5).

---

## 3. Notes: Markdown on disk + a SQLite index (`notes.rs`)

Notes use a **two-representation** model:

- **`.md` files are the source of truth.** Each note is one Markdown file with
  YAML-ish frontmatter (`id`, `title`, `tags`, `anchors`, `color`, `created`,
  `modified`) and a Markdown body. Parsing/serialization is a small hand-rolled
  flat-scalar/list parser (`parse_note` / `serialize_note`) mirrored by the TS
  side in `src/panels/notes/notes.ts`.
- **`notes.sqlite` is a rebuilt index**, not authoritative. `load_notes` reads
  every `.md` in the folder and rebuilds the `notes` / `note_tags` /
  `note_anchors` tables inside one transaction, so cross-ref / "which notes
  touch this verse" queries (`notes_for_chapter`) stay fast and future semantic
  vectors have somewhere to attach.

**Anchors** are `"Book Chapter[:Verse[-Verse]]"` strings. `resolve_anchor` (Rust)
and `parseAnchor` (TS) resolve them against the book list to `(book_id, chapter,
verse_start?, verse_end?)`; a bare chapter has no verse bounds, a single verse
has `start == end`. Unresolvable anchors are still stored (raw) with NULL
location, so they simply don't highlight.

**Folder:** `save`/`load`/`delete` take an optional `folder`. Empty/absent →
the default `app_local_data_dir()/notes`; otherwise a user-chosen folder (picked
via the OS dialog in Settings). See §5 for the filename trust boundary.

**Reactivity (frontend):** `NotesProvider` (`src/state/notes.tsx`) loads all
notes once at startup, owns CRUD, debounces saves **600 ms per note**, and
exposes an **in-memory anchor index** that drives the Reader's verse highlights
— so highlights reflect _unsaved_ edits instantly with no IPC per render, while
`notes.sqlite` remains the system-of-record for search/cross-ref.

**Importing from Logos.** Settings ▸ _Import Logos notes…_ turns one or more
Logos Bible Study exports (`.txt`, or the HTML "Copy Bible Text" export —
HTML additionally carries inline highlight spans) into notes, one per
passage-heading group. `logos_import.rs` parses the export format, resolves
each heading to a `Book Chapter:Verse[-Verse]` anchor against the book list,
and renders each quoted verse as ``> **`N`** text`` — bold-code verse
number, matching the Reader's own Copy Blockquote format (see
[`front-end.md`](front-end.md) §6). Passages already imported (matched by
anchor) are skipped rather than duplicated; the command returns an
`ImportSummary` (imported/skipped counts + warnings, per file) that the
Settings panel renders, and records every note id it created so **Undo
import** (available until the app restarts) can delete exactly those notes
and nothing the user added by hand.

---

## 4. Data stores & app-data location

Two independent SQLite files, held in Tauri **managed state** as separate,
type-keyed `Mutex<Connection>`s (`Bible` and `Notes` newtypes in `lib.rs`):

| File           | Mode       | Contents                            | Built by                                                     |
| -------------- | ---------- | ----------------------------------- | ------------------------------------------------------------ |
| `bible.sqlite` | read-only  | books, verses, headings, FTS5 index | `scripts/import_bible.py` (see [`database.md`](database.md)) |
| `notes.sqlite` | read-write | the notes index (§3)                | created on first run (`notes::open`)                         |

Both live in the OS app-local-data dir, keyed by the bundle **identifier** (not
the display name), e.g. `%LOCALAPPDATA%/com.zeru-sakamoto.doxa-theou/` on
Windows. If `bible.sqlite` is missing, `db::open` returns an error naming the
exact expected path and the import command; the shell renders it as a
"Bible database not found" screen rather than failing silently.

**Installing / replacing `bible.sqlite` in-app.** Settings ▸ **Bible database** ▸
_Import database…_ lets the user pick a prebuilt `bible.sqlite` (the output of
`scripts/import_bible.py`) and install it as the active DB, instead of copying it
into the app-data dir by hand. The `import_bible_db` command (`lib.rs`):

1. `db::validate_source` opens the picked file read-only and checks it has the
   expected shape (`books` / `translations` / `verse_texts` / `verse_fts`,
   non-empty) — a wrong file is rejected before anything is overwritten.
2. Drops the live read-only connection (releasing the OS file lock on the
   current `bible.sqlite`), copies the picked file to a temp path, then
   `rename`s it over the target — so a partial copy never leaves a corrupt DB.
3. Reopens the new file read-only into the managed state.

On success the frontend refocuses the window (`getCurrentWindow().setFocus()`)
before calling `window.location.reload()`, then the whole app re-reads
books/translations; the dock layout is restored from `localStorage` (§7), so
the reload is seamless. The refocus matters on this frameless
(`decorations:false`) window: dismissing the native file-picker dialog can
leave the webview unfocused, and reloading immediately afterward left stale
paint on screen that visually overlapped the header until something forced a
repaint — awaiting `setFocus()` first gives the window a tick to resettle. The
in-app importer installs an already-normalized `bible.sqlite`; turning a _raw_
source DB into that shape is still the Python step (see
[`database.md`](database.md) / [`../DESIGN.md`](../DESIGN.md)).

---

## 5. Security model

Small, local-first, and defensive by construction:

- **No network.** No fetch/HTTP anywhere; verse data is a local import, fonts are
  self-hosted (`@fontsource/*`), all assets are bundled.
- **Content-Security-Policy.** `tauri.conf.json` sets a restrictive policy
  (`default-src 'self'`; `connect-src` limited to the Tauri IPC scheme;
  `style-src 'unsafe-inline'` only because Tailwind v4 injects `<style>` at
  runtime). Tauri auto-nonces the inline theme `<script>`. This is
  defense-in-depth: there is no current injection sink — verse text and search
  hits render as React text nodes and notes render through Tiptap/ProseMirror,
  with **no `dangerouslySetInnerHTML` anywhere**.
- **Parameterized SQL.** Every query binds parameters; no string interpolation
  of user input into SQL. FTS search additionally **sanitizes** the query
  (`db::fts_query`): each whitespace token is wrapped as a quoted, `*`-suffixed
  FTS prefix term (embedded quotes doubled), so punctuation like `"`, `*`,
  `(`, `-` is matched literally instead of parsed as query syntax (which
  previously raised an error the user saw), and a partial word (e.g. "tes")
  matches any token it's a prefix of (e.g. "testimony").
- **Read-only verse DB.** `bible.sqlite` is opened with
  `SQLITE_OPEN_READ_ONLY`; only `notes.sqlite` and the `.md` files are writable.
- **Filename trust boundary.** A note `id` crosses from the frontend before
  becoming a filename; `notes::safe_stem` reduces it to
  `[A-Za-z0-9_-]` (else `note`), preventing path traversal or odd filenames.
- **Capability grants** (`capabilities/default.json`) are minimal: window
  controls (`minimize`/`maximize`/`close`/`start-dragging`/`set-focus`/…),
  `opener:default`, and `dialog:allow-open` (the notes-folder/DB-import
  pickers). No filesystem, shell, or HTTP capability is granted to the
  webview.
- **Concurrency safety.** The two connection mutexes are never held at once;
  helpers that need the bible conn (e.g. `book_map`) copy their result out and
  release the bible lock before touching the notes conn (comment enforced in
  `lib.rs`).

---

## 6. Performance & robustness

- **Bounded frontend caches** (`src/api.ts`): `get_chapter` and
  `section_headings_for_chapter` results are cached in FIFO maps capped at 24
  entries each. Verse text/headings are immutable per `(book, chapter,
translation)`, so entries never go stale and back/forth navigation is
  IPC-free.
- **Lazy panels & vendor chunks:** Notes/Search/Settings are `React.lazy`
  (Notes pulls in the whole Tiptap stack); `dockview`/`motion` are split into
  their own chunks in `vite.config.ts`. See [`front-end.md`](front-end.md) §2.
- **Error containment:** every dockview panel is wrapped in a
  `PanelErrorBoundary`, so a crash in one panel shows an inline message instead
  of blanking the window. Async command failures set panel-local error state.
- **Stale-result guarding:** the Reader bumps a generation ref on every jump so
  a slow in-flight `get_chapter` that resolves after a newer jump is discarded.
- **`localStorage` hardening:** persisted values (theme, last-read position,
  dock layout) are validated/`try`-guarded on read, so a corrupt or outdated
  blob degrades to a sensible default rather than throwing.

---

## 7. Feature overview

| Feature                | Where                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reader**             | `panels/ReaderPanel.tsx`                               | One translation per panel (chosen at open). Shows one chapter at a time (no continuous scroll); jumps land on a target verse with a brief flash. TOC drawer + chapter up/down (rolls across book boundaries). Selecting verse text and releasing the mouse shows a floating Copy / Copy Blockquote / Copy Reference menu (`reader/SelectionToolbar.tsx`).                                                                                                                                                     |
| **Search**             | `panels/SearchPanel.tsx` + `db::search`                | FTS5 prefix / bm25, capped at 50 hits, query sanitized. Scripture hits highlight the matched term (`highlightMatches`). Scripture and Notes render as independent collapsible accordions (open by default).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Notes**              | `panels/NotesPanel.tsx`, `state/notes.tsx`, `notes.rs` | Tiptap Markdown editor, tags, verse anchors (highlight the Reader), per-note color, list search/filter. Persists to disk (debounced). Pasting plain-text Markdown (e.g. from the Reader's selection menu) converts to rich formatting instead of inserting raw text. Note-list rows (sidebar/inline/card) show each note's last-modified date and time. `[[`-triggered wikilinks (`notes/WikiLink.ts`) link notes to each other via Obsidian's `[[id\|title]]` syntax — frontend-only, no `notes.rs` changes. |
| **Home**               | `panels/HomePanel.tsx`                                 | The empty-dock watermark: quick actions, "Continue reading", recently-edited notes, stats. Not an openable tab.                                                                                                                                                                                                                                                                                                                                                                                               |
| **Settings**           | `panels/SettingsPanel.tsx`                             | Theme, default translation, highlight palette, notes folder, notes-panel placement, Bible-database import, Logos-notes import (with per-import undo).                                                                                                                                                                                                                                                                                                                                                         |
| **Command palette**    | `workspace/CommandPalette.tsx`                         | ⌘/Ctrl-K go-to-reference (`Book Chapter:Verse`), fuzzy book match.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Docking**            | `workspace/dock.tsx`                                   | dockview split/tab/rearrange; new Reader/Notes tabs join the existing group; two-group divider snaps to center.                                                                                                                                                                                                                                                                                                                                                                                               |
| **Layout persistence** | `workspace/dock.tsx`                                   | Layout autosaves to `localStorage` and **restores on launch**; a corrupt/absent blob falls back to the empty dock (Home). "Layout ▸ Reset" clears it.                                                                                                                                                                                                                                                                                                                                                         |
| **Theming**            | `state/workspace.tsx`, `styles/tokens.css`             | Light/dark, both first-class; applied before first paint via an inline script in `index.html`.                                                                                                                                                                                                                                                                                                                                                                                                                |

UI internals (tokens, navigation events, tab grouping, scroll preservation) are
documented in [`front-end.md`](front-end.md).
