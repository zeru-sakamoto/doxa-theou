// Main header = custom window bar. Left: Δόξα Θεοῦ wordmark. Then global search
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
    { label: "Add Reader", onSelect: () => dock.openReader() },
    { label: "Add Notes", onSelect: () => dock.openSingleton("notes") },
    { label: "Add Search", onSelect: () => dock.openSingleton("search") },
    { label: "Save layout", onSelect: () => dock.saveLayout() },
    { label: "Reset layout", danger: true, onSelect: () => dock.resetLayout() },
  ];

  return (
    <header className="header" data-tauri-drag-region>
      <div className="header__brand" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          Δόξα&nbsp;Θεοῦ
        </span>
      </div>

      <form className="header__search" onSubmit={submitSearch}>
        <span className="header__searchicon" aria-hidden="true">
          <SearchIcon size={15} />
        </span>
        <input
          className="input header__searchinput"
          placeholder="Search scripture…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search scripture"
        />
      </form>

      <Menu
        triggerClassName="hbtn"
        title="Layout"
        align="left"
        items={layoutItems}
      >
        <LayoutIcon size={16} />
        <span className="hbtn__label">Layout</span>
      </Menu>

      <div className="header__spacer" data-tauri-drag-region />

      <div className="header__actions">
        <Menu
          triggerClassName="hbtn"
          title="Open a Bible reader"
          align="right"
          items={readerItems}
        >
          <BookIcon size={16} />
          <span className="hbtn__label">Bible reader</span>
          <ChevronDownIcon size={13} />
        </Menu>
        <button
          className="hbtn"
          onClick={() => dock.openSingleton("notes")}
          title="Notes"
        >
          <NotesIcon size={16} />
          <span className="hbtn__label">Notes</span>
        </button>
        <button
          className="hbtn"
          onClick={() => dock.openSingleton("settings")}
          title="Settings"
        >
          <SettingsIcon size={16} />
          <span className="hbtn__label">Settings</span>
        </button>

        <div className="wctl">
          <button
            className="wbtn"
            onClick={() => win("minimize")}
            title="Minimize"
            aria-label="Minimize"
          >
            <MinimizeIcon size={15} />
          </button>
          <button
            className="wbtn"
            onClick={() => win("toggleMaximize")}
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? <RestoreIcon size={14} /> : <MaximizeIcon size={14} />}
          </button>
          <button
            className="wbtn wbtn--close"
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
