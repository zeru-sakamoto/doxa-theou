# Front-End: App UI

Documentation for the doxa-theou desktop UI: a **Logos × VSCode modular
workspace**, dockable panels the user can split, tab, and rearrange, framed by
a custom window bar and a thin status bar. Backend/verse-data layer is documented
separately in [`../DESIGN.md`](../DESIGN.md).

---

## 1. Design language: "Koine Ink"

Utilitarian, low-chrome, information-dense: Logos Bible Software crossed with a
modern code editor. The theme recedes so content leads: thin borders over
shadows, tight IDE-like density. Light and dark are **both first-class** (not one
inverted from the other). Full brand rationale lives in
[`../Bible Study App.md`](../Bible%20Study%20App.md).

- **Verse / body text:** Newsreader (serif).
- **UI chrome / labels:** IBM Plex Sans.
- **References / scannable data:** IBM Plex Mono.

Fonts are self-hosted via `@fontsource/*` (offline; no CDN) and imported in
`src/main.tsx`.

### Design workflow (required for any UI work)

When building or modifying a UI component, follow this pipeline in order; it is
the standing convention for this project (also noted in `CLAUDE.md`):

1. **ui-ux-pro-max**: pick/validate style · palette · fonts; check WCAG contrast.
2. **design-system**: lock decisions into tokens (`src/styles/tokens.css`).
3. **ui-styling**: build the component against those tokens.
4. **motion-framer**: add restrained motion (`motion/react`), honoring
   `prefers-reduced-motion`.

---

## 2. Tech stack

| Concern          | Choice                                                                            |
| ---------------- | --------------------------------------------------------------------------------- |
| Framework        | React 19 + TypeScript (Vite)                                                      |
| Docking / tiling | [`dockview-react`](https://dockview.dev) v7 (drag-to-dock, serialization)         |
| Motion           | `motion` (Framer Motion), imported as `motion/react`                              |
| Fonts            | `@fontsource/{newsreader,ibm-plex-sans,ibm-plex-mono}`                            |
| Native bridge    | `@tauri-apps/api`: `invoke()` for commands, `getCurrentWindow()` for the titlebar |
| Icons            | Hand-rolled inline SVG (`src/workspace/icons.tsx`), no icon-lib dependency        |

State is a plain React context (`src/state/workspace.tsx`). No store library
until it measurably needs one.

### Bundle: lazy-loaded panels

Reader and Home are both imported eagerly: Reader is the panel every Bible
reference navigates to, and Home is the landing view shown whenever the dock
is empty (see §5/§6), so neither benefits from lazy-loading. Notes, Search,
and Settings are `React.lazy()` in `dock.tsx`'s `components` map
(each wrapped in its own `<Suspense fallback={<PanelFallback/>}>`). They
only load the first time a user actually opens them. This matters most for
Notes: its editor pulls in the entire Tiptap stack (`@tiptap/*` + `prosemirror`),
by far the single biggest dependency in the app. `dockview-react` and `motion`
are used by the always-visible shell (dock host, menus, drawers) and can't be
deferred the same way, so `vite.config.ts` instead splits them into their own
`manualChunks` (`vendor-dockview`, `vendor-motion`) purely to keep every
built chunk under Vite's 500 kB warning threshold. New panel types should
follow the same lazy pattern (see §9) unless they need to be present at
startup like Reader.

---

## 3. Design tokens (`src/styles/tokens.css`)

Three-layer CSS variables: **primitive → semantic → component**. Components must
reference `var(--…)`, never raw hex.

- **Primitives**: the raw Koine Ink hexes (light + dark), plus spacing, radii,
  type scale, motion, z-index.
- **Semantic**: the only color vars components use: `--bg`, `--bg-panel`,
  `--text`, `--text-muted`, `--border`, `--border-strong`, `--accent`,
  `--accent-strong`, `--on-accent`. These flip on `:root[data-theme="dark"]`.
- **Component**: per-surface tokens: `--header-*`, `--statusbar-*`, `--menu-*`,
  `--drawer-*`, `--input-*`, button tints, etc.

Two derived tokens exist for accessibility (both palettes validated AA):

- `--on-accent`: text color on an accent fill: white in light, near-black in
  dark (white-on-accent fails 4.5:1 in dark, so it flips per theme).
- `--border-strong`: a visible border for **meaningful** boundaries; the quiet
  `--border` stays for decorative separation.

### Dockview theme bridge

Dockview is themed by our tokens rather than its built-ins. We piggyback the
`themeVisualStudio` object (for structural CSS) and override its `--dv-*` color
variables under `.dock-host .dockview-theme-vs`, so panel chrome uses our
palette and flips with `[data-theme]` automatically.

Global element styling (resets, fonts, scrollbars, focus) lives in
`src/styles/base.css`; all component classes in `src/styles/shell.css`.

---

## 4. File map

```
src/
  main.tsx                 entry: imports fonts + styles (dockview CSS first) + <App/>
  App.tsx                  <WorkspaceProvider><WorkspaceShell/></WorkspaceProvider>
  api.ts                   typed invoke() wrappers + canonical chapter counts
  state/workspace.tsx      context store: theme, books, translations, active ref/translation
  styles/
    tokens.css             three-layer tokens + dockview bridge (design source of truth)
    base.css               element resets, fonts, scrollbars, focus
    shell.css              all component classes
    notes-editor.css       Tiptap/ProseMirror content typography (plain descendant selectors)
  workspace/
    WorkspaceShell.tsx     top-level grid: header / dock / status bar; gates the dock on ws.ready
    Header.tsx             custom window bar + global controls
    StatusBar.tsx          reference · translation · status · live clock
    CommandPalette.tsx     ⌘K go-to-reference; also exports parseQuery(), reused by the anchor composer
    dock.tsx               dockview wrapper, panel registry (Notes/Search/Settings lazy, Home eager), watermarkComponent, DockProvider/useDock, tab context menu
    LoadingScreen.tsx      shown while ws.ready is false — wordmark + quiet fade, no spinner
    Menu.tsx               reusable dropdown menu
    icons.tsx              inline SVG icon set
  panels/
    HomePanel.tsx          landing view: quick actions + recently-edited notes; also the dockview watermark
    ReaderPanel.tsx        scripture reader (one translation per panel)
    reader/TocDrawer.tsx   in-panel book/chapter navigator
    NotesPanel.tsx         header (list/search/filter/color/⋯) + editor host
    notes/NotesDrawer.tsx  in-panel note-list drawer (cards: color dot, title-or-preview, tags, anchors)
    notes/NotesFilterMenu.tsx  tag (text) / book (multi-select) filter popover
    notes/NotesColorMenu.tsx   per-note color swatch picker (header, left of ⋯)
    notes/NotesEditor.tsx      Tiptap editor host: toolbar, anchor bar, title input, content
    notes/NotesEditorToolbar.tsx  formatting toolbar, wraps by button-group when narrow
    notes/NotesAnchorBar.tsx   verse-anchor rows + composer (autocomplete, keyboard nav, chapter/verse validation)
    notes/notes.ts         sample-notes loader/parser, shared highlight palette, notePreview()
    SearchPanel.tsx        Verses + Notes result groups
    SettingsPanel.tsx      theme toggle, default translation, highlight palette, notes folder
```

---

## 5. Shell layout

`WorkspaceShell` is a CSS grid of three rows: **header / dockable center /
status bar**.

### Header (custom window bar)

The OS titlebar is disabled (`decorations:false`); this bar replaces it and is
the window drag region (`data-tauri-drag-region`). Left to right:

- **Δόξα Θεοῦ** wordmark (logo placeholder).
- **Global search** field: opens/updates the Search panel.
- **Layout** menu: Save layout / Reset layout (resetting clears the saved
  layout and leaves the dock empty, same as a fresh install — see below).
- Right cluster: **Bible reader ▾** (translations listed alphabetically by
  code; pick one → opens a Reader bound to it) · **Notes** · **Settings**.
- **Window controls**: minimize · maximize/restore · close. (The close control
  also quits, since it's a single-window app.)

### Status bar

Thin and quiet: **active reference** (mono) · **active translation** ·
**index/save status** · … · **live clock** (far right). The theme toggle is
**not** here; it lives in Settings.

### Dockable center

A `dockview-react` surface. Panels can be dragged to split/tab/rearrange freely
(1×1, 2×1, quad, …). The layout is serialized to `localStorage` on every change
and restored on launch; **Layout ▸ Save/Reset** manage it explicitly. Before
any of this mounts, `WorkspaceShell` gates on `ws.ready`, showing
`LoadingScreen` until `list_books`/`list_translations` resolve.

There's no auto-opened panel on launch: a fresh install, a corrupt/cleared
saved layout, or an explicit **Reset layout** all leave the dock with zero
panels, which dockview's built-in watermark mechanism fills with `HomePanel`
(passed as `watermarkComponent` in `dock.tsx`) — see §6. `HomePanel` is the
default startup screen only — it isn't a panel type, so it can't be opened
as a tab; the only way back to it mid-session is closing every open panel.

Each panel's group header shows dockview tabs (drag + close). Right-clicking a
tab opens a native context menu (**Copy reference · Close others · Close**),
via `DockviewReact`'s `getTabContextMenuItems`.

---

## 6. Panels

Registered in `dock.tsx` under a `components` map (`id → component`).

| Panel        | Wired to backend                       | Notes                                                                                                                                                                                        |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | —                                      | Landing view: quick actions (start reading, open Notes/Search/Settings) + a recently-edited-notes list. The dockview watermark shown whenever the dock is empty — not an openable panel/tab. |
| **Reader**   | `get_chapter`, `list_books`            | One translation, chosen at open time ("version-dedicated").                                                                                                                                  |
| **Search**   | `search` (FTS5 / bm25)                 | Verses + Notes groups; Notes search is a placeholder.                                                                                                                                        |
| **Notes**    | `load_notes`/`save_note`/`delete_note` | Header, list, and a real Tiptap editor (toolbar, anchors, optional title); notes persist to disk via `NotesProvider` (`src/state/notes.tsx`), debounced per-note.                            |
| **Settings** | `list_translations`                    | Theme toggle, default translation, shared highlight palette, notes folder picker.                                                                                                            |

**Home** (`HomePanel.tsx`). The default startup screen — passed only as
dockview's `watermarkComponent` (auto-shown whenever the dock has zero
panels: launch, a cleared/corrupt saved layout, "Reset layout", or closing
every panel mid-session). It's not registered in the `components` map, so
it can't be opened as a tab; the only way back to it mid-session is closing
everything else. It reads `useDock()`/`useWorkspace()`/`useNotes()` directly
rather than through props. Content: a row of quick-action buttons (start
reading in `ws.defaultTranslation`, open Notes, open Search, open Settings)
and a "Recently edited" list — the 5 most recently modified notes
(`useNotes().notes`, sorted by `modified` client-side), each row opening
Notes generally rather than deep-linking to that specific note (no
per-note-open API exists yet).

**Reader.** Header carries the **TOC toggle**, current reference, and the bound
version. The body renders verses (Newsreader) with mono, accent verse numbers.
When a Reader is the active panel it owns the status bar and is the target for
go-to-reference.

**TOC drawer** (`reader/TocDrawer.tsx`). Slides in over the Reader body
(spring). Books are listed by testament as accordions; expanding a book reveals a
grid of chapter-number chips; clicking a chip navigates and closes the drawer.
Chapter counts come from a fixed canonical table in `api.ts` (no backend query).

**Notes.** Header, left to right: a hamburger toggles the note-list sidebar
(shows an active/accent state while open), a fixed-width search field filters
that list live (title/tags/body, substring match), a filter icon sits right
beside it opening a Tags/Books popover, then, pinned to the far right of the
bar, a per-note **color swatch** (`notes/NotesColorMenu.tsx`, only shown
once a note is selected) and the "⋯" menu (`New note`, `Add anchor`). The
filter popover's Tags mode is one free-text input; Books mode is a 3-column
grid of book-abbreviation toggle buttons grouped under "Old
Testament"/"New Testament" headers (same `book.testament` split
`reader/TocDrawer.tsx` uses).

Notes are loaded once at startup by `NotesProvider` (`src/state/notes.tsx`,
wraps `WorkspaceShell` in `App.tsx`) via the real Rust commands
(`load_notes`/`save_note`/`delete_note`, `src-tauri/src/notes.rs`) —
Markdown-on-disk with frontmatter (`id`, `title`, `tags`, `anchors`, `color`,
`created`, `modified`) is the source of truth, `notes.sqlite` is the search
index. Edits are debounced (600ms) per-note before writing to disk.
`notes/notes.ts` is just the frontend-side helpers: the list preview
(`notePreview()`), the highlight palette, and anchor parsing (shared with the
Reader's highlight index). Unlike the Reader's TOC drawer, the note-list sidebar
(`notes/NotesDrawer.tsx`) isn't an overlay; it's a collapsible flex column
that animates width and pushes the editor over rather than floating on top
with a scrim, so it never covers the header. Each card shows an optional
color dot, the title (or, if the note has none, a Markdown-stripped preview
of the body via `notes/notes.ts`'s `notePreview()`), tag pills, and the
note's anchors joined as a preview line (`John 3:16 · Rom 8:28`).

**Note editor** (`notes/NotesEditor.tsx`), mounted once a card is selected:

- **Toolbar** (`NotesEditorToolbar.tsx`): a Tiptap `useEditor` instance
  (StarterKit + Highlight/Placeholder/TaskList/Subscript/Superscript +
  `@tiptap/markdown` for Markdown-in/out) drives block type, marks, lists,
  code, and link buttons. Buttons are grouped by divider; the bar wraps by
  whole group (never mid-cluster) when the panel narrows, e.g. with the note
  list open.
- **Anchor bar** (`NotesAnchorBar.tsx`): existing anchors render as
  clickable rows with a live passage preview (fetched via `get_chapter`) that
  jump the active Reader. Composing a new anchor (`Add anchor`) gets a
  book/chapter/verse **autocomplete + validation** combobox: book-name
  suggestions reuse `CommandPalette`'s exported `parseQuery()`; once a book
  is resolved, chapter suggestions are bounded by `api.ts`'s `chapterCount()`
  and verse suggestions by a live `get_chapter()` fetch for the typed
  chapter. Arrow keys move the highlight, Tab accepts the first suggestion,
  and an out-of-range chapter/verse (or an end-verse below the start) blocks
  confirm with an inline error.
- **Title input**: optional; an empty title falls back to the body preview
  in the list card (see `notePreview()` above).
- **Color**: `NotesColorMenu.tsx` picks from the same 7-hue palette as
  Settings' default highlight color (now exported as
  `notes/notes.ts`'s `NOTES_HIGHLIGHT_SWATCHES`, shared by both). Picking a
  color updates `ws.notesLastColor` (persisted), which new notes default to.

---

## 7. Navigation & cross-panel events

Two navigation mechanisms, both driving the **active** Reader (opening one if
none exists):

- **⌘K / Ctrl-K command palette**: type `John 3:16`; fuzzy-matches book
  name/abbr, Enter jumps.
- **Reader TOC drawer**: per-Reader book/chapter picker.

Coordination uses `useDock().gotoReference(bookId, chapter, verse?)` plus two
window `CustomEvent`s:

| Event         | Dispatched by                    | Consumed by             |
| ------------- | -------------------------------- | ----------------------- |
| `doxa:goto`   | `gotoReference` (palette/search) | the active Reader panel |
| `doxa:search` | header global search submit      | the Search panel        |

The active Reader also pushes its reference/translation into the workspace store
via `onDidActiveChange`, which is what the status bar reads.

---

## 8. Custom titlebar (Tauri)

- `src-tauri/tauri.conf.json` sets window `decorations:false`, a larger default
  size, and `minWidth`/`minHeight`.
- `src-tauri/capabilities/default.json` grants window permissions:
  `allow-minimize`, `allow-maximize`, `allow-unmaximize`, `allow-toggle-maximize`,
  `allow-is-maximized`, `allow-close`, `allow-start-dragging`.
- `Header.tsx` drives controls via `getCurrentWindow()` (`.minimize()`,
  `.toggleMaximize()`, `.close()`), all guarded so they no-op outside Tauri.

An inline script in `index.html` applies the saved/system theme before first
paint to avoid a flash.

---

## 9. How to add a new panel type

1. Create `src/panels/MyPanel.tsx` (a component; use `IDockviewPanelProps` if it
   needs the panel `api`/`params`).
2. Register it in `dock.tsx`'s `components` map. Unless it must be present at
   startup like Reader, lazy-load it the same way Notes/Search/Settings are
   (`const MyPanel = lazy(() => import("../panels/MyPanel").then(m => ({ default: m.MyPanel })))`,
   rendered as `() => <Suspense fallback={<PanelFallback/>}><MyPanel/></Suspense>`).
   See §2's "Bundle: lazy-loaded panels".
3. To open it from the header, add a `dock.openSingleton("mypanel")` button (or
   `dock.openReader`-style opener for multi-instance panels), and add its title
   to `TITLES`.
4. Style with token-based classes in `shell.css` (never raw hex).
5. Add motion only after the structure works, via `motion/react`.

A **Cross-references** panel is the obvious next one; the registry makes it a
small addition once cross-ref data is sourced (its DB table is currently empty).

`HomePanel` is the precedent for an empty-dock affordance: pass it (or a
thin wrapper) as `watermarkComponent` on `<DockviewReact>` — it doesn't need
a `components` entry unless it should also be independently openable as a
tab.

---

## 10. Deliberate simplifications

Each has an upgrade path noted in-code:

- **Chapter counts** are the fixed 66-book canon in `api.ts`; there's no backend query.
- **State** is React context, not a store library.
- Tab right-click **Copy reference** always copies the globally active
  Reader's reference, not necessarily the reference of the specific panel
  right-clicked (there's no per-panel reference lookup yet).
- No prev/next chapter controls in the Reader: navigation is TOC + ⌘K.
- Cross-references panel deferred (empty data table).
- **Home**'s recently-edited-notes rows open Notes generally rather than
  jumping straight to that note (no per-note-open API yet).
- No reference-history tracking exists (`activeReference` is a single
  overwritten value, not a list), so Home surfaces recent _notes_ activity
  only, not recently-read passages.
