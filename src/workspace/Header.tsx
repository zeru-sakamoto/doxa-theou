// Main header = custom window bar. Left: Doxa Theou wordmark. Then global search
// + Layout menu. Right cluster (order per spec): Bible reader ▾ · Notes ·
// Settings · window controls (min / max-restore / close).
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  findSectionHeading,
  listSectionHeadings,
  type HeadingSuggestion,
} from "../api";
import { useWorkspace } from "../state/workspace";
import { exactReference } from "./CommandPalette";
import { getRecentLayoutSnapshot, useDock } from "./dock";
import { GhostTextInput } from "./GhostTextInput";
import { setPendingSearch } from "./globalSearch";
import { suggestCompletion } from "./inlineSuggest";
import { LayoutThumbnail } from "./LayoutThumbnail";
import { Menu, type MenuAction } from "./Menu";
import {
  BibleIcon,
  ChevronDownIcon,
  CloseIcon,
  ICON,
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
  const [headings, setHeadings] = useState<HeadingSuggestion[]>([]);

  // Loaded once (cached in api.ts) — feeds the inline suggestion below.
  useEffect(() => {
    listSectionHeadings(ws.defaultTranslation)
      .then(setHeadings)
      .catch(() => setHeadings([]));
  }, [ws.defaultTranslation]);

  const suggestion = useMemo(
    () => suggestCompletion(query, ws.books, headings),
    [query, ws.books, headings],
  );

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

  async function submitSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Typed accurately as "Book Chapter[:Verse]" or a passage heading title
    // (e.g. "Proverbs 25:1", "The Prodigal Son") — jump straight there
    // instead of opening a Search tab.
    const ref = exactReference(q, ws.books);
    if (ref) {
      dock.gotoReference(ref.bookId, ref.chapter, ref.verse);
      ws.setActiveReference(ref);
      return;
    }
    const heading = await findSectionHeading(q, ws.defaultTranslation).catch(
      () => null,
    );
    if (heading) {
      dock.gotoReference(heading.book_id, heading.chapter, heading.verse_start);
      ws.setActiveReference({
        bookId: heading.book_id,
        chapter: heading.chapter,
        verse: heading.verse_start,
      });
      return;
    }

    // Stash the query so a first-time (lazy) Search panel picks it up on mount,
    // and also fire the event for when the panel is already open.
    setPendingSearch(q);
    dock.openSingleton("search");
    setTimeout(
      () => window.dispatchEvent(new CustomEvent("doxa:search", { detail: q })),
      0,
    );
  }

  const readerItems: MenuAction[] = ws.translations.length
    ? ws.translations.map((t) => ({
        label: `${t.code} — ${t.name}${t.is_default ? " (default)" : ""}`,
        onSelect: () => dock.openReader(t.code),
      }))
    : [{ label: "Loading translations…", disabled: true, onSelect: () => {} }];

  const recentLayout = dock.hasRecentLayout ? getRecentLayoutSnapshot() : null;
  const layoutItems: MenuAction[] = [
    { label: "Save layout", onSelect: () => dock.saveLayout() },
    { label: "Reset layout", danger: true, onSelect: () => dock.resetLayout() },
    ...(recentLayout
      ? [
          {
            label: "Restore most recent layout",
            icon: <LayoutThumbnail layout={recentLayout} />,
            separatorBefore: true,
            onSelect: () => dock.restoreRecentLayout(),
          },
        ]
      : []),
  ];

  const hbtn =
    "btn-ghost gap-1.5 h-7 px-2 text-(length:--text-sm) whitespace-nowrap";
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
          <SearchIcon size={ICON.md} />
        </span>
        <GhostTextInput
          className="pl-[28px]!"
          placeholder="Search scripture…"
          value={query}
          onChange={setQuery}
          suggestion={suggestion}
          aria-label="Search scripture"
        />
      </form>

      <Menu
        triggerClassName={hbtn}
        title="Layout"
        align="left"
        items={layoutItems}
      >
        <LayoutIcon size={ICON.lg} strokeWidth={2.25} />
      </Menu>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      <div className="flex items-center gap-[2px] h-full">
        <Menu
          triggerClassName={hbtn}
          title="Open a Bible reader"
          align="right"
          items={readerItems}
        >
          <BibleIcon size={ICON.lg} strokeWidth={2.25} />
          <ChevronDownIcon size={ICON.sm} strokeWidth={2.25} />
        </Menu>
        <button className={hbtn} onClick={() => dock.openNotes()} title="Notes">
          <NotesIcon size={ICON.lg} strokeWidth={2.25} />
        </button>
        <button
          className={hbtn}
          onClick={() => dock.openSingleton("settings")}
          title="Settings"
        >
          <SettingsIcon size={ICON.lg} strokeWidth={2.25} />
        </button>

        <div className="flex items-stretch h-full ml-1">
          <button
            className={wbtn}
            onClick={() => win("minimize")}
            title="Minimize"
            aria-label="Minimize"
          >
            <MinimizeIcon size={ICON.md} />
          </button>
          <button
            className={wbtn}
            onClick={() => win("toggleMaximize")}
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <RestoreIcon size={ICON.sm} />
            ) : (
              <MaximizeIcon size={ICON.sm} />
            )}
          </button>
          <button
            className="inline-flex items-center justify-center w-11 border-0 bg-transparent text-muted transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-danger hover:text-white"
            onClick={() => win("close")}
            title="Close"
            aria-label="Close"
          >
            <CloseIcon size={ICON.md} />
          </button>
        </div>
      </div>
    </header>
  );
}
