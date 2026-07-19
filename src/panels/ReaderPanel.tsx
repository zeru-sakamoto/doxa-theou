// Reader — one panel, one translation ("version-dedicated"), chosen at open.
// Header carries the TOC toggle, current reference, and the bound version.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { IDockviewPanelProps } from "dockview-react";
import {
  getChapter,
  sectionHeadingsForChapter,
  type SectionHeading,
  type Verse,
} from "../api";
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { BulletListIcon, MenuIcon, ParagraphIcon } from "../workspace/icons";
import { PassageHeading } from "./reader/PassageHeading";
import { TocDrawer } from "./reader/TocDrawer";

export interface ReaderParams {
  translation: string;
  bookId?: number;
  chapter?: number;
  verse?: number;
}

export function ReaderPanel({
  api,
  params,
}: IDockviewPanelProps<ReaderParams>) {
  const ws = useWorkspace();
  const { anchorIndex } = useNotes();
  const translation = params.translation ?? ws.defaultTranslation;
  const [bookId, setBookId] = useState(params.bookId ?? 43); // John
  const [chapter, setChapter] = useState(params.chapter ?? 1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [headings, setHeadings] = useState<SectionHeading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [flowMode, setFlowMode] = useState<"rows" | "paragraph">("rows");
  const [pendingVerse, setPendingVerse] = useState(params.verse);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load whenever the target passage or version changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChapter(bookId, chapter, translation)
      .then((vs) => !cancelled && setVerses(vs))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    // Headings only exist for ESV (that's the only translation they were parsed
    // from); other translations get none. A failure here is non-fatal either way —
    // just render without them.
    sectionHeadingsForChapter(bookId, chapter, translation)
      .then((hs) => !cancelled && setHeadings(hs))
      .catch(() => !cancelled && setHeadings([]));
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
        verse?: number;
      };
      setBookId(d.bookId);
      setChapter(d.chapter);
      setPendingVerse(d.verse);
    }
    window.addEventListener("doxa:goto", onGoto);
    return () => window.removeEventListener("doxa:goto", onGoto);
  }, [api]);

  // Scroll the target verse into view once its chapter has loaded.
  useEffect(() => {
    if (pendingVerse == null || verses.length === 0) return;
    const el = scrollRef.current?.querySelector(
      `[data-verse="${pendingVerse}"]`,
    );
    el?.scrollIntoView({ block: "start" });
    setPendingVerse(undefined);
  }, [pendingVerse, verses]);

  const navigate = useCallback((b: number, c: number) => {
    setBookId(b);
    setChapter(c);
    setTocOpen(false);
  }, []);

  // Note anchors landing in this chapter → per-verse highlight washes.
  const highlights = useMemo(
    () => anchorIndex.get(`${bookId}:${chapter}`) ?? [],
    [anchorIndex, bookId, chapter],
  );

  // Colors covering a verse. Multiple notes on one verse stack + mix
  // (background-blend-mode: multiply), Logos-style. Notes with no color
  // don't highlight at all.
  const verseColors = useCallback(
    (verse: number): string[] => {
      const colors = new Set<string>();
      for (const h of highlights) {
        if (!h.color) continue;
        const start = h.verseStart ?? 1; // whole-chapter anchor covers all
        const end = h.verseEnd ?? Number.MAX_SAFE_INTEGER;
        if (verse >= start && verse <= end) colors.add(h.color);
      }
      return [...colors];
    },
    [highlights],
  );

  // Low-alpha wash painted on just the verse text (inline, not the row),
  // so it hugs the words instead of stretching full-width; box-decoration-break
  // re-applies the padding/background per visual line when a verse wraps.
  const highlightStyle = useCallback(
    (verse: number): CSSProperties | undefined => {
      const list = verseColors(verse);
      if (list.length === 0) return undefined;
      const layers = list.map((c) => {
        const wash = `color-mix(in srgb, ${c} 42%, transparent)`;
        return `linear-gradient(${wash}, ${wash})`;
      });
      return {
        backgroundImage: layers.join(", "),
        backgroundBlendMode: list.length > 1 ? "multiply" : "normal",
        padding: "0.05em 0.3em",
        margin: "-0.05em -0.3em",
        borderRadius: "var(--radius-sm)",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      } as CSSProperties;
    },
    [verseColors],
  );

  // Split the chapter into segments at each heading's starting verse, so a
  // passage heading renders once, right before the verse it introduces.
  const segments = useMemo(() => {
    const headingAt = new Map(
      headings
        .filter((h) => h.chapter === chapter)
        .map((h) => [h.verse_start, h.heading]),
    );
    const segs: { heading?: string; verses: Verse[] }[] = [];
    for (const v of verses) {
      const heading = headingAt.get(v.verse);
      if (heading != null || segs.length === 0)
        segs.push({ heading, verses: [v] });
      else segs[segs.length - 1].verses.push(v);
    }
    return segs;
  }, [verses, headings, chapter]);

  // Row mode only: within a segment, consecutive verses sharing a color are
  // grouped so the left bracket marker spans the whole run instead of
  // restarting per line. A heading is always a hard break between groups.
  const colorGroups = useCallback(
    (list: Verse[]) => {
      const groups: { color?: string; verses: Verse[] }[] = [];
      for (const v of list) {
        const color = verseColors(v.verse)[0];
        const last = groups[groups.length - 1];
        if (last && last.color === color) last.verses.push(v);
        else groups.push({ color, verses: [v] });
      }
      return groups;
    },
    [verseColors],
  );

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
        <button
          className={`iconbtn ml-auto${flowMode === "paragraph" ? " is-active" : ""}`}
          title={
            flowMode === "rows"
              ? "Switch to paragraph view"
              : "Switch to row-by-row view"
          }
          aria-label="Toggle verse layout"
          aria-pressed={flowMode === "paragraph"}
          onClick={() =>
            setFlowMode((m) => (m === "rows" ? "paragraph" : "rows"))
          }
        >
          {flowMode === "rows" ? (
            <BulletListIcon size={15} />
          ) : (
            <ParagraphIcon size={15} />
          )}
        </button>
        <span className="font-(family-name:--font-mono) text-(length:--text-xs) text-muted tracking-[0.03em]">
          {translation}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {error && <p className="panel__error">{error}</p>}
        {!error && loading && <p className="panel__muted">Loading…</p>}
        {!error && !loading && verses.length === 0 && (
          <p className="panel__muted">
            No verses for {ws.bookName(bookId)} {chapter} in {translation}.
          </p>
        )}
        {!error && verses.length > 0 && flowMode === "rows" && (
          <div className="py-4 px-6 max-w-[70ch] font-(family-name:--font-serif) text-(length:--text-read) leading-(--lh-read) text-ink">
            {segments.map((seg, si) => (
              <div key={si}>
                {seg.heading && (
                  <PassageHeading
                    text={seg.heading}
                    className={si === 0 ? "mt-0" : "mt-8"}
                  />
                )}
                {colorGroups(seg.verses).map((g, gi) => (
                  <div
                    key={gi}
                    className={g.color ? "-ml-1.5 pl-1.5" : undefined}
                    style={
                      g.color
                        ? { boxShadow: `inset 3px 0 0 ${g.color}` }
                        : undefined
                    }
                  >
                    {g.verses.map((v) => (
                      <div
                        key={v.verse_ref_id}
                        data-verse={v.verse}
                        className="mb-[0.35em] scroll-mt-4"
                      >
                        <sup className="font-(family-name:--font-mono) text-[0.72em] font-medium text-accent align-super mr-[0.4em]">
                          {v.verse}
                        </sup>
                        <span style={highlightStyle(v.verse)}>{v.text}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {!error && verses.length > 0 && flowMode === "paragraph" && (
          <div className="py-4 px-6 max-w-[70ch]">
            {segments.map((seg, si) => (
              <div key={si}>
                {seg.heading && (
                  <PassageHeading
                    text={seg.heading}
                    className={si === 0 ? "mt-0" : "mt-8"}
                  />
                )}
                <p className="m-0 font-(family-name:--font-serif) text-(length:--text-read) leading-(--lh-read) text-ink">
                  {seg.verses.map((v) => (
                    <span
                      key={v.verse_ref_id}
                      data-verse={v.verse}
                      className="scroll-mt-4"
                    >
                      <sup className="font-(family-name:--font-mono) text-[0.72em] font-medium text-accent align-super mr-[0.3em]">
                        {v.verse}
                      </sup>
                      <span style={highlightStyle(v.verse)}>{v.text} </span>
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
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
