// Main header = custom window bar. Left: Doxa Theou wordmark. Then global search
// + Layout menu. Right cluster (order per spec): Bible reader ▾ · Notes ·
// Settings · window controls (min / max-restore / close).
import { useEffect, useState, type FormEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspace } from "../state/workspace";
import { useDock } from "./dock";
import { Menu, type MenuAction } from "./Menu";
import {
  BookIcon,
  ChevronDownIcon,
  CloseIcon,
  LayoutIcon,
  MaximizeIcon,
  MinimizeIcon,
  NotesIcon,
  RestoreIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";

export function Header() {
  const ws = useWorkspace();
  const dock = useDock();
  const [query, setQuery] = useState("");
  const [maximized, setMaximized] = useState(false);

  // Track maximize state to swap the maximize/restore icon. No-ops outside Tauri.
  useEffect(() => {
    let un: (() => void) | undefined;
    try {
      const w = getCurrentWindow();
      w.isMaximized()
        .then(setMaximized)
        .catch(() => {});
      w.onResized(() =>
        w
          .isMaximized()
          .then(setMaximized)
          .catch(() => {}),
      )
        .then((u) => (un = u))
        .catch(() => {});
    } catch {
      /* not running under Tauri */
    }
    return () => un?.();
  }, []);

  function win(action: "minimize" | "toggleMaximize" | "close") {
    try {
      const w = getCurrentWindow();
      if (action === "minimize") w.minimize();
      else if (action === "toggleMaximize") w.toggleMaximize();
      else w.close();
    } catch {
      /* not running under Tauri */
    }
  }

  function submitSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    dock.openSingleton("search");
    // Let the Search panel mount + attach its listener before we drive it.
    setTimeout(
      () => window.dispatchEvent(new CustomEvent("doxa:search", { detail: q })),
      0,
    );
  }

  const readerItems: MenuAction[] = ws.translations.length
    ? ws.translations.map((t) => ({
        label: `${t.code} — ${t.name}`,
        onSelect: () => dock.openReader(t.code),
      }))
    : [{ label: "Loading translations…", disabled: true, onSelect: () => {} }];

  const layoutItems: MenuAction[] = [
    { label: "Save layout", onSelect: () => dock.saveLayout() },
    { label: "Reset layout", danger: true, onSelect: () => dock.resetLayout() },
  ];

  const hbtn =
    "inline-flex items-center gap-1.5 h-7 px-2 rounded-(--radius-sm) bg-transparent text-ink text-(length:--text-sm) whitespace-nowrap transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint active:bg-accent-tint-strong";
  const wbtn =
    "inline-flex items-center justify-center w-11 border-0 bg-transparent text-muted transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint hover:text-ink";

  return (
    <header
      className="flex items-center gap-2 h-(--header-height) pl-3 bg-panel text-ink border-b border-border select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center pr-2" data-tauri-drag-region>
        <span
          className="font-(family-name:--font-serif) text-(length:--text-lg) font-semibold tracking-[0.01em] whitespace-nowrap"
          data-tauri-drag-region
        >
          Doxa&nbsp;Theou
        </span>
      </div>

      <form
        className="relative flex items-center grow-0 basis-[320px] max-[1024px]:basis-[220px]"
        onSubmit={submitSearch}
      >
        <span
          className="absolute left-2 flex text-muted pointer-events-none"
          aria-hidden="true"
        >
          <SearchIcon size={15} />
        </span>
        <input
          className="input w-full pl-[28px]!"
          placeholder="Search scripture…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search scripture"
        />
      </form>

      <Menu
        triggerClassName={hbtn}
        title="Layout"
        align="left"
        items={layoutItems}
      >
        <LayoutIcon size={19} strokeWidth={2.25} />
      </Menu>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      <div className="flex items-center gap-[2px] h-full">
        <Menu
          triggerClassName={hbtn}
          title="Open a Bible reader"
          align="right"
          items={readerItems}
        >
          <BookIcon size={19} strokeWidth={2.25} />
          <ChevronDownIcon size={14} strokeWidth={2.25} />
        </Menu>
        <button className={hbtn} onClick={() => dock.openNotes()} title="Notes">
          <NotesIcon size={19} strokeWidth={2.25} />
        </button>
        <button
          className={hbtn}
          onClick={() => dock.openSingleton("settings")}
          title="Settings"
        >
          <SettingsIcon size={19} strokeWidth={2.25} />
        </button>

        <div className="flex items-stretch h-full ml-1">
          <button
            className={wbtn}
            onClick={() => win("minimize")}
            title="Minimize"
            aria-label="Minimize"
          >
            <MinimizeIcon size={15} />
          </button>
          <button
            className={wbtn}
            onClick={() => win("toggleMaximize")}
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? <RestoreIcon size={14} /> : <MaximizeIcon size={14} />}
          </button>
          <button
            className="inline-flex items-center justify-center w-11 border-0 bg-transparent text-muted transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-danger hover:text-white"
            onClick={() => win("close")}
            title="Close"
            aria-label="Close"
          >
            <CloseIcon size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
