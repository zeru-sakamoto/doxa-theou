// Dockview wrapper: panel registry, imperative open/goto/layout API (via
// context), the ⋯ group overflow, and layout persistence. The DockviewReact
// element is rendered by <Dockview/>; the shell places it in the center.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  DockviewReact,
  themeVisualStudio,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
} from "dockview-react";
import { ReaderPanel, type ReaderParams } from "../panels/ReaderPanel";
import { NotesPanel } from "../panels/NotesPanel";
import { SearchPanel } from "../panels/SearchPanel";
import { SettingsPanel } from "../panels/SettingsPanel";
import { formatReference, useWorkspace } from "../state/workspace";
import { Menu, type MenuAction } from "./Menu";
import { MoreIcon } from "./icons";

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
  notes: () => <NotesPanel />,
  search: () => <SearchPanel />,
  settings: () => <SettingsPanel />,
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
  return (
    <div className="dock-host">
      <DockviewReact
        components={components}
        theme={themeVisualStudio}
        rightHeaderActionsComponent={GroupControls}
        dndStrategy="pointer"
        onReady={(e) => register(e.api)}
      />
    </div>
  );
}

// The ⋯ overflow, rendered on the right of each group's tab bar; acts on the
// group's active panel.
function GroupControls(props: IDockviewHeaderActionsProps) {
  const ws = useWorkspace();
  const { activePanel, panels } = props;
  const items: MenuAction[] = [
    {
      label: "Copy reference",
      disabled: !ws.activeReference,
      onSelect: () => {
        if (ws.activeReference)
          navigator.clipboard?.writeText(
            formatReference(ws.activeReference, ws.bookName),
          );
      },
    },
    {
      label: "Close others",
      disabled: panels.length <= 1,
      onSelect: () =>
        panels.filter((p) => p !== activePanel).forEach((p) => p.api.close()),
    },
    {
      label: "Close",
      danger: true,
      onSelect: () => activePanel?.api.close(),
    },
  ];
  return (
    <div className="groupctl">
      <Menu
        triggerClassName="iconbtn"
        title="Panel menu"
        align="right"
        items={items}
      >
        <MoreIcon size={16} />
      </Menu>
    </div>
  );
}
