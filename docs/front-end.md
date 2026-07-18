# Front-End — App UI

Documentation for the doxa-theou desktop UI: a **Logos × VSCode modular
workspace** — dockable panels the user can split, tab, and rearrange, framed by
a custom window bar and a thin status bar. Backend/verse-data layer is documented
separately in [`../DESIGN.md`](../DESIGN.md).

---

## 1. Design language — "Koine Ink"

Utilitarian, low-chrome, information-dense — Logos Bible Software crossed with a
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

When building or modifying a UI component, follow this pipeline in order — it is
the standing convention for this project (also noted in `CLAUDE.md`):

1. **ui-ux-pro-max** — pick/validate style · palette · fonts; check WCAG contrast.
2. **design-system** — lock decisions into tokens (`src/styles/tokens.css`).
3. **ui-styling** — build the component against those tokens.
4. **motion-framer** — add restrained motion (`motion/react`), honoring
   `prefers-reduced-motion`.

---

## 2. Tech stack

| Concern          | Choice                                                                             |
| ---------------- | ---------------------------------------------------------------------------------- |
| Framework        | React 19 + TypeScript (Vite)                                                       |
| Docking / tiling | [`dockview-react`](https://dockview.dev) v7 (drag-to-dock, serialization)          |
| Motion           | `motion` (Framer Motion) — `motion/react`                                          |
| Fonts            | `@fontsource/{newsreader,ibm-plex-sans,ibm-plex-mono}`                             |
| Native bridge    | `@tauri-apps/api` — `invoke()` for commands, `getCurrentWindow()` for the titlebar |
| Icons            | Hand-rolled inline SVG (`src/workspace/icons.tsx`) — no icon-lib dependency        |

State is a plain React context (`src/state/workspace.tsx`) — no store library
until it measurably needs one.

---

## 3. Design tokens (`src/styles/tokens.css`)

Three-layer CSS variables: **primitive → semantic → component**. Components must
reference `var(--…)` — never raw hex.

- **Primitives** — the raw Koine Ink hexes (light + dark), plus spacing, radii,
  type scale, motion, z-index.
- **Semantic** — the only color vars components use: `--bg`, `--bg-panel`,
  `--text`, `--text-muted`, `--border`, `--border-strong`, `--accent`,
  `--accent-strong`, `--on-accent`. These flip on `:root[data-theme="dark"]`.
- **Component** — per-surface tokens: `--header-*`, `--statusbar-*`, `--menu-*`,
  `--drawer-*`, `--input-*`, button tints, etc.

Two derived tokens exist for accessibility (both palettes validated AA):

- `--on-accent` — text color on an accent fill: white in light, near-black in
  dark (white-on-accent fails 4.5:1 in dark, so it flips per theme).
- `--border-strong` — a visible border for **meaningful** boundaries; the quiet
  `--border` stays for decorative separation.

### Dockview theme bridge

Dockview is themed by our tokens rather than its built-ins. We piggyback the
`themeVisualStudio` object (for structural CSS) and override its `--dv-*` color
variables under `.dock-host .dockview-theme-vs` — so panel chrome uses our
palette and flips with `[data-theme]` automatically.

Global element styling (resets, fonts, scrollbars, focus) lives in
`src/styles/base.css`; all component classes in `src/styles/shell.css`.

---

## 4. File map

```
src/
  main.tsx                 entry — imports fonts + styles (dockview CSS first) + <App/>
  App.tsx                  <WorkspaceProvider><WorkspaceShell/></WorkspaceProvider>
  api.ts                   typed invoke() wrappers + canonical chapter counts
  state/workspace.tsx      context store: theme, books, translations, active ref/translation
  styles/
    tokens.css             three-layer tokens + dockview bridge (design source of truth)
    base.css               element resets, fonts, scrollbars, focus
    shell.css              all component classes
  workspace/
    WorkspaceShell.tsx     top-level grid: header / dock / status bar
    Header.tsx             custom window bar + global controls
    StatusBar.tsx          reference · translation · status · live clock
    CommandPalette.tsx     ⌘K go-to-reference
    dock.tsx               dockview wrapper, panel registry, DockProvider/useDock, ⋯ controls
    Menu.tsx               reusable dropdown menu
    icons.tsx              inline SVG icon set
  panels/
    ReaderPanel.tsx        scripture reader (one translation per panel)
    reader/TocDrawer.tsx   in-panel book/chapter navigator
    NotesPanel.tsx         stub
    SearchPanel.tsx        Verses + Notes result groups
    SettingsPanel.tsx      theme toggle, default translation, highlight placeholder
```

---

## 5. Shell layout

`WorkspaceShell` is a CSS grid of three rows: **header / dockable center /
status bar**.

### Header (custom window bar)

The OS titlebar is disabled (`decorations:false`); this bar replaces it and is
the window drag region (`data-tauri-drag-region`). Left → right:

- **Δόξα Θεοῦ** wordmark (logo placeholder).
- **Global search** field — opens/updates the Search panel.
- **Layout** menu — Add Reader / Add Notes / Add Search / Save layout / Reset layout.
- Right cluster: **Bible reader ▾** (pick a translation → opens a Reader bound to
  it) · **Notes** · **Settings**.
- **Window controls** — minimize · maximize/restore · close. (The close control
  also quits — single-window app.)

### Status bar

Thin and quiet: **active reference** (mono) · **active translation** ·
**index/save status** · … · **live clock** (far right). The theme toggle is
**not** here — it lives in Settings.

### Dockable center

A `dockview-react` surface. Panels can be dragged to split/tab/rearrange freely
(1×1, 2×1, quad, …). The layout is serialized to `localStorage` on every change
and restored on launch; **Layout ▸ Save/Reset** manage it explicitly.

Each panel's group header shows dockview tabs (drag + close) plus a `⋯` overflow
(**Copy reference · Close others · Close**), acting on the group's active panel.

---

## 6. Panels

Registered in `dock.tsx` under a `components` map (`id → component`).

| Panel        | Wired to backend            | Notes                                                       |
| ------------ | --------------------------- | ----------------------------------------------------------- |
| **Reader**   | `get_chapter`, `list_books` | One translation, chosen at open time ("version-dedicated"). |
| **Search**   | `search` (FTS5 / bm25)      | Verses + Notes groups; Notes search is a placeholder.       |
| **Notes**    | —                           | Stub textarea; Markdown-on-disk editor is a later pass.     |
| **Settings** | `list_translations`         | Theme toggle, default translation, highlight swatches.      |

**Reader.** Header carries the **TOC toggle**, current reference, and the bound
version. The body renders verses (Newsreader) with mono, accent verse numbers.
When a Reader is the active panel it owns the status bar and is the target for
go-to-reference.

**TOC drawer** (`reader/TocDrawer.tsx`). Slides in over the Reader body
(spring). Books are listed by testament as accordions; expanding a book reveals a
grid of chapter-number chips; clicking a chip navigates and closes the drawer.
Chapter counts come from a fixed canonical table in `api.ts` (no backend query).

---

## 7. Navigation & cross-panel events

Two navigation mechanisms, both driving the **active** Reader (opening one if
none exists):

- **⌘K / Ctrl-K command palette** — type `John 3:16`; fuzzy-matches book
  name/abbr, Enter jumps.
- **Reader TOC drawer** — per-Reader book/chapter picker.

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

- `src-tauri/tauri.conf.json` — window `decorations:false`, larger default +
  `minWidth`/`minHeight`.
- `src-tauri/capabilities/default.json` — window permissions: `allow-minimize`,
  `allow-maximize`, `allow-unmaximize`, `allow-toggle-maximize`,
  `allow-is-maximized`, `allow-close`, `allow-start-dragging`.
- `Header.tsx` drives controls via `getCurrentWindow()` (`.minimize()`,
  `.toggleMaximize()`, `.close()`), all guarded so they no-op outside Tauri.

An inline script in `index.html` applies the saved/system theme before first
paint to avoid a flash.

---

## 9. How to add a new panel type

1. Create `src/panels/MyPanel.tsx` (a component; use `IDockviewPanelProps` if it
   needs the panel `api`/`params`).
2. Register it in `dock.tsx`'s `components` map (`mypanel: () => <MyPanel/>`).
3. To open it from the header, add a `dock.openSingleton("mypanel")` button (or
   `dock.openReader`-style opener for multi-instance panels), and add its title
   to `TITLES`.
4. Style with token-based classes in `shell.css` (never raw hex).
5. Add motion only after the structure works, via `motion/react`.

A **Cross-references** panel is the obvious next one — the registry makes it a
small addition once cross-ref data is sourced (its DB table is currently empty).

---

## 10. Deliberate simplifications

Marked with `ponytail:` comments in-code, each with an upgrade path:

- **Notes** is a visual stub (Markdown-on-disk editor comes later).
- **Chapter counts** are the fixed 66-book canon in `api.ts` — no backend query.
- **State** is React context, not a store library.
- The `⋯` menu is group-level, acting on the active panel (not a per-tab menu).
- No prev/next chapter controls in the Reader — navigation is TOC + ⌘K.
- Cross-references panel deferred (empty data table).
