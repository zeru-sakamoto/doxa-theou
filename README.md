# Doxa Theou

Bible Study App for my Workflows

Built with Tauri + React + TypeScript + Vite.

The Reader panel shows one chapter at a time (no continuous scroll); you move
between chapters via the TOC drawer, ⌘K, a note anchor, or the chapter up/down
buttons, which roll across book boundaries. Selecting verse text shows a
floating menu to copy it as plain text, as a Markdown blockquote citation, or
just its reference (e.g. "Romans 10:5-7").

The Notes panel has a searchable, filterable note list (by tag, book, or
notebook), each row showing its last-modified date and time.
Opening a Notes tab with no note selected shows that list at full panel
width — as cards or full-width bars, a preference toggled in the header —
instead of a blank editor. Notes are Markdown files with frontmatter, edited
in a live Tiptap editor and persisted to disk (a rebuilt SQLite index backs
search and verse-anchor highlighting). Pasting plain-text Markdown — including
straight out of the Reader's selection menu — converts to real formatting
instead of dropping in as a raw string. Settings can also bulk-import Logos
Bible Study exports (`.txt`/HTML) as notes, one per passage, with dedupe and
an undo for the last import.

Opening another Reader or note tabs it into the existing Reader/Notes group
instead of re-splitting the screen; right-click a tab for **Duplicate tab**,
which reopens it wherever it currently is (position/selected note), not just
where it started. Switching between tabs sharing a group preserves scroll
position.

See [`docs/architecture.md`](docs/architecture.md) for the overall
architecture (process model, IPC, data, security) and
[`docs/front-end.md`](docs/front-end.md) for the full UI internals.

## Dev

```
npm install
npm run tauri dev
```
