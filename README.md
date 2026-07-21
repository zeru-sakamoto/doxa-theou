# doxa-theou

Bible Study App for my Workflows

Built with Tauri + React + TypeScript + Vite.

The Reader panel scrolls continuously across chapter and book boundaries,
loading each chapter on demand as you scroll rather than jumping one chapter
at a time.

The Notes panel has a searchable, filterable note list (by tag or by book).
Notes are Markdown files with frontmatter, currently a small bundled sample
set; the note editor itself and real persistence are still in progress.

Opening another Reader or note tabs it into the existing Reader/Notes group
instead of re-splitting the screen; right-click a tab for **Duplicate tab**,
which reopens it wherever it currently is (position/selected note), not just
where it started. Switching between tabs sharing a group preserves scroll
position. See [`docs/front-end.md`](docs/front-end.md) for the full UI
architecture.

## Dev

```
npm install
npm run tauri dev
```
