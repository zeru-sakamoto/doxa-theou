# Front-End: App UI

Documentation for the Doxa Theou desktop UI: a **Logos × VSCode modular
workspace**, dockable panels the user can split, tab, and rearrange, framed by
a custom window bar and a thin status bar. The overall architecture (process
model, IPC, data, security) is in [`architecture.md`](architecture.md); the
backend/verse-data read path in [`../DESIGN.md`](../DESIGN.md).

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
`src/main.tsx`. `base.css` sets `font-synthesis: none` globally (crisp text,
no browser-faked oblique/bold), which means every weight/style **combination**
actually used has to be imported explicitly — e.g. `400-italic` for a plain
italic mark, `600-italic` for bold+italic or an italicized semibold heading —
or that combination silently renders as whichever face the browser falls back
to (thinner/upright) instead of erroring. The notes editor's body text
(`.tiptap` in `notes-editor.css`) uses `--font-serif` (Newsreader), matching
the Reader panel's verse text at the same `--text-read` size — it previously
used `--font-sans`, which rendered visually larger than the Reader at an
identical font-size due to IBM Plex Sans' bigger x-height, so the two never
looked matched even though the token was shared.

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

| Concern          | Choice                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Framework        | React 19 + TypeScript (Vite)                                                                                             |
| Docking / tiling | [`dockview-react`](https://dockview.dev) v7 (drag-to-dock, serialization)                                                |
| Motion           | `motion` (Framer Motion), imported as `motion/react`                                                                     |
| Fonts            | `@fontsource/{newsreader,ibm-plex-sans,ibm-plex-mono}`                                                                   |
| Native bridge    | `@tauri-apps/api`: `invoke()` for commands, `getCurrentWindow()` for the titlebar                                        |
| Icons            | Hand-rolled inline SVG (`src/workspace/icons.tsx`) on a shared `ICON` size scale (`xs/sm/md/lg`), no icon-lib dependency |

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
  motion.ts                shared motion constants (durations/easing/drawer spring) mirroring tokens.css
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
    dock.tsx               dockview wrapper, panel registry (Notes/Search/Settings lazy, Home eager), watermarkComponent, DockProvider/useDock, tab context menu (Duplicate tab, Close others, Close), joins an existing Reader/Notes group instead of re-splitting, snaps a two-group divider to the exact middle
    LoadingScreen.tsx      full-window pulsing wordmark overlay; fades out over the mounted dock (no swap flash)
    Menu.tsx               reusable dropdown menu
    useMenuAlign.ts        clamps a popover (Menu + the notes header popovers) back inside its dock panel's bounds on open/resize
    useArrowScroll.ts      Up/Down-arrow scrolling for a panel's main scrollable content, active only while that panel is dockview's active tab; shared by Reader, Notes, Search
    icons.tsx              inline SVG icon set + ICON size scale (BibleIcon marks the reader)
    Toast.tsx              transient bottom-center toast (doxa:toast) — e.g. layout save/reset feedback
    ErrorBoundary.tsx      top-level crash catcher → message + Reload (per-panel boundary lives in dock.tsx)
    globalSearch.ts        header→Search-panel query hand-off (survives the lazy panel's first-mount race)
  panels/
    HomePanel.tsx          landing view: quick actions + recently-edited notes; also the dockview watermark
    ReaderPanel.tsx        scripture reader (one translation per panel), shows one chapter at a time
    reader/ChapterView.tsx renders a chapter's verses split into heading segments, rows/paragraph flow modes
    reader/TocDrawer.tsx   in-panel book/chapter navigator
    NotesPanel.tsx         header (list/search/filter/display-toggle/color/⋯) + editor host; no note selected → full-width list instead of the editor
    notes/NotesDrawer.tsx  note list, two variants: "sidebar" (collapsible column beside an open note) and "inline" (full-width, no note open); Ctrl/Cmd-click opens a note in a new background tab
    notes/NotesCardGrid.tsx    full-width card-grid layout for the same note list, alternative to NotesDrawer's "inline" bars variant
    notes/NoteRowContent.tsx   one note's summary (color dot, title-or-preview, tag pills, anchors) shared by the sidebar, inline bars, and card grid
    notes/NotesFilterMenu.tsx  tag (text) / book (multi-select) / notebook (multi-select, incl. "Uncategorized") filter popover
    notes/NotesColorMenu.tsx   per-note color swatch picker (header, left of ⋯)
    notes/NotebookMenu.tsx     per-note notebook picker (header)
    notes/NotesEditor.tsx      Tiptap editor host: toolbar, anchor bar, title input, content
    notes/NotesEditorToolbar.tsx  formatting toolbar, wraps by button-group when narrow
    notes/NotesAnchorBar.tsx   verse-anchor rows + composer (autocomplete, keyboard nav, chapter/verse validation)
    notes/notes.ts         sample-notes loader/parser, shared highlight palette, notePreview()
    SearchPanel.tsx        Scripture (FTS) + Notes (client-side) result groups
    SettingsPanel.tsx      theme toggle, default translation, Bible-database import, highlight palette, notes folder, notes-panel placement (Active/Left/Right)
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
and **restored on launch** (`register` in `dock.tsx` calls `api.fromJSON`);
restored Reader/Notes tabs reopen where they were, since each panel mirrors its
live position/selection into its own params (see "Duplicate tab" below).
**Layout ▸ Save/Reset** manage it explicitly. The dock mounts once `ws.ready`
(after `list_books`/`list_translations` resolve); until then a full-window
`LoadingScreen` overlay (pulsing wordmark) covers it and **fades out over** the
mounted dock rather than being swapped for it, so there's no hand-off flash.

When there's **no** saved layout — a fresh install, an explicit **Reset
layout**, or a corrupt/unparseable blob (discarded on read) — the dock opens
with zero panels, which dockview's built-in watermark mechanism fills with
`HomePanel` (passed as `watermarkComponent` in `dock.tsx`) — see §6.
`HomePanel` is the default empty-dock screen — it isn't a panel type, so it
can't be opened as a tab; the only way back to it mid-session is closing every
open panel.

Each panel's group header shows dockview tabs (drag + close). Right-clicking a
tab opens a native context menu via `DockviewReact`'s `getTabContextMenuItems`
(`dock.tsx`): **Duplicate tab** (Reader/Notes only) · **Close others** (not
shown on Settings, since there's only ever one) · **Close**.

**Duplicate tab** reuses `openReader`/`openNotes`, so the copy lands as a tab
in the existing Reader/Notes group rather than a new split — see "Tab
grouping" below. It reflects the source tab's _current_ state, not just what
it was opened with: `ReaderPanel`/`NotesPanel` mirror their live
position/selected-note into the panel's own params via `api.updateParameters`
whenever it changes (one-directional — read-only from the source panel's own
perspective, so duplicating never disturbs the source tab itself), and
`Duplicate tab` reads that live `panel.params` when opening the copy.

### Tab grouping, joining, and scroll preservation

Opening a second Reader or Notes tab (via the header, Home, ⌘K, an anchor, or
Duplicate tab) tabs it into the **existing** Reader/Notes group instead of
re-splitting the screen every time (`addReader`/`openNotes` in `dock.tsx`,
via dockview's `position: { referencePanel, direction: "within" }`). Notes
additionally supports being manually split apart into a left group and a
right group (drag a Notes tab out); when both exist, `openNotes` picks
whichever side matches Settings ▸ Notes ▸ **Open notes on**, by comparing the
two groups' DOM rects, rather than picking arbitrarily.

dockview's default tab renderer (`'onlyWhenVisible'`) physically detaches an
inactive tab's content from the DOM and reattaches it when reactivated, which
resets scroll position — invisible while every Reader/Notes tab had its own
group, but reachable as soon as two of them can share one (grouping,
Duplicate tab). Reader and Notes panels are opened with `renderer: "always"`
instead, which keeps a tab's content permanently mounted (in an
absolutely-positioned overlay, toggling visibility/pointer-events) so
switching tabs within a shared group never resets scroll.

When exactly two groups are open (e.g. a Reader split beside Notes — see §6),
dragging the divider between them to within 24px (`SNAP_THRESHOLD_PX`) of an
exact 50/50 split snaps it to the middle on release — both a left/right and a
top/bottom split (`snapMiddleIfClose` in `dock.tsx`, orientation read from
the two groups' own DOM rects rather than dockview's internal grid model). It
reacts to `onDidLayoutChange`, which only fires once a sash drag _ends_ (not
continuously while dragging — the same event the layout autosave above
already depends on firing for resizes), so this is a snap-on-release-if-close
correction, not a live magnetic pull mid-drag. With three or more groups it
does nothing — "the middle" between an arbitrary pair isn't identifiable from
that event alone.

Since there's no live layout event to show _during_ the drag, a thin accent
guide line (`.snap-guide`, `shell.css`) renders while the sash is within that
same 24px zone, so it's visible before you release — tracked independently
via raw `pointerdown`/`pointermove`/`pointerup` on `.dv-sash` (dockview's own
sash element class) rather than any dockview event, reading live DOM
geometry through the same `computeSnapCandidate` helper `snapMiddleIfClose`
uses, so the guide and the actual snap always agree on exactly when it'll
fire. Purely observational (only reads geometry, sets local React state) —
it can't interfere with dockview's own drag handling. On mount it grows from
its center (`scaleX`/`scaleY` + fade, axis-matched, `--dur-fast`/`--ease-out`)
rather than snapping straight in, and honors `prefers-reduced-motion`.

---

## 6. Panels

Registered in `dock.tsx` under a `components` map (`id → component`).

| Panel        | Wired to backend                       | Notes                                                                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Home**     | —                                      | Landing view: quick actions (start reading, open Notes/Search/Settings) + a recently-edited-notes list. The dockview watermark shown whenever the dock is empty — not an openable panel/tab.                                                                                                     |
| **Reader**   | `get_chapter`, `list_books`            | One translation, chosen at open time ("version-dedicated").                                                                                                                                                                                                                                      |
| **Search**   | `search` (FTS5 / bm25)                 | **Scripture** group (FTS5/bm25 via `search`) + **Notes** group (client-side substring match over the in-memory notes — title/tags/body); note hits open in the Notes panel. The `.panel__scroll` results list scrolls via `workspace/useArrowScroll.ts` while Search is dockview's active panel. |
| **Notes**    | `load_notes`/`save_note`/`delete_note` | Header, list, and a real Tiptap editor (toolbar, anchors, optional title); notes persist to disk via `NotesProvider` (`src/state/notes.tsx`), debounced per-note.                                                                                                                                |
| **Settings** | `list_translations`, `import_bible_db` | Theme toggle, default translation, Bible-database import (pick a prebuilt `bible.sqlite`), shared highlight palette, notes folder picker, notes-panel placement (Active/Left/Right).                                                                                                             |

**Home** (`HomePanel.tsx`). The empty-dock screen — passed only as
dockview's `watermarkComponent` (auto-shown whenever the dock has zero
panels: launch with no saved layout, a cleared/corrupt saved layout, "Reset
layout", or closing every panel mid-session). It's not registered in the `components` map, so
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

The Reader shows **exactly one chapter at a time** — no continuous scroll, no
virtualization. `reader/ChapterView.tsx` renders the whole chapter in one
shot (split into segments at passage headings, same as before, just no
longer a per-item unit anything measures/virtualizes). Scrolling inside the
Reader is plain page scroll within that one chapter's content; nothing
auto-loads on reaching the top or bottom. Up/Down arrow keys also scroll it
(`workspace/useArrowScroll.ts`, active only while this Reader is dockview's
active panel): a tap nudges by a fixed step, holding the key ramps into a
continuous `requestAnimationFrame`-driven scroll (steadier than relying on
the OS's key-repeat timer), and the key handler blurs whatever button last
had focus so arrow presses don't paint a stray focus ring on it.

A jump (TOC, ⌘K, a note anchor, or the chapter buttons below — see §7) calls
`ReaderPanel.jumpTo`: if the target chapter is already the one displayed, it
skips the fetch and just scrolls to the verse in place (smoothly); otherwise
it fetches the target chapter, replaces what's displayed, and lands on the
target verse instantly (no animation — there's no prior chapter content to
animate from) via its `[data-book][data-chapter][data-verse]` element,
followed by a brief highlight flash so it's obvious where you landed. Because
the whole chapter is always fully rendered, that element is guaranteed to
already exist by the time the scroll runs — there's nothing left to race
against, which is the whole point of this design (see §10 for why continuous
scroll was removed). Full detail on the smooth-vs-instant+flash split is
in §7.

A floating **chapter up/down** control (`.reader__nav`, pinned to the right
edge) steps to the previous/next chapter, rolling across book boundaries
(`nextChapterRef`/`prevChapterRef` — pure arithmetic against `api.ts`'s
canonical chapter-count table, no round-trip needed to detect a book edge).
Disabled at the two edges of the canon (Genesis 1 / Revelation's last
chapter). Always lands on the target chapter's first verse; jumping to "no
specific verse" scrolls the container to its actual top rather than scrolling
verse 1's element into view, so a passage heading above verse 1 (if any)
stays visible instead of being scrolled just out of frame. These step whole
chapters, not individual verses — an initial verse-by-verse version was
narrowed to chapters, which is what was actually wanted.

**TOC drawer** (`reader/TocDrawer.tsx`). Slides in over the Reader body
(spring). Books are listed by testament as accordions; expanding a book reveals a
grid of chapter-number chips; clicking a chip navigates and closes the drawer.
Chapter counts come from a fixed canonical table in `api.ts` (no backend query).

Opening a note — the header **Notes** button, a "Recently edited" row on
Home, or Duplicate tab — tabs into an already-open Notes group if one exists
(see "Tab grouping" in §5). Only when there's no Notes group yet does
Settings ▸ Notes ▸ **Open notes on** (`ws.notesSplitSide`, default `"right"`;
`dock.tsx`'s `openNotes`) decide placement: **Left**/**Right** split the new
Notes panel beside the active Reader (else the first Reader), **Active** tabs
it straight into whatever group is currently active, of any kind. With
nothing open at all, it's placed wherever dockview would otherwise put it.

Ctrl/Cmd-click a note in the note-list drawer (`notes/NotesDrawer.tsx`) opens
it as a new **background** tab (`dock.openNotes(id, { inactive: true })`) —
the currently-open note tab stays active/focused, mirroring the
browser convention for ctrl-click-to-open-in-a-new-tab. A plain click still
just switches the current tab's selection in place.

**Notes.** Header, left to right: a hamburger toggles the note-list sidebar
(shown only once a note is open — see below), a flexible-width search field
(`flex-1 min-w-[60px] max-w-[200px]`, shrinks before any other header control
does) filters the list live (title/tags/body, substring match), a filter icon
opens a Tags/Books/Notebooks popover, and — only while **no** note is selected —
a Cards/Bars **display toggle** (`.seg.seg--icon`, icon-only segmented control).
Pinned to the far right: a per-note **color swatch** (`notes/NotesColorMenu.tsx`)
and **notebook picker** (`notes/NotebookMenu.tsx`, both only shown once a note
is selected) and the "⋯" menu (`New note`, `Add anchor`, `Close note`, `Delete
note`). The filter popover's Tags mode is one free-text input; Books mode is a
3-column grid of book-abbreviation toggle buttons grouped under "Old
Testament"/"New Testament" headers (same `book.testament` split
`reader/TocDrawer.tsx` uses); Notebooks mode is a flat list of toggle buttons —
an always-present **Uncategorized** row (matches notes with an empty
`notebook`) followed by every distinct notebook name in use, the same
`allNotebooks` derivation `NotebookMenu` uses. The header bar is a CSS container
(`.reader__bar`'s `@container`), so `NotebookMenu`'s text label collapses to
icon-only below 420px of available width rather than overflowing.

**No note selected** ("notes home"): instead of the "Select a note to start
writing" placeholder, the main content area shows the **full note list** at
panel width — search/tag/book filtering works exactly the same as the
sidebar's. It renders as either `notes/NotesDrawer.tsx` in its `"inline"`
variant (today's row style, stretched full-width — "Bars") or
`notes/NotesCardGrid.tsx` (a responsive `grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`
tile layout — "Cards"), per the header's display toggle. The choice is a
**global** preference (`ws.notesListDisplay`, persisted to localStorage like
`notesSplitSide`/`notesLastColor`) — every Notes tab shares it. Both layouts,
plus the sidebar, render a note's summary through the shared
`notes/NoteRowContent.tsx` (color dot, title-or-preview, tag pills, anchors)
so there's one definition of what a note "row" looks like. Selecting a note
switches back to the editor and restores the header to its normal
note-open state (hamburger back, display toggle gone — the 244px sidebar
always uses bars-style rows regardless of the preference, so a toggle with
no visible effect there would be confusing).

Notes are loaded once at startup by `NotesProvider` (`src/state/notes.tsx`,
wraps `WorkspaceShell` in `App.tsx`) via the real Rust commands
(`load_notes`/`save_note`/`delete_note`, `src-tauri/src/notes.rs`) —
Markdown-on-disk with frontmatter (`id`, `title`, `tags`, `anchors`, `color`,
`created`, `modified`) is the source of truth, `notes.sqlite` is the search
index. Edits are debounced (600ms) per-note before writing to disk.
`notes/notes.ts` is the frontend-side helpers: the list preview
(`notePreview()`), the highlight palette, `NotesListDisplay`, and anchor
parsing (shared with the Reader's highlight index). Unlike the Reader's TOC
drawer, the note-list sidebar (`notes/NotesDrawer.tsx`'s `"sidebar"` variant)
isn't an overlay; it's a collapsible flex column that animates width and
pushes the editor over rather than floating on top with a scrim, so it never
covers the header.

Whichever note list is currently mounted (sidebar, inline bars, or card
grid) is also driven by `workspace/useArrowScroll.ts` — Up/Down arrow keys
scroll it while this Notes panel is active, sharing one ref (`NotesDrawer`
and `NotesCardGrid` both accept an optional `scrollRef` forwarded to their
actual scrolling element). It's skipped while the editor's contenteditable
has focus, so it never fights Tiptap's own cursor movement.

Every header popover (`Menu.tsx`, `NotesFilterMenu`, `NotebookMenu`,
`NotesColorMenu`) is fixed-width and anchors to a static left/right CSS edge,
which can overflow a narrow/split dock panel. `workspace/useMenuAlign.ts`
measures the popover once it opens and nudges it back inside the nearest
`.panel` ancestor's bounds via `margin-left` (not `transform`, so it doesn't
fight Motion's own entrance-animation transform), re-checking on window
resize while open.

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

Three navigation mechanisms, all driving the **active** Reader (opening one if
none exists):

- **⌘K / Ctrl-K command palette**: type `John 3:16`; fuzzy-matches book
  name/abbr, Enter jumps.
- **Reader TOC drawer**: per-Reader book/chapter picker.
- **Note anchor rows** (`NotesAnchorBar.tsx`): clicking an anchor jumps the
  active Reader the same way.

Coordination uses `useDock().gotoReference(bookId, chapter, verse?)` plus two
window `CustomEvent`s:

| Event         | Dispatched by                         | Consumed by             |
| ------------- | ------------------------------------- | ----------------------- |
| `doxa:goto`   | `gotoReference` (palette/TOC/anchors) | the active Reader panel |
| `doxa:search` | header global search submit           | the Search panel        |
| `doxa:toast`  | `toast()` (e.g. layout save/reset)    | the `Toast` component   |

The active Reader also pushes its reference/translation into the workspace store
via `onDidActiveChange`, which is what the status bar reads.

`doxa:goto` carries the target reader panel's `id` in its detail, dispatched
by `gotoReference` and matched against `api.id` in `ReaderPanel`'s listener —
deliberately not `api.isActive`, since `gotoReference` calls `setActive()`
right before dispatching and `isActive` isn't guaranteed to have propagated
by the time the event is handled; matching by id can't be affected by that
timing.

The event is handled by `ReaderPanel.jumpTo`, which also backs the TOC
drawer's picker and the Reader's chapter up/down buttons (`stepChapter`):

- **Same chapter already displayed** (e.g. an anchor to a different verse in
  the chapter you're reading, or stepping within the loaded chapter): no
  fetch, just `scrollIntoView({ block: "start", behavior: "smooth" })` on the
  `[data-book][data-chapter][data-verse]` element — safe to animate since
  there's no background loading to race against.
- **Different chapter** (TOC, ⌘K/an anchor to another chapter, or the chapter
  buttons): fetches it (`get_chapter` + `section_headings_for_chapter`),
  replaces what's displayed, and once that commits, lands on the target verse
  _instantly_ (`behavior` omitted — there's no prior chapter content to
  animate from), then flashes it (`.verse-flash`, `shell.css` — a ~900ms
  `background-color` pulse reusing `--accent-rgb`, respects
  `prefers-reduced-motion` the same way `tokens.css`'s dockview-transition
  override does) so it's obvious where you landed, since an instant swap
  alone doesn't otherwise show that.

Both cases resolve "no specific verse requested" (TOC picks, the chapter
buttons) by scrolling the _container_ to its own top rather than
`scrollIntoView`-ing verse 1's element — the latter would put verse 1 itself
flush at the top and scroll any passage heading above it out of view.

Earlier implementations tried continuous-scroll (a hand-rolled multi-chapter
window, then a `react-virtuoso`-virtualized one) so a jump could sometimes
resolve as an in-place smooth scroll instead of a full reset. Both kept
producing the same bug — a scroll animation racing against background chapter
loading, landing on the wrong verse or triggering runaway scrolling — in a
new form every time the coordination got more complex. Single-chapter display
removes the race by construction: only one chapter is ever mounted, it's
loaded synchronously before it's shown, and the scroll is a non-animated jump
against content that's already fully rendered — there's nothing left to race
against.

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
paint to avoid a flash, and `index.html` also renders a static "Doxa Theou"
boot wordmark inside `#root` (position:fixed, themed via a `--boot-fg` the same
script sets) so the window shows the wordmark rather than a blank while the
bundle loads; React replaces it on mount, handing off to `LoadingScreen`.

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
- The Reader shows one chapter at a time, not continuous scroll — deliberately
  removed (see §6/§7) after repeated scroll-vs-background-loading race bugs;
  moving between chapters is via TOC, ⌘K/a note anchor, or the chapter
  up/down buttons, not scrolling past the chapter's edge.
- The Reader's up/down buttons step whole **chapters**, not individual
  verses — an initial verse-by-verse version was narrowed down to chapters
  once built, since chapter-level stepping was what was actually wanted.
- The middle-snap divider behavior (§5) only activates for exactly two open
  groups, and only snaps on releasing the drag (dockview's dimension-change
  event doesn't fire continuously while dragging) — not a live magnetic pull,
  and not defined for 3+ groups.
- Cross-references panel deferred (empty data table).
- The Notes group left/right tiebreak (§5) only compares the two extremes
  (leftmost/rightmost group by DOM rect) — correct for the common "split
  into two" case, not a general N-group layout resolver.
- No reference-history tracking exists (`activeReference` is a single
  overwritten value, not a list), so Home surfaces recent _notes_ activity
  only, not recently-read passages.
- The Notes 244px sidebar always renders bars-style rows and ignores
  `ws.notesListDisplay` — cards don't fit that width, so this is a hard rule,
  not a follow-up TODO. Only the full-width "notes home" list (no note
  selected) honors the Cards/Bars preference.
