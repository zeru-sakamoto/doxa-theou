# Doxa Theou

Bible Study App for my Workflows

Built with Tauri + React + TypeScript + Vite.

The Reader panel shows one chapter at a time (no continuous scroll); you move
between chapters via the TOC drawer, ⌘K, a note anchor, or the chapter up/down
buttons, which roll across book boundaries.

The Notes panel has a searchable, filterable note list (by tag, book, or
notebook).
Opening a Notes tab with no note selected shows that list at full panel
width — as cards or full-width bars, a preference toggled in the header —
instead of a blank editor. Notes are Markdown files with frontmatter, edited
in a live Tiptap editor and persisted to disk (a rebuilt SQLite index backs
search and verse-anchor highlighting).

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
