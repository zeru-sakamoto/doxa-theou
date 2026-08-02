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
(`.tiptap` in `notes-editor.css`) uses `--font-sans` (IBM Plex Sans) — regular
note-taking prose reads as UI text, not Scripture. `.tiptap blockquote`
overrides back to `--font-serif` (Newsreader), so a pasted verse quote (e.g.
via the Reader's Copy Blockquote) still reads visually like the Reader's own
verse text, even inside sans-serif note prose.

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
    reader/SelectionToolbar.tsx  floating Copy/Copy Blockquote/Add Anchor menu shown on verse-text selection, portaled to document.body
    reader/selectionCopy.ts      formats a selected verse span into plain-text or blockquote Markdown
    reader/TocDrawer.tsx   in-panel book/chapter navigator
    NotesPanel.tsx         header (list/search/filter/sort/display-toggle/color/⋯) + editor host; no note selected → full-width list instead of the editor
    notes/NotesDrawer.tsx  note list, two variants: "sidebar" (collapsible column beside an open note) and "inline" (full-width, no note open); Ctrl/Cmd-click opens a note in a new background tab
    notes/NotesCardGrid.tsx    full-width card-grid layout for the same note list, alternative to NotesDrawer's "inline" bars variant
    notes/NoteRowContent.tsx   one note's summary (color dot, title-or-preview, tag pills, anchors, last-modified date/time — hidden when sorted by book order) shared by the sidebar, inline bars, and card grid
    notes/NotesFilterMenu.tsx  tag (text) / book (multi-select) / notebook (multi-select, incl. "Uncategorized") filter popover
    notes/NotesColorMenu.tsx   per-note color swatch picker (header, left of ⋯)
    notes/NotebookMenu.tsx     per-note notebook picker (header)
    notes/NotesEditor.tsx      Tiptap editor host: toolbar, anchor bar, title input, content
    notes/WikiLink.ts          [[note]] wikilink node + `[[`-suggestion autocomplete (Obsidian-compatible id|title syntax)
    notes/NotesEditorToolbar.tsx  formatting toolbar, wraps by button-group when narrow
    notes/NotesAnchorBar.tsx   verse-anchor rows + composer (autocomplete, keyboard nav, chapter/verse validation), tinted with the note's color
    notes/notes.ts         sample-notes loader/parser, shared highlight palette, notePreview()
    SearchPanel.tsx        Scripture (FTS) + Notes (client-side) result groups
    SettingsPanel.tsx      theme toggle, default translation, Bible-database import, Logos-notes import (with undo), highlight palette, notes folder, note reading-width slider, notes-panel placement (Active/Left/Right)
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

The very first Reader (no Reader group open yet) uses that same preference in
reverse: if **Open notes on** is explicitly **Left** or **Right** (not
**Active**) and a Notes panel is already open, `addReader` places the new
Reader on the opposite side via `position: { referencePanel: notePanel,
direction: ... }`, instead of falling through to dockview's default (usually
tabbing into whichever group is currently active, e.g. the open note).

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

| Panel        | Wired to backend                                             | Notes                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | —                                                            | Landing view: quick actions (start reading, open Notes/Search/Settings) + a recently-edited-notes list. The dockview watermark shown whenever the dock is empty — not an openable panel/tab.                                                                                                                                     |
| **Reader**   | `get_chapter`, `list_books`                                  | One translation, chosen at open time ("version-dedicated").                                                                                                                                                                                                                                                                      |
| **Search**   | `search` (FTS5 / bm25)                                       | **Scripture** group (FTS5/bm25 via `search`) + **Notes** group (client-side substring match over the in-memory notes — title/tags/body); note hits open in the Notes panel. The `.panel__scroll` results list scrolls via `workspace/useArrowScroll.ts` while Search is dockview's active panel.                                 |
| **Notes**    | `load_notes`/`save_note`/`delete_note`                       | Header, list, and a real Tiptap editor (toolbar, anchors, optional title); notes persist to disk via `NotesProvider` (`src/state/notes.tsx`), debounced per-note.                                                                                                                                                                |
| **Settings** | `list_translations`, `import_bible_db`, `import_logos_notes` | Theme toggle, default translation, Bible-database import (pick a prebuilt `bible.sqlite`), Logos-notes import (one or more `.txt`/HTML exports → notes, dedupe + per-import undo + retitles already-imported blank-titled duplicates), shared highlight palette, notes folder picker, notes-panel placement (Active/Left/Right). |

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

**Selection toolbar** (`reader/SelectionToolbar.tsx`). Selecting verse text
inside the chapter container and releasing the mouse shows a small floating
menu ("Copy" / "Copy Blockquote" / "Copy Reference", then a separator and
"Add Anchor") positioned near the cursor — it does not track live while
dragging, only on `mouseup`. It always acts on the **full text of every verse
the selection touches** — found via `Range.intersectsNode` against each
verse's `[data-verse]` element, not the literal substring under the cursor —
since a chapter is always one book/chapter, that span is just the min/max
touched verse number. `reader/selectionCopy.ts` formats the copy variants:
**Copy** is `**Book C:V-V**` + one `V text` line per verse; **Copy
Blockquote** is `## Book C:V–V` (en dash) + one ``> **`V`** text`` line per
verse; **Copy Reference** is just `Book C:V-V`. Copies via
`navigator.clipboard.writeText`, no Tauri clipboard plugin needed.

**Add Anchor** reuses `buildReferenceCopy`'s `Book C:V-V` string — already
the exact format `parseAnchor` (`notes/notes.ts`) expects — and appends it to
whichever note is currently open, found via `useDock`'s `getActiveNoteId()`
(the active dockview panel's note if it's a Notes panel, else the first open
Notes panel's, checked either side of the dock — see "Tab grouping" above).
Disabled when no note is open. Mirrors `NotesPanel`'s own `confirmAnchor`
(dedupe + recompute `book` via `booksForAnchors`), including the
passage-heading auto-title lookup — both call the shared
`maybeAutoTitleFromAnchor` (`notes/notes.ts`).

Dismissal is entirely selection-driven — a `mousedown` outside the toolbar
hides it, and it only reappears on the next `mouseup` if `selectionchange`
actually fired during that gesture (otherwise an unrelated click would
re-show it for a stale, untouched browser selection) — plus `Escape`.

The toolbar is rendered via `createPortal` straight into `document.body`
rather than in place. dockview wraps every panel's content in a
`.dv-render-overlay` div with `transform` + `contain: layout paint`, which
makes that div the CSS containing block for `position: fixed` descendants
and clips anything painted outside its own (possibly much narrower, e.g. a
right-docked Reader) box — without the portal, a toolbar positioned near a
panel's far edge could silently render clipped/hidden even though its
`left`/`top` were computed against the full window.

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
`notes/NoteRowContent.tsx` (color dot, title-or-preview, tag pills, anchors,
last-modified date/time) so there's one definition of what a note "row" looks
like. Selecting a note
switches back to the editor and restores the header to its normal
note-open state (hamburger back, display toggle gone — the 244px sidebar
always uses bars-style rows regardless of the preference, so a toggle with
no visible effect there would be confusing).

Notes are loaded once at startup by `NotesProvider` (`src/state/notes.tsx`,
wraps `WorkspaceShell` in `App.tsx`) via the real Rust commands
(`load_notes`/`save_note`/`delete_note`, `src-tauri/src/notes.rs`) —
Markdown-on-disk with frontmatter (`id`, `title`, `tags`, `anchors`, `book`,
`notebook`, `color`, `created`, `modified`) is the source of truth,
`notes.sqlite` is the search index. `book` is a list of every book the
note's anchors touch (recomputed on every anchor add/remove via
`booksForAnchors()`), distinct from the free-text `notebook` grouping field.
Edits are debounced (600ms) per-note before writing to disk.
`notes/notes.ts` is the frontend-side helpers: the list preview
(`notePreview()`), the highlight palette, `NotesListDisplay`, anchor
parsing, and `booksForAnchors()` (shared with the Reader's highlight index).
When an anchor's verse range exactly matches a stored passage heading
(`section_headings_for_chapter`, see below), the shared
`maybeAutoTitleFromAnchor` (`notes/notes.ts`) prefills the still-blank title
with that heading, checked against the workspace's active translation —
called from both `NotesPanel`'s `confirmAnchor` and the Reader's
`SelectionToolbar` "Add Anchor", so either path to adding an anchor
auto-titles identically. This also matches cross-chapter headings
(e.g. "Romans 9:30-10:4"): `parseAnchor` (`notes/notes.ts`) resolves the
anchor's start/end chapter and verse separately, and
`maybeAutoTitleFromAnchor` looks up headings starting in the anchor's start
chapter and compares both ends (`chapter`/`end_chapter`/`verse_start`/
`verse_end`) rather than requiring a single-chapter anchor. Logos-imported notes get the same treatment
(including cross-chapter spans) on the Rust side (`logos_import.rs`'s
`auto_title`, checked against the Bible DB's default translation and
`notes::resolve_anchor` for parsing). Because `auto_title` only has whatever
heading data `bible.sqlite` held at import time, `import_files` also treats
re-importing a file as a chance to repair past misses: if a passage group's
`(notebook, anchor)` key already exists as a note with a still-blank title,
that duplicate is retitled in place (via `auto_title` against the _current_
headings) instead of being silently skipped — surfaced to the frontend as
`FileImportResult.retitled`/`ImportSummary.total_retitled` (`src/api.ts`),
shown in `SettingsPanel.tsx`'s import summary line. Unlike the Reader's TOC
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

**Sort menu**, right of the filter icon in the header: a plain `Menu.tsx`
instance (no dedicated component — it's just a two-item action list), toggling
between "Last modified" (the long-standing default, most-recent first) and
"Book order" (canonical Bible order — book, then chapter, then verse — of
each note's earliest anchor; notes with no parseable anchor sort last). The
current choice gets a `CheckIcon` next to its label. Applied in `NotesPanel`'s
`filtered` `useMemo` via `anchorRank()`/`compareAnchorRank()`, which re-parse
every anchor with `parseAnchor()` (rather than trusting `book[0]`'s
insertion-agnostic canonical order) so multi-anchor notes rank by their
earliest verse, not just their earliest book. This is a **global** preference
(`ws.notesSortBy`, persisted to localStorage like `notesListDisplay`) shared
by every Notes tab and list variant (sidebar/inline/cards) — the Search
panel's Notes-group results are unaffected, since that list is a plain filter
with no sort applied. While sorted by book order, `NoteRowContent` also hides
each row's last-modified date/time (reads `ws.notesSortBy` directly) so the
anchors — the thing that ordering is scanned by — get the row's full width
instead of splitting it with a now-less-relevant timestamp.

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
  list open. Spans the panel's full width regardless of the cap below (mirrors
  the Reader's `reader__bar`, which likewise stays full-width above a capped
  `ChapterView`).
  - **Highlight color is CSS-driven, not baked per-mark**: `Highlight` in
    `NotesEditor.tsx` is configured _without_ `multicolor` — every highlight
    in the editor is a plain, attribute-less `<mark>` (`toggleHighlight()`
    in the toolbar takes no color arg), and its background comes purely from
    `--editor-highlight-bg` in `notes-editor.css`. `NotesEditor.tsx` sets
    that custom property inline on `EditorContent`'s `style` to the note's
    current `highlightColor`, so it's recomputed on every render. The result:
    changing a note's color (`NotesColorMenu`) instantly recolors _every_
    highlight already in that note, old or new, with no "stuck on a stale
    color" case — there's no per-mark color attribute to go stale, and
    correspondingly no attrs-mismatch to worry about on unset either (an
    earlier version stored `color` per-mark via `multicolor: true`, which
    is why an older approach here branched on `state.highlight` to force
    unset; that's gone along with the per-mark color).
- **Reading width**: the anchor bar/title/body column (everything below the
  toolbar) is capped at `ws.notesReadingWidth` ch (inline `style`, not a
  Tailwind class, since it's a user setting rather than a fixed value) so a
  fully-open, unsplit Notes panel doesn't stretch note text edge-to-edge —
  wider by default (90ch) than `reader/ChapterView.tsx`'s fixed 70ch Reader
  cap, since notes are denser, less purely-prose, and the editor toolbar
  wants more room. User-adjustable in Settings → Notes → **Reading width**
  (a native `<input type="range">`, `.slider` in `shell.css`, 60-120ch,
  step 5; state + localStorage persistence in `state/workspace.tsx`'s
  `notesReadingWidth`/`setNotesReadingWidth`, clamped to
  `NOTES_READING_WIDTH_MIN`/`MAX`). The cap sits on an inner wrapper, not the
  `overflow-auto` scroll container itself, so the vertical scrollbar still
  hugs the panel's true right edge instead of floating in the middle of a
  wide panel. Splitting the panel narrower than the configured width makes
  the cap a no-op — content already fills the available width.
- **Markdown paste**: `useEditor`'s `editorProps.handlePaste` intercepts
  clipboard content that has no `text/html` payload (plain text — e.g. the
  Reader's Copy / Copy Blockquote / Copy Reference output) and routes it
  through `editor.commands.insertContent(text, { contentType: "markdown" })`
  instead of ProseMirror's default "insert as literal text" handling, so a
  pasted `## Heading` / `> blockquote` renders as real formatting immediately.
  Clipboard content that does carry HTML (copied from a webpage, another rich
  editor, etc.) still goes through ProseMirror's normal HTML-paste path,
  unaffected.
- **Tab-to-indent**: a local `tabIndent` extension (last in the extensions
  list, so `ListItem`/`TaskItem`'s own Tab-to-sink/Shift-Tab-to-lift get first
  refusal) handles Tab/Shift-Tab outside of lists. Inside a code block it
  inserts/removes a real tab at the cursor, unchanged. Everywhere else, Tab
  indents every heading/paragraph/blockquote touched by the selection as a
  whole block — not text inserted at the cursor — via an `indent` node
  attribute (`IndentedHeading`/`IndentedParagraph`/`IndentedBlockquote`,
  local `extend()`s of the stock nodes, swapped in via `StarterKit.configure`
  disabling the originals) rendered as a `margin-left` CSS style, so wrapped
  lines move too and a multi-block selection (e.g. a heading plus the
  blockquote under it) indents both together. A blockquote's `indent` lives
  on the `<blockquote>` element itself, not its inner paragraph — otherwise
  the blockquote's left border/accent line wouldn't move with its text;
  `blocksInSelection` redirects a quote's paragraph to its parent
  blockquote's position for this reason. Persistence round-trips through
  Markdown (which has no native concept of this indent) by encoding the
  level as a run of 4-non-breaking-space units prepended to the block's own
  markdown text on save and stripped back into the `indent` attribute on
  load — NBSP rather than real spaces/a tab, since Markdown reads 4 leading
  spaces or a tab on a fresh line as an indented code block.
- **Wikilinks** (`notes/WikiLink.ts`): typing `[[` opens an autocomplete
  dropdown (a small vanilla-DOM popup via `@tiptap/suggestion`, styled to
  match `AnchorComposer`'s dropdown) filtered against the in-memory notes
  list (`useNotes()`); a toolbar button (`notes/NoteLinkMenu.tsx`, the
  double-bracket `WikiLinkIcon`, last group in `NotesEditorToolbar.tsx`) is a
  more discoverable second entry point — its popover (modeled on
  `NotebookMenu.tsx`'s shell: `useMenuAlign`, outside-click/Escape to close)
  searches every _other_ note (`noteId` prop excludes the current one) by
  title, anchors, book, or notebook (plain substring match — no results shown
  until a query is typed, both to avoid dumping the whole vault and because
  an unfiltered list was tall enough to hit a real flexbox bug: `truncate`'s
  `overflow: hidden` zeroes a flex item's automatic minimum size, so without
  `shrink-0` on each row, flexbox compressed every row below its content
  height to fit the popup's max-height instead of overflowing/scrolling —
  fixed by adding `shrink-0`, kept rare by the search-gating). Each result
  shows the title plus a muted anchors/notebook subtitle (same token choices
  as `NoteRowContent.tsx`) so a non-title match is self-explanatory, and
  inserts at the current cursor position via `editor.chain().focus()
.insertContent(...)` rather than replacing a typed `[[` range. Either path
  inserts an identical inline atom node rendered as a
  clickable `<a class="wikilink">` pill — serif (`--font-serif`, matching
  `.tiptap blockquote`), a small page-icon (a miniature of `icons.tsx`'s
  `NotesIcon`, built as a raw inline-SVG `DOMOutputSpec` since this renders
  as literal editor DOM, not JSX) prepended to the label, tinted with the
  _linked_ note's own assigned color (not the fixed accent, not the
  workspace default highlight color — `Note.color` specifically, falling
  back to the accent tint when unset). That color is **live**: a ProseMirror
  plugin (`wikiLinkColorPlugin` in `WikiLink.ts`) stamps a `--wikilink-color`
  custom property onto each `wikiLink` node via a `DecorationSet`, recomputed
  on every doc change _and_ whenever a `WIKILINK_COLOR_REFRESH`-flagged
  transaction is dispatched — `NotesEditor.tsx`'s notes-sync effect dispatches
  exactly that into its own `editor` whenever the shared `useNotes()` list
  changes, so recoloring a note in one tab updates that note's pills
  everywhere else it's linked, immediately, with no reopen/reload (plain
  `renderHTML` only runs once per node render, so on its own it can't react
  to a _different_ note's color changing while this editor sits idle).
  It opens the target note on click (`dock.openNotes`, Ctrl/Cmd-click opens it inactive) —
  passing this editor's own panel id as `referencePanelId` so the new tab
  always lands in _this_ Notes panel specifically, not wherever the "Open
  notes on" side preference would otherwise place it when more than one
  Notes group is open (`dock.tsx`'s `openNotes`).
  Persisted as Obsidian's own pipe-alias syntax, `[[id|title]]` — the target
  is the note's stable `id` (which is also its real `{id}.md` filename), so
  the link survives title renames in both this app and Obsidian (whose
  resolver follows the id and shows the alias) without any vault-wide
  link-rewrite step. A hand-typed or Obsidian-authored bare `[[Title]]` still
  resolves on load (case-insensitive title lookup against the notes list)
  and gets upgraded to the canonical `id`-based form next save; a target that
  resolves to nothing renders dimmed/non-clickable (`.wikilink--broken`)
  rather than erroring. `WikiLink`'s `parseMarkdown`/`renderMarkdown`/
  `markdownTokenizer` read the live notes list off a module-level ref
  (`setWikiLinkNotes`, kept current by a `NotesEditor` effect) rather than
  `this.options`, since `@tiptap/markdown` calls those handlers unbound.
- **Anchor bar** (`NotesAnchorBar.tsx`): existing anchors render as
  clickable rows with a live passage preview (fetched via `get_chapter`) that
  jump the active Reader. Composing a new anchor (`Add anchor`) gets a
  book/chapter/verse **autocomplete + validation** combobox: book-name
  suggestions reuse `CommandPalette`'s exported `parseQuery()`; once a book
  is resolved, chapter suggestions are bounded by `api.ts`'s `chapterCount()`
  and verse suggestions by a live `get_chapter()` fetch for the typed
  chapter. Arrow keys move the highlight, Tab accepts the first suggestion,
  and an out-of-range chapter/verse (or an end-verse below the start) blocks
  confirm with an inline error. Each row is tinted with the note's current
  color instead of the fixed accent: `NotesEditor.tsx` passes `highlightColor`
  down as a `color` prop, `AnchorRow` sets it as an inline `--anchor-color`
  custom property on the row, and `.anchor-row`/`.anchor-row--nav:hover` in
  `shell.css` mix it into a background wash at the same 10%/16% opacity steps
  `--accent-tint`/`--accent-tint-strong` use for the fixed-accent case
  elsewhere, just against a variable color instead of the accent. The
  reference tag's text (e.g. "Romans 1:14–…") does _not_ read `--anchor-color`
  raw, though — same reasoning as the highlight-color note above: these
  swatches are tuned for a translucent background wash, not as a foreground
  color, so raw they're low-contrast against the editor background in both
  themes. `.anchor-row__tag` instead blends 40% toward `--text` (the theme's
  real foreground ink) via `color-mix()`, which clears 4.5:1 (WCAG AA) for
  every swatch across all three palettes in both themes (verified
  numerically; vivid's "yellow" is the tightest margin).
- **Title input**: optional; an empty title falls back to the body preview
  in the list card (see `notePreview()` above).
- **Color**: `NotesColorMenu.tsx` picks from the same 7-hue palette used
  elsewhere (now exported as `notes/notes.ts`'s `NOTES_HIGHLIGHT_SWATCHES`).
  Picking a color updates `ws.notesLastColor` (persisted), which new notes
  default to. The open note's own `note.color` (falling back to
  `ws.notesHighlightColor`, a fixed internal default — there's no longer a
  Settings UI to change it, see §6 SettingsPanel note below — when the note
  has no color of its own) is what the toolbar's Highlight button, the
  highlight background, and the anchor rows above are all tinted with — not
  a user-configurable global default — so each note's coloring tracks
  whatever color that note is tagged with, consistently everywhere.

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
  `allow-is-maximized`, `allow-close`, `allow-start-dragging`, `allow-set-focus`.
- `Header.tsx` drives controls via `getCurrentWindow()` (`.minimize()`,
  `.toggleMaximize()`, `.close()`), all guarded so they no-op outside Tauri.
- `SettingsPanel.tsx`'s DB importer also uses `getCurrentWindow().setFocus()`
  (see §4 in `architecture.md`) — dismissing the native file-picker dialog on
  this frameless window can leave the webview unfocused, and reloading
  immediately after left stale paint overlapping the header; refocusing first
  gives it a tick to resettle before the full navigation.

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
