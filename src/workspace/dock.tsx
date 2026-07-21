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
  DockviewReact,
  themeVisualStudio,
  type BuiltInContextMenuItem,
  type DockviewApi,
  type GetTabContextMenuItemsParams,
  type IDockviewPanel,
  type IDockviewPanelProps,
  type ReactContextMenuItemConfig,
} from "dockview-react";
import { HomePanel } from "../panels/HomePanel";
import type { NotesParams } from "../panels/NotesPanel";
import { ReaderPanel, type ReaderParams } from "../panels/ReaderPanel";
import { useWorkspace } from "../state/workspace";

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
type Singleton = "search" | "settings";
const TITLES: Record<Singleton, string> = {
  search: "Search",
  settings: "Settings",
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
  search: () => (
    <PanelErrorBoundary>
      <Suspense fallback={<PanelFallback />}>
        <SearchPanel />
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
  openNotes: (noteId?: string, opts?: { inactive?: boolean }) => void;
  openSingleton: (component: Singleton) => void;
  gotoReference: (
    bookId: number,
    chapter: number,
    verse?: number,
    translation?: string,
  ) => void;
  saveLayout: () => void;
  resetLayout: () => void;
  register: (api: DockviewApi) => void;
}

const Ctx = createContext<DockCtx | null>(null);
export function useDock(): DockCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDock must be used within DockProvider");
  return c;
}

export function DockProvider({ children }: { children: ReactNode }) {
  const { defaultTranslation, notesSplitSide } = useWorkspace();
  const apiRef = useRef<DockviewApi | null>(null);
  const idRef = useRef(0);

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
        ...(existingReader && {
          position: { referencePanel: existingReader, direction: "within" },
        }),
      });
    },
    [],
  );

  const register = useCallback((api: DockviewApi) => {
    apiRef.current = api;
    // Every launch starts with zero panels — the watermark (HomePanel) fills
    // that automatically — rather than restoring the previous session's open
    // tabs, so Home is always the first thing you see. The layout is still
    // autosaved below; only auto-*restoring* it on launch is skipped.
    api.onDidLayoutChange(() =>
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON())),
    );
    api.onDidLayoutChange(() => snapMiddleIfClose(api));
  }, []);

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
    (noteId?: string, opts?: { inactive?: boolean }) => {
      const api = apiRef.current;
      if (!api) return;
      // 'always' renderer: see the matching comment in addReader — same
      // detach-on-inactive scroll-reset issue applies once two Notes tabs
      // share a group.
      const notePanels = api.panels.filter((p) => p.id.startsWith("notes-"));
      if (notePanels.length > 0) {
        // Normally there's only one Notes group, but the user can manually
        // drag a note tab apart into a left one and a right one — when both
        // exist, honor the "Open notes on" side instead of picking whichever
        // happened to be first in dockview's panel list.
        let existingNote = notePanels[0];
        const groups = Array.from(new Set(notePanels.map((p) => p.group)));
        if (
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

  const saveLayout = useCallback(() => {
    const api = apiRef.current;
    if (api) localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
  }, []);

  const resetLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    localStorage.removeItem(LAYOUT_KEY);
    api.clear();
  }, []);

  const value = useMemo<DockCtx>(
    () => ({
      openReader,
      openNotes,
      openSingleton,
      gotoReference,
      saveLayout,
      resetLayout,
      register,
    }),
    [
      openReader,
      openNotes,
      openSingleton,
      gotoReference,
      saveLayout,
      resetLayout,
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
    <div ref={hostRef} className="dock-host relative flex min-h-0">
      <DockviewReact
        components={components}
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
