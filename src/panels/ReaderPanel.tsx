// Reader — one panel, one translation ("version-dedicated"), chosen at open.
// Header carries the TOC toggle, current reference, and the bound version.
import { useCallback, useEffect, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { getChapter, type Verse } from "../api";
import { useWorkspace } from "../state/workspace";
import { MenuIcon } from "../workspace/icons";
import { TocDrawer } from "./reader/TocDrawer";

export interface ReaderParams {
  translation: string;
  bookId?: number;
  chapter?: number;
}

export function ReaderPanel({
  api,
  params,
}: IDockviewPanelProps<ReaderParams>) {
  const ws = useWorkspace();
  const translation = params.translation ?? ws.defaultTranslation;
  const [bookId, setBookId] = useState(params.bookId ?? 43); // John
  const [chapter, setChapter] = useState(params.chapter ?? 1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  // Load whenever the target passage or version changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChapter(bookId, chapter, translation)
      .then((vs) => !cancelled && setVerses(vs))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter, translation]);

  // Keep the dockview tab label in sync.
  useEffect(() => {
    api.setTitle(`${ws.bookAbbr(bookId)} ${chapter} · ${translation}`);
  }, [api, bookId, chapter, translation, ws]);

  // When this Reader is the active panel, it owns the status bar + Cmd-K target.
  const markActive = useCallback(() => {
    ws.setActiveReference({ bookId, chapter });
    ws.setActiveTranslation(translation);
  }, [ws, bookId, chapter, translation]);

  useEffect(() => {
    const d = api.onDidActiveChange(() => api.isActive && markActive());
    if (api.isActive) markActive();
    return () => d.dispose();
  }, [api, markActive]);

  // Cmd-K / search "go to reference" drives whichever Reader is active.
  useEffect(() => {
    function onGoto(e: Event) {
      if (!api.isActive) return;
      const d = (e as CustomEvent).detail as {
        bookId: number;
        chapter: number;
      };
      setBookId(d.bookId);
      setChapter(d.chapter);
    }
    window.addEventListener("doxa:goto", onGoto);
    return () => window.removeEventListener("doxa:goto", onGoto);
  }, [api]);

  const navigate = useCallback((b: number, c: number) => {
    setBookId(b);
    setChapter(c);
    setTocOpen(false);
  }, []);

  return (
    <div
      className="relative h-full flex flex-col bg-bg overflow-hidden"
      onMouseDown={markActive}
    >
      <div className="reader__bar">
        <button
          className="iconbtn"
          title="Table of contents"
          aria-label="Table of contents"
          aria-expanded={tocOpen}
          onClick={() => setTocOpen((o) => !o)}
        >
          <MenuIcon size={16} />
        </button>
        <span className="font-medium text-(length:--text-sm)">
          {ws.bookName(bookId)} {chapter}
        </span>
        <span className="ml-auto font-(family-name:--font-mono) text-(length:--text-xs) text-muted tracking-[0.03em]">
          {translation}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {error && <p className="panel__error">{error}</p>}
        {!error && loading && <p className="panel__muted">Loading…</p>}
        {!error && !loading && verses.length === 0 && (
          <p className="panel__muted">
            No verses for {ws.bookName(bookId)} {chapter} in {translation}.
          </p>
        )}
        {!error && verses.length > 0 && (
          <ol className="list-none m-0 py-4 px-6 max-w-[70ch] font-(family-name:--font-serif) text-(length:--text-read) leading-(--lh-read) text-ink">
            {verses.map((v) => (
              <li key={v.verse_ref_id} className="mb-[0.35em]">
                <sup className="font-(family-name:--font-mono) text-[0.72em] font-medium text-accent align-super mr-[0.4em]">
                  {v.verse}
                </sup>
                <span>{v.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <TocDrawer
        open={tocOpen}
        books={ws.books}
        currentBookId={bookId}
        currentChapter={chapter}
        onNavigate={navigate}
        onClose={() => setTocOpen(false)}
      />
    </div>
  );
}
