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
type Singleton = "notes" | "search" | "settings";
const TITLES: Record<Singleton, string> = {
  notes: "Notes",
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

interface DockCtx {
  openReader: (translation?: string) => void;
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
    (code: string, extra?: { bookId?: number; chapter?: number }) => {
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

  // apiRef.current is set before seed runs, so addReader() targets the live api.
  const seed = useCallback(
    () => addReader(defaultTranslation),
    [addReader, defaultTranslation],
  );

  const register = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;
      let ok = false;
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) {
        try {
          api.fromJSON(JSON.parse(saved));
          ok = api.panels.length > 0;
        } catch {
          ok = false;
        }
      }
      if (!ok) seed();
      // App-lifetime autosave; no disposal needed (dock lives as long as the app).
      api.onDidLayoutChange(() =>
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON())),
      );
    },
    [seed],
  );

  const openReader = useCallback(
    (translation?: string) => addReader(translation ?? defaultTranslation),
    [addReader, defaultTranslation],
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
    (bookId: number, chapter: number, verse?: number) => {
      const api = apiRef.current;
      if (!api) return;
      const readers = api.panels.filter((p) => p.id.startsWith("reader-"));
      if (readers.length === 0) {
        addReader(defaultTranslation, { bookId, chapter });
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
    seed();
  }, [seed]);

  const value = useMemo<DockCtx>(
    () => ({
      openReader,
      openSingleton,
      gotoReference,
      saveLayout,
      resetLayout,
      register,
    }),
    [
      openReader,
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
        theme={themeVisualStudio}
        dndStrategy="pointer"
        getTabContextMenuItems={getTabContextMenuItems}
        onReady={(e) => register(e.api)}
      />
    </div>
  );
}
