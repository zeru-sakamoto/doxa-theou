// Dockview wrapper: panel registry, imperative open/goto/layout API (via
// context), the tab right-click menu, and layout persistence. The
// DockviewReact element is rendered by <Dockview/>; the shell places it in
// the center.
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  DockviewReact,
  themeVisualStudio,
  type BuiltInContextMenuItem,
  type DockviewApi,
  type GetTabContextMenuItemsParams,
  type IDockviewPanelProps,
  type ReactContextMenuItemConfig,
} from "dockview-react";
import { HomePanel } from "../panels/HomePanel";
import { ReaderPanel, type ReaderParams } from "../panels/ReaderPanel";
import { formatReference, useWorkspace } from "../state/workspace";

// Reader opens by default on every launch, so it's imported eagerly above.
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

const LAYOUT_KEY = "doxa-layout";
type Singleton = "search" | "settings";
const TITLES: Record<Singleton, string> = {
  search: "Search",
  settings: "Settings",
};

const components = {
  reader: (props: IDockviewPanelProps) => (
    <ReaderPanel {...(props as IDockviewPanelProps<ReaderParams>)} />
  ),
  notes: () => (
    <Suspense fallback={<PanelFallback />}>
      <NotesPanel />
    </Suspense>
  ),
  search: () => (
    <Suspense fallback={<PanelFallback />}>
      <SearchPanel />
    </Suspense>
  ),
  settings: () => (
    <Suspense fallback={<PanelFallback />}>
      <SettingsPanel />
    </Suspense>
  ),
};

// Dockview's built-in "no panels" affordance — shown automatically whenever
// the dock is empty (fresh install, reset layout, or closing everything
// mid-session). Module-scope so it's a stable reference, same as `components`.
function Watermark() {
  return <HomePanel />;
}

interface DockCtx {
  openReader: (translation?: string) => void;
  openNotes: () => void;
  openSingleton: (component: Singleton) => void;
  gotoReference: (bookId: number, chapter: number, verse?: number) => void;
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
  const { defaultTranslation } = useWorkspace();
  const apiRef = useRef<DockviewApi | null>(null);
  const idRef = useRef(0);

  const addReader = useCallback(
    (
      code: string,
      extra?: { bookId?: number; chapter?: number; verse?: number },
    ) => {
      const api = apiRef.current;
      if (!api) return;
      api.addPanel({
        id: `reader-${++idRef.current}`,
        component: "reader",
        title: `Reader · ${code}`,
        params: { translation: code, ...extra },
      });
    },
    [],
  );

  const register = useCallback((api: DockviewApi) => {
    apiRef.current = api;
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
      try {
        api.fromJSON(JSON.parse(saved));
      } catch {
        api.clear();
      }
    }
    // A fresh install, a corrupt/cleared saved layout, or an empty saved
    // layout all leave the dock with zero panels — the watermark (HomePanel)
    // fills that automatically, so there's nothing else to do here.
    // App-lifetime autosave; no disposal needed (dock lives as long as the app).
    api.onDidLayoutChange(() =>
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON())),
    );
  }, []);

  const openReader = useCallback(
    (translation?: string) => addReader(translation ?? defaultTranslation),
    [addReader, defaultTranslation],
  );

  // Each call opens a new independent Notes tab (own drawer/editor state),
  // same "reader-N"-style unique id pattern rather than the Singleton path.
  const openNotes = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.addPanel({
      id: `notes-${++idRef.current}`,
      component: "notes",
      title: "Notes",
    });
  }, []);

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
    (bookId: number, chapter: number, verse?: number) => {
      const api = apiRef.current;
      if (!api) return;
      const readers = api.panels.filter((p) => p.id.startsWith("reader-"));
      if (readers.length === 0) {
        addReader(defaultTranslation, { bookId, chapter, verse });
        return;
      }
      if (!api.activePanel?.id.startsWith("reader-"))
        readers[0].api.setActive();
      window.dispatchEvent(
        new CustomEvent("doxa:goto", { detail: { bookId, chapter, verse } }),
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
  const { register } = useDock();
  const ws = useWorkspace();

  // Right-click a tab for Copy reference / Close others / Close — replaces
  // the old always-visible ⋯ overflow button.
  const getTabContextMenuItems = useCallback(
    (
      _params: GetTabContextMenuItemsParams,
    ): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] => [
      {
        label: "Copy reference",
        disabled: !ws.activeReference,
        action: () => {
          if (ws.activeReference)
            navigator.clipboard?.writeText(
              formatReference(ws.activeReference, ws.bookName),
            );
        },
      },
      "separator",
      "closeOthers",
      "separator",
      "close",
    ],
    [ws],
  );

  return (
    <div className="dock-host flex min-h-0">
      <DockviewReact
        components={components}
        watermarkComponent={Watermark}
        theme={themeVisualStudio}
        dndStrategy="pointer"
        getTabContextMenuItems={getTabContextMenuItems}
        onReady={(e) => register(e.api)}
      />
    </div>
  );
}
