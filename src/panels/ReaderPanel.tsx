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
    <div className="reader" onMouseDown={markActive}>
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
        <span className="reader__ref">
          {ws.bookName(bookId)} {chapter}
        </span>
        <span className="reader__version">{translation}</span>
      </div>

      <div className="reader__body">
        {error && <p className="panel__error">{error}</p>}
        {!error && loading && <p className="panel__muted">Loading…</p>}
        {!error && !loading && verses.length === 0 && (
          <p className="panel__muted">
            No verses for {ws.bookName(bookId)} {chapter} in {translation}.
          </p>
        )}
        {!error && verses.length > 0 && (
          <ol className="verses">
            {verses.map((v) => (
              <li key={v.verse_ref_id} className="verse">
                <sup className="verse__num">{v.verse}</sup>
                <span className="verse__text">{v.text}</span>
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
