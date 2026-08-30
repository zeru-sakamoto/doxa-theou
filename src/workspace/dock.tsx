// Dockview wrapper: panel registry, imperative open/goto/layout API (via
// context), the tab right-click menu, and layout persistence. The
// DockviewReact element is rendered by <Dockview/>; the shell places it in
// the center.
import {
  Component,
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DockviewDefaultTab,
  DockviewReact,
  themeVisualStudio,
  type BuiltInContextMenuItem,
  type DockviewApi,
  type GetTabContextMenuItemsParams,
  type IDockviewPanel,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type ReactContextMenuItemConfig,
  type SerializedDockview,
} from "dockview-react";
import { HomePanel } from "../panels/HomePanel";
import type { NotesParams } from "../panels/NotesPanel";
import { ReaderPanel, type ReaderParams } from "../panels/ReaderPanel";
import { useWorkspace } from "../state/workspace";
import {
  BibleIcon,
  CloseIcon,
  ICON,
  KeyboardIcon,
  NotesIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";
import { toast } from "./Toast";

// Reader is the most commonly-reopened panel, so it's imported eagerly above.
// Notes/Search/Settings are opened on demand — lazy so their code (notably
// Notes' whole Tiptap editor stack, the single biggest contributor to bundle
// size) only loads the first time each panel is actually opened.
const NotesPanel = lazy(() =>
  import("../panels/NotesPanel").then((m) => ({ default: m.NotesPanel })),
);
const SearchPanel = lazy(() =>
  import("../panels/SearchPanel").then((m) => ({ default: m.SearchPanel })),
);
const SettingsPanel = lazy(() =>
  import("../panels/SettingsPanel").then((m) => ({
    default: m.SettingsPanel,
  })),
);
const TypingPanel = lazy(() =>
  import("../panels/TypingPanel").then((m) => ({ default: m.TypingPanel })),
);

function PanelFallback() {
  return (
    <div className="panel">
      <p className="panel__muted p-4">Loading…</p>
    </div>
  );
}

// Contains a crash to the panel that threw it instead of taking down the
// whole dock — no error boundary previously existed anywhere in the app, so
// any uncaught render/effect error in any single panel blanked the entire
// window. Class component: error boundaries have no hook-based equivalent.
class PanelErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Panel crashed:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="panel">
          <p className="panel__error p-4">
            This panel crashed: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const LAYOUT_KEY = "doxa-layout";
// Snapshot of doxa-layout taken right before it would otherwise be lost —
// at launch (before this session can overwrite it) and right before "Reset
// layout" clears the dock — so "Restore most recent layout" always has
// something to offer regardless of startup mode.
const RECENT_LAYOUT_KEY = "doxa-recent-layout";

// Read-only lookup for the Header menu (thumbnail + item visibility) — kept
// outside the dock context since it doesn't need the live DockviewApi.
export function getRecentLayoutSnapshot(): SerializedDockview | null {
  const raw = localStorage.getItem(RECENT_LAYOUT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SerializedDockview;
  } catch {
    return null;
  }
}
type Singleton = "search" | "settings" | "typing";
const TITLES: Record<Singleton, string> = {
  search: "Search",
  settings: "Settings",
  typing: "Typing Practice",
};

// How close (in px) to the exact 50/50 split a sash drag has to land for it
// to snap to the middle — applies to both a left/right and a top/bottom
// two-group split. Scoped to exactly two groups: with more, "the middle"
// between an arbitrary pair isn't well-defined without picking a specific
// sash, which the layout-change event below doesn't identify.
const SNAP_THRESHOLD_PX = 24;

type DockGroup = DockviewApi["groups"][number];

interface SnapCandidate {
  axis: "x" | "y";
  /** Target width/height for `a` (the first of the two groups) at exact 50/50. */
  sizeMid: number;
  /** How far the current split currently is from that target, in px. */
  diff: number;
  /** Absolute (viewport/client) coordinate of the midpoint, for drawing a guide line. */
  guidePos: number;
}

// Shared by the actual snap (register, below) and the live drag indicator
// (Dockview, below) so both agree on exactly the same geometry/threshold —
// the guide line shows precisely when a release would snap, not an
// approximation of it. Orientation is read from the two groups' own DOM
// rects (same row → side-by-side/vertical divider; same column →
// stacked/horizontal divider) rather than dockview's internal grid model,
// so this doesn't depend on any undocumented internals.
function computeSnapCandidate(
  a: DockGroup,
  b: DockGroup,
): SnapCandidate | null {
  const ra = a.element.getBoundingClientRect();
  const rb = b.element.getBoundingClientRect();
  const sameRow = Math.abs(ra.top - rb.top) < 1;
  const sameColumn = Math.abs(ra.left - rb.left) < 1;
  if (sameRow && !sameColumn) {
    const sizeMid = (ra.width + rb.width) / 2;
    return {
      axis: "x",
      sizeMid,
      diff: Math.abs(ra.width - sizeMid),
      guidePos: Math.min(ra.left, rb.left) + sizeMid,
    };
  }
  if (sameColumn && !sameRow) {
    const sizeMid = (ra.height + rb.height) / 2;
    return {
      axis: "y",
      sizeMid,
      diff: Math.abs(ra.height - sizeMid),
      guidePos: Math.min(ra.top, rb.top) + sizeMid,
    };
  }
  return null;
}

// dockview's dimension-change notifications only fire once a sash drag ends
// (not continuously while dragging), so this is a "snap on release if you
// dropped it close" correction rather than a live magnetic pull — reusing
// the same onDidLayoutChange event the layout autosave below already
// depends on firing for resizes. The live indicator while dragging (see
// Dockview's snap-guide effect below) is tracked separately, directly off
// pointer events, since there's no live layout event to hook into.
function snapMiddleIfClose(api: DockviewApi) {
  const groups = api.groups;
  if (groups.length !== 2) return;
  const candidate = computeSnapCandidate(groups[0], groups[1]);
  if (!candidate) return;
  if (candidate.diff > 1 && candidate.diff <= SNAP_THRESHOLD_PX) {
    groups[0].api.setSize(
      candidate.axis === "x"
        ? { width: candidate.sizeMid }
        : { height: candidate.sizeMid },
    );
  }
}

const components = {
  reader: (props: IDockviewPanelProps) => (
    <PanelErrorBoundary>
      <ReaderPanel {...(props as IDockviewPanelProps<ReaderParams>)} />
    </PanelErrorBoundary>
  ),
  notes: (props: IDockviewPanelProps) => (
    <PanelErrorBoundary>
      <Suspense fallback={<PanelFallback />}>
        <NotesPanel {...(props as IDockviewPanelProps<NotesParams>)} />
      </Suspense>
    </PanelErrorBoundary>
  ),
  search: (props: IDockviewPanelProps) => (
    <PanelErrorBoundary>
      <Suspense fallback={<PanelFallback />}>
        <SearchPanel {...props} />
      </Suspense>
    </PanelErrorBoundary>
  ),
  settings: () => (
    <PanelErrorBoundary>
      <Suspense fallback={<PanelFallback />}>
        <SettingsPanel />
      </Suspense>
    </PanelErrorBoundary>
  ),
  typing: () => (
    <PanelErrorBoundary>
      <Suspense fallback={<PanelFallback />}>
        <TypingPanel />
      </Suspense>
    </PanelErrorBoundary>
  ),
};

const TAB_ICONS: Record<string, typeof BibleIcon> = {
  reader: BibleIcon,
  notes: NotesIcon,
  search: SearchIcon,
  settings: SettingsIcon,
  typing: KeyboardIcon,
};

// Custom tab renderer, one shared component for every panel type — picks
// its icon off `api.component` rather than needing a separate component
// per entry in `tabComponents` below. Reimplements dockview-react's
// DockviewDefaultTab (title span + close button) rather than wrapping it,
// since that component has no slot for extra content; keeps the exact same
// `dv-default-tab`/`dv-default-tab-content`/`dv-default-tab-action` class
// names so the hover/active-state overrides in tokens.css (which target
// those classes) still apply untouched.
//
// Only for the visible tab strip (`tabLocation === 'header'`): the overflow
// dropdown list (`'headerOverflow'`) renders through dockview's own
// DockviewDefaultTab unmodified instead, no icon. Selecting a tab from that
// dropdown was hiding the app's whole custom titlebar; scoping our
// still-fairly-new custom renderer away from that less-exercised path
// removes it as a variable. If this recurs even without our custom tab
// content in play, the cause is elsewhere in the overflow-popup plumbing.
function PanelTab(props: IDockviewPanelHeaderProps) {
  if (props.tabLocation === "headerOverflow") {
    return <DockviewDefaultTab {...props} />;
  }
  return <PanelTabContent {...props} />;
}

function PanelTabContent({ api }: IDockviewPanelHeaderProps) {
  const [title, setTitle] = useState(api.title);
  useEffect(() => {
    const d = api.onDidTitleChange((e) => setTitle(e.title));
    if (title !== api.title) setTitle(api.title);
    return () => d.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  const Icon = TAB_ICONS[api.component];
  return (
    <div className="dv-default-tab">
      {Icon && (
        <span className="dv-tab-icon">
          <Icon size={ICON.sm} />
        </span>
      )}
      <span className="dv-default-tab-content">{title}</span>
      <div
        className="dv-default-tab-action"
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          api.close();
        }}
      >
        <CloseIcon size={ICON.xs} />
      </div>
    </div>
  );
}
const tabComponents = {
  reader: PanelTab,
  notes: PanelTab,
  search: PanelTab,
  settings: PanelTab,
  typing: PanelTab,
};

// Dockview's built-in "no panels" affordance — shown automatically whenever
// the dock is empty (fresh install, reset layout, or closing everything
// mid-session). Module-scope so it's a stable reference, same as `components`.
function Watermark() {
  return (
    <PanelErrorBoundary>
      <HomePanel />
    </PanelErrorBoundary>
  );
}

interface DockCtx {
  openReader: (translation?: string) => void;
  openNotes: (
    noteId?: string,
    opts?: { inactive?: boolean; referencePanelId?: string },
  ) => void;
  openSingleton: (component: Singleton) => void;
  gotoReference: (
    bookId: number,
    chapter: number,
    verse?: number,
    translation?: string,
  ) => void;
  /** The note open in the active Notes panel, falling back to the first
   * Notes panel (of either side) with one open — undefined if none. */
  getActiveNoteId: () => string | undefined;
  /** Translation codes of every currently open Reader panel (deduped). */
  getOpenReaderTranslations: () => string[];
  saveLayout: () => void;
  resetLayout: () => void;
  restoreRecentLayout: () => void;
  hasRecentLayout: boolean;
  register: (api: DockviewApi) => void;
}

const Ctx = createContext<DockCtx | null>(null);
export function useDock(): DockCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDock must be used within DockProvider");
  return c;
}

export function DockProvider({ children }: { children: ReactNode }) {
  const { defaultTranslation, notesSplitSide, startupMode } = useWorkspace();
  const apiRef = useRef<DockviewApi | null>(null);
  const idRef = useRef(0);
  // Mirrors whether RECENT_LAYOUT_KEY is populated, so Header re-renders
  // (and the "Restore most recent layout" item appears/disappears) as soon
  // as a snapshot is written — plain localStorage reads wouldn't be
  // reactive on their own.
  const [hasRecentLayout, setHasRecentLayout] = useState(
    () => getRecentLayoutSnapshot() !== null,
  );

  const addReader = useCallback(
    (
      code: string,
      extra?: { bookId?: number; chapter?: number; verse?: number },
    ) => {
      const api = apiRef.current;
      if (!api) return;
      // Without an explicit position, dockview tabs the new panel into
      // whatever group is currently active — which may be a Notes group.
      // Prefer joining an existing reader group as a tab over that, so
      // opening another translation doesn't land among notes tabs.
      const existingReader = api.panels.find((p) => p.id.startsWith("reader-"));
      let position:
        | {
            referencePanel: IDockviewPanel;
            direction: "left" | "right" | "within";
          }
        | undefined;
      if (existingReader) {
        position = { referencePanel: existingReader, direction: "within" };
      } else if (notesSplitSide === "left" || notesSplitSide === "right") {
        // The user explicitly chose a side for Notes — put the first Reader
        // on the opposite side instead of wherever dockview would otherwise
        // default it (typically tabbed into the active, i.e. Notes, group).
        const notePanel = api.panels.find((p) => p.id.startsWith("notes-"));
        if (notePanel) {
          position = {
            referencePanel: notePanel,
            direction: notesSplitSide === "left" ? "right" : "left",
          };
        }
      }
      api.addPanel({
        id: `reader-${++idRef.current}`,
        component: "reader",
        title: `Reader · ${code}`,
        params: { translation: code, ...extra },
        // Default 'onlyWhenVisible' renderer detaches an inactive tab's DOM
        // from its group's shared content container, which resets its
        // scroll position — a problem as soon as two readers share a group
        // (e.g. "Duplicate tab"). 'always' keeps it mounted (off-screen)
        // instead, so switching back restores exactly where it was.
        renderer: "always",
        ...(position && { position }),
      });
    },
    [notesSplitSide],
  );

  const register = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;
      // Restore the previous session's layout ("Save layout" / the autosave
      // below persist it). Restored Reader/Notes tabs reopen where they were,
      // because each panel mirrors its live position/selection into its own
      // params (see api.updateParameters in ReaderPanel/NotesPanel). A missing,
      // unparseable, or dockview-incompatible blob is discarded so we fall back
      // to the empty dock — which the watermark (HomePanel) fills — instead of
      // throwing.
      const saved = localStorage.getItem(LAYOUT_KEY);
      // Snapshot forward before this session's own changes can overwrite
      // doxa-layout, so "Restore most recent layout" always reflects what was
      // open when the app was last closed — regardless of startup mode.
      if (saved) {
        localStorage.setItem(RECENT_LAYOUT_KEY, saved);
        setHasRecentLayout(true);
      }
      if (saved && startupMode !== "dashboard") {
        try {
          api.fromJSON(JSON.parse(saved));
        } catch (e) {
          console.error("Discarding unreadable saved layout:", e);
          localStorage.removeItem(LAYOUT_KEY);
          api.clear();
        }
      }
      api.onDidLayoutChange(() =>
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON())),
      );
      api.onDidLayoutChange(() => snapMiddleIfClose(api));
    },
    [startupMode],
  );

  const openReader = useCallback(
    (translation?: string) => addReader(translation ?? defaultTranslation),
    [addReader, defaultTranslation],
  );

  // Each call opens a new independent Notes tab (own drawer/editor state),
  // same "reader-N"-style unique id pattern rather than the Singleton path.
  // If a Notes group is already open, tab the new note into it — this is
  // what "open another note" should do, not spawn a second split. Only
  // when there's no Notes group yet do we place the new one per the user's
  // preference (Settings ▸ Notes): split beside the Reader (the active
  // Reader if there is one, else the first) on a given side, or — "Active" —
  // tab it straight into whatever group is currently active, of any kind.
  const openNotes = useCallback(
    (
      noteId?: string,
      opts?: { inactive?: boolean; referencePanelId?: string },
    ) => {
      const api = apiRef.current;
      if (!api) return;
      // 'always' renderer: see the matching comment in addReader — same
      // detach-on-inactive scroll-reset issue applies once two Notes tabs
      // share a group.
      const notePanels = api.panels.filter((p) => p.id.startsWith("notes-"));
      if (notePanels.length > 0) {
        // A caller can name exactly which Notes panel to tab next to (e.g. a
        // wikilink click — it should open onto the panel it was clicked
        // from, not wherever the split-side preference points) — that skips
        // the side heuristic below entirely, since we already know the
        // target. Normally there's only one Notes group, but the user can
        // manually drag a note tab apart into a left one and a right one —
        // when both exist and no specific panel was named, honor the "Open
        // notes on" side instead of picking whichever happened to be first
        // in dockview's panel list.
        let existingNote =
          (opts?.referencePanelId &&
            notePanels.find((p) => p.id === opts.referencePanelId)) ||
          notePanels[0];
        const groups = Array.from(new Set(notePanels.map((p) => p.group)));
        if (
          !opts?.referencePanelId &&
          groups.length > 1 &&
          (notesSplitSide === "left" || notesSplitSide === "right")
        ) {
          const sorted = [...groups].sort(
            (a, b) =>
              a.element.getBoundingClientRect().left -
              b.element.getBoundingClientRect().left,
          );
          const preferredGroup =
            notesSplitSide === "left" ? sorted[0] : sorted[sorted.length - 1];
          existingNote =
            notePanels.find((p) => p.group === preferredGroup) ?? existingNote;
        }
        api.addPanel({
          id: `notes-${++idRef.current}`,
          component: "notes",
          title: "Notes",
          params: { noteId },
          renderer: "always",
          inactive: opts?.inactive,
          position: { referencePanel: existingNote, direction: "within" },
        });
        return;
      }
      let position:
        | {
            referencePanel: IDockviewPanel;
            direction: "left" | "right" | "within";
          }
        | undefined;
      if (notesSplitSide === "active") {
        if (api.activePanel) {
          position = { referencePanel: api.activePanel, direction: "within" };
        }
      } else {
        const readers = api.panels.filter((p) => p.id.startsWith("reader-"));
        const referencePanel = api.activePanel?.id.startsWith("reader-")
          ? api.activePanel
          : readers[0];
        if (referencePanel) {
          position = { referencePanel, direction: notesSplitSide };
        }
      }
      api.addPanel({
        id: `notes-${++idRef.current}`,
        component: "notes",
        title: "Notes",
        params: { noteId },
        renderer: "always",
        inactive: opts?.inactive,
        ...(position && { position }),
      });
    },
    [notesSplitSide],
  );

  const openSingleton = useCallback((component: Singleton) => {
    const api = apiRef.current;
    if (!api) return;
    const existing = api.getPanel(component);
    if (existing) {
      existing.api.setActive();
      return;
    }
    api.addPanel({ id: component, component, title: TITLES[component] });
  }, []);

  const gotoReference = useCallback(
    (bookId: number, chapter: number, verse?: number, translation?: string) => {
      const api = apiRef.current;
      if (!api) return;
      const readers = api.panels.filter((p) => p.id.startsWith("reader-"));
      if (readers.length === 0) {
        addReader(translation ?? defaultTranslation, {
          bookId,
          chapter,
          verse,
        });
        return;
      }
      const activeIsReader = !!api.activePanel?.id.startsWith("reader-");
      const target = activeIsReader ? api.activePanel! : readers[0];
      if (!activeIsReader) target.api.setActive();
      // Target by panelId, not api.isActive — setActive() above isn't
      // guaranteed to have propagated synchronously by the time this event
      // is handled, so gating on isActive can silently drop the jump.
      window.dispatchEvent(
        new CustomEvent("doxa:goto", {
          detail: { panelId: target.id, bookId, chapter, verse },
        }),
      );
    },
    [addReader, defaultTranslation],
  );

  const getActiveNoteId = useCallback(() => {
    const api = apiRef.current;
    if (!api) return undefined;
    const noteIdOf = (p: IDockviewPanel) =>
      (p.params as NotesParams | undefined)?.noteId;
    if (api.activePanel?.id.startsWith("notes-")) {
      const id = noteIdOf(api.activePanel);
      if (id) return id;
    }
    for (const p of api.panels) {
      if (!p.id.startsWith("notes-")) continue;
      const id = noteIdOf(p);
      if (id) return id;
    }
    return undefined;
  }, []);

  const getOpenReaderTranslations = useCallback(() => {
    const api = apiRef.current;
    if (!api) return [];
    const codes = api.panels
      .filter((p) => p.id.startsWith("reader-"))
      .map((p) => (p.params as ReaderParams | undefined)?.translation)
      .filter((t): t is string => !!t);
    return [...new Set(codes)];
  }, []);

  const saveLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
    toast("Layout saved");
  }, []);

  const resetLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const current = localStorage.getItem(LAYOUT_KEY);
    if (current) {
      localStorage.setItem(RECENT_LAYOUT_KEY, current);
      setHasRecentLayout(true);
    }
    localStorage.removeItem(LAYOUT_KEY);
    api.clear();
    toast("Layout reset");
  }, []);

  const restoreRecentLayout = useCallback(() => {
    const api = apiRef.current;
    const snapshot = getRecentLayoutSnapshot();
    if (!api || !snapshot) return;
    try {
      api.fromJSON(snapshot);
      toast("Most recent layout restored");
    } catch (e) {
      console.error("Discarding unreadable recent-layout snapshot:", e);
      localStorage.removeItem(RECENT_LAYOUT_KEY);
      toast("Couldn't restore that layout");
    }
  }, []);

  const value = useMemo<DockCtx>(
    () => ({
      openReader,
      openNotes,
      openSingleton,
      gotoReference,
      getActiveNoteId,
      getOpenReaderTranslations,
      saveLayout,
      resetLayout,
      restoreRecentLayout,
      hasRecentLayout,
      register,
    }),
    [
      openReader,
      openNotes,
      openSingleton,
      gotoReference,
      getActiveNoteId,
      getOpenReaderTranslations,
      saveLayout,
      resetLayout,
      restoreRecentLayout,
      hasRecentLayout,
      register,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Dockview() {
  const { register, openReader, openNotes } = useDock();
  const apiRef = useRef<DockviewApi | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [snapGuide, setSnapGuide] = useState<{
    axis: "x" | "y";
    pos: number;
  } | null>(null);

  // Live feedback for the snap-to-middle behavior (register's
  // snapMiddleIfClose, above): dockview only notifies on drag *end*, so
  // there's no live layout event to hook a guide line into. Tracked
  // directly off pointer events instead — passive (reads DOM geometry,
  // touches only local React state), so it can't interfere with dockview's
  // own drag handling. Scoped the same way the actual snap is: exactly two
  // groups, dragging the one sash between them.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function onPointerDown(e: PointerEvent) {
      const api = apiRef.current;
      if (!api || api.groups.length !== 2) return;
      if (!(e.target instanceof HTMLElement) || !e.target.closest(".dv-sash"))
        return;
      const [a, b] = api.groups;

      function onPointerMove() {
        const hostRect = host!.getBoundingClientRect();
        const candidate = computeSnapCandidate(a, b);
        if (candidate && candidate.diff <= SNAP_THRESHOLD_PX) {
          setSnapGuide({
            axis: candidate.axis,
            pos:
              candidate.guidePos -
              (candidate.axis === "x" ? hostRect.left : hostRect.top),
          });
        } else {
          setSnapGuide(null);
        }
      }
      function onPointerUp() {
        setSnapGuide(null);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      }
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }

    host.addEventListener("pointerdown", onPointerDown);
    return () => host.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Right-click a tab for Duplicate tab / Close others / Close — replaces
  // the old always-visible ⋯ overflow button. Duplicate only makes sense
  // for Reader/Notes tabs (Search/Settings are singletons), and reuses
  // openReader/openNotes so the duplicate joins the existing group like any
  // other newly-opened tab of that kind rather than splitting. Close others
  // is meaningless on Settings — there's only ever one, and it's not worth
  // closing every other tab over.
  const getTabContextMenuItems = useCallback(
    ({
      panel,
    }: GetTabContextMenuItemsParams): (
      BuiltInContextMenuItem | ReactContextMenuItemConfig
    )[] => {
      const isReader = panel.id.startsWith("reader-");
      const isNotes = panel.id.startsWith("notes-");
      const isSettings = panel.id === "settings";
      const items: (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] = [];
      if (isReader || isNotes) {
        items.push(
          {
            label: "Duplicate tab",
            action: () => {
              if (isReader) {
                openReader(
                  (panel.params as ReaderParams | undefined)?.translation,
                );
              } else {
                openNotes((panel.params as NotesParams | undefined)?.noteId);
              }
            },
          },
          "separator",
        );
      }
      if (!isSettings) items.push("closeOthers", "separator");
      items.push("close");
      return items;
    },
    [openReader, openNotes],
  );

  return (
    // overflow-hidden matters beyond clipping: dockview calls
    // tab.element.scrollIntoView() when activating a tab picked from the
    // tab-overflow dropdown (to bring it into view in the tab strip), and
    // .dock-host previously had no overflow of its own — the browser's
    // "nearest scrollable ancestor" search for that call fell all the way
    // through to <body>, which does clip (overflow:hidden, base.css) but
    // that doesn't stop scrollIntoView from still *scrolling* it
    // programmatically. That scrolled the whole page up by ~header-height,
    // pushing the header off-screen above the viewport, without resetting
    // on resize. Giving .dock-host its own overflow boundary here means the
    // search — and the scroll — terminates inside the dock instead of
    // escaping to the page.
    <div
      ref={hostRef}
      className="dock-host relative flex min-h-0 overflow-hidden"
    >
      <DockviewReact
        components={components}
        tabComponents={tabComponents}
        watermarkComponent={Watermark}
        theme={themeVisualStudio}
        dndStrategy="pointer"
        getTabContextMenuItems={getTabContextMenuItems}
        onReady={(e) => {
          apiRef.current = e.api;
          register(e.api);
        }}
      />
      {snapGuide && (
        <div
          className={`snap-guide snap-guide--${snapGuide.axis}`}
          style={
            snapGuide.axis === "x"
              ? { left: snapGuide.pos, top: 0, bottom: 0, width: 2 }
              : { top: snapGuide.pos, left: 0, right: 0, height: 2 }
          }
        />
      )}
    </div>
  );
}
