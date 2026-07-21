// Reader — one panel, one translation ("version-dedicated"), chosen at open.
// Header carries the TOC toggle, current reference, and the bound version.
// Shows exactly one chapter at a time — no continuous scroll. A jump (TOC,
// Cmd-K, note anchor, or the chapter up/down buttons) fetches the target
// chapter (skipped if it's already the one displayed), swaps it in, and
// lands on the target verse once that chapter's DOM has committed.
// Deliberately simple: with only one chapter ever mounted, the target verse
// element always already exists in the DOM by the time the scroll runs, so
// there's nothing for it to race against.
import { useCallback, useEffect, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import {
  chapterCount,
  getChapter,
  sectionHeadingsForChapter,
  type SectionHeading,
  type Verse,
} from "../api";
import { useWorkspace } from "../state/workspace";
import {
  BulletListIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MenuIcon,
  ParagraphIcon,
} from "../workspace/icons";
import { ChapterView } from "./reader/ChapterView";
import { TocDrawer } from "./reader/TocDrawer";

export interface ReaderParams {
  translation: string;
  bookId?: number;
  chapter?: number;
  verse?: number;
}

interface LoadedChapter {
  bookId: number;
  chapter: number;
  verses: Verse[];
  headings: SectionHeading[];
}

interface CurrentPos {
  bookId: number;
  chapter: number;
  verse: number;
}

// Brief highlight pulse on the verse a chapter-changing jump lands on (see
// FLASH_DURATION_MS below) — flashVerse is cleared after this.
const FLASH_DURATION_MS = 900;

// Pure arithmetic against the static chapterCount table — no round-trip
// needed to detect a book boundary. null means the absolute edge of the
// canon (before Genesis 1 / after Revelation's last chapter).
function nextChapterRef(
  bookId: number,
  chapter: number,
): { bookId: number; chapter: number } | null {
  if (chapter < chapterCount(bookId)) return { bookId, chapter: chapter + 1 };
  if (bookId < 66) return { bookId: bookId + 1, chapter: 1 };
  return null;
}

function prevChapterRef(
  bookId: number,
  chapter: number,
): { bookId: number; chapter: number } | null {
  if (chapter > 1) return { bookId, chapter: chapter - 1 };
  if (bookId > 1)
    return { bookId: bookId - 1, chapter: chapterCount(bookId - 1) };
  return null;
}

function scrollToVerse(
  container: HTMLElement | null,
  bookId: number,
  chapter: number,
  verse: number | undefined,
  behavior: ScrollBehavior,
) {
  if (!container) return;
  const el =
    verse != null
      ? container.querySelector<HTMLElement>(
          `[data-book="${bookId}"][data-chapter="${chapter}"][data-verse="${verse}"]`,
        )
      : null;
  if (el) el.scrollIntoView({ block: "start", behavior });
  else container.scrollTop = 0;
}

export function ReaderPanel({
  api,
  params,
}: IDockviewPanelProps<ReaderParams>) {
  const ws = useWorkspace();
  const translation = params.translation ?? ws.defaultTranslation;
  const initialBookId = params.bookId ?? 43; // John
  const initialChapter = params.chapter ?? 1;

  const [chapter, setChapter] = useState<LoadedChapter | null>(null);
  const [currentPos, setCurrentPos] = useState<CurrentPos>({
    bookId: initialBookId,
    chapter: initialChapter,
    verse: params.verse ?? 1,
  });
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [flowMode, setFlowMode] = useState<"rows" | "paragraph">("rows");

  const containerRef = useRef<HTMLDivElement>(null);
  // Bumped on every jump so a slow in-flight fetch that resolves after a
  // newer jump discards its result instead of corrupting the display.
  const generationRef = useRef(0);
  // Verse to land on once the chapter just fetched actually commits.
  const pendingVerseRef = useRef<number | undefined>(undefined);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  const flashVerseNow = useCallback((verse: number) => {
    clearTimeout(flashTimerRef.current);
    setFlashVerse(verse);
    flashTimerRef.current = setTimeout(
      () => setFlashVerse(null),
      FLASH_DURATION_MS,
    );
  }, []);

  // Jump to a reference. Already displaying this exact chapter → resolve the
  // verse and smooth-scroll to it in place, no fetch. Otherwise fetch the
  // target chapter and land on it (instantly, with a flash — see the effect
  // below) once it resolves.
  const jumpTo = useCallback(
    (bookId: number, chapterNum: number, verse?: number) => {
      if (
        chapter &&
        chapter.bookId === bookId &&
        chapter.chapter === chapterNum
      ) {
        const resolved = verse ?? chapter.verses[0]?.verse;
        if (resolved == null) return;
        setCurrentPos({ bookId, chapter: chapterNum, verse: resolved });
        // Pass the original (possibly undefined) verse, not `resolved` — no
        // verse requested means "top of chapter", which should scroll to the
        // container's actual top so a passage heading above verse 1 stays
        // visible, not scrollIntoView verse 1 itself (which would cut it off).
        scrollToVerse(
          containerRef.current,
          bookId,
          chapterNum,
          verse,
          "smooth",
        );
        return;
      }
      const gen = ++generationRef.current;
      pendingVerseRef.current = verse;
      setLoading(true);
      setError(null);
      Promise.all([
        getChapter(bookId, chapterNum, translation),
        // Headings only exist for ESV; a failure here is non-fatal —
        // just render the chapter without them.
        sectionHeadingsForChapter(bookId, chapterNum, translation).catch(
          () => [] as SectionHeading[],
        ),
      ])
        .then(([vs, hs]) => {
          if (gen !== generationRef.current) return;
          setChapter({ bookId, chapter: chapterNum, verses: vs, headings: hs });
        })
        .catch((e) => {
          if (gen !== generationRef.current) return;
          setError(String(e));
        })
        .finally(() => {
          if (gen === generationRef.current) setLoading(false);
        });
    },
    [chapter, translation],
  );

  // Consume the pending verse once the freshly-fetched chapter's DOM has
  // committed — every verse element already exists at this point (the whole
  // chapter renders in one shot), so this always finds its target. This
  // effect only runs for an actual chapter change (jumpTo's in-place path
  // above never touches `chapter` state), so the landing is always instant
  // + flashed, never smooth — there's no prior chapter content to animate
  // from.
  useEffect(() => {
    if (!chapter) return;
    const pending = pendingVerseRef.current;
    pendingVerseRef.current = undefined;
    const resolved = pending ?? chapter.verses[0]?.verse;
    setCurrentPos({
      bookId: chapter.bookId,
      chapter: chapter.chapter,
      verse: resolved ?? 1,
    });
    // Pass `pending` (possibly undefined), not `resolved` — see the same
    // note in jumpTo above: no requested verse means scroll to the actual
    // top of the chapter, not verse 1's element specifically.
    scrollToVerse(
      containerRef.current,
      chapter.bookId,
      chapter.chapter,
      pending,
      "auto",
    );
    if (resolved != null) flashVerseNow(resolved);
  }, [chapter, flashVerseNow]);

  // Step to the adjacent chapter (and across book boundaries) — same
  // canon-wide rollover the old chapter buttons had. Always lands on the
  // target chapter's first verse.
  const stepChapter = useCallback(
    (direction: 1 | -1) => {
      if (!chapter) return;
      const ref =
        direction === 1
          ? nextChapterRef(chapter.bookId, chapter.chapter)
          : prevChapterRef(chapter.bookId, chapter.chapter);
      if (!ref) return; // at the edge of the canon — button is disabled anyway
      jumpTo(ref.bookId, ref.chapter);
    },
    [chapter, jumpTo],
  );

  // Initial load — runs once on mount. `translation`/initial target are
  // fixed for the lifetime of a Reader instance (dockview panel params
  // don't change after creation), so this never needs to re-run.
  useEffect(() => {
    jumpTo(initialBookId, initialChapter, params.verse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the dockview tab label in sync with the displayed chapter.
  useEffect(() => {
    api.setTitle(
      `${ws.bookAbbr(currentPos.bookId)} ${currentPos.chapter} · ${translation}`,
    );
  }, [api, currentPos, translation, ws.bookAbbr]);

  // Mirror the current position into the panel's own params so "Duplicate
  // tab" (dock.tsx) opens the new tab where this one currently is, not where
  // it started. Read-only from this panel's perspective — it never affects
  // this instance's own state/scroll, only what a future duplicate reads.
  useEffect(() => {
    api.updateParameters({
      translation,
      bookId: currentPos.bookId,
      chapter: currentPos.chapter,
      verse: currentPos.verse,
    });
  }, [api, translation, currentPos]);

  // When this Reader is the active panel, it owns the status bar + Cmd-K target.
  // Depends on the individual setters (each stable in state/workspace.tsx)
  // rather than the whole `ws` object, whose identity changes on every one
  // of these calls — depending on `ws` itself would recreate this callback
  // every time it runs, re-triggering the effect below in a loop.
  const markActive = useCallback(() => {
    ws.setActiveReference({
      bookId: currentPos.bookId,
      chapter: currentPos.chapter,
    });
    ws.setActiveTranslation(translation);
    ws.setLastReaderPosition({ ...currentPos, translation });
  }, [
    ws.setActiveReference,
    ws.setActiveTranslation,
    ws.setLastReaderPosition,
    currentPos,
    translation,
  ]);

  useEffect(() => {
    const d = api.onDidActiveChange(() => api.isActive && markActive());
    if (api.isActive) markActive();
    return () => d.dispose();
  }, [api, markActive]);

  // Cmd-K / search / note-anchor "go to reference" drives whichever Reader
  // dock.gotoReference targeted. Matched by panelId rather than api.isActive:
  // gotoReference calls setActive() right before dispatching, and isActive
  // isn't guaranteed to have flipped by the time this handler runs, which
  // could silently drop the jump.
  useEffect(() => {
    function onGoto(e: Event) {
      const d = (e as CustomEvent).detail as {
        panelId: string;
        bookId: number;
        chapter: number;
        verse?: number;
      };
      if (d.panelId !== api.id) return;
      jumpTo(d.bookId, d.chapter, d.verse);
    }
    window.addEventListener("doxa:goto", onGoto);
    return () => window.removeEventListener("doxa:goto", onGoto);
  }, [api, jumpTo]);

  const navigate = useCallback(
    (b: number, c: number) => {
      jumpTo(b, c);
      setTocOpen(false);
    },
    [jumpTo],
  );

  const prevRef = chapter
    ? prevChapterRef(chapter.bookId, chapter.chapter)
    : null;
  const nextRef = chapter
    ? nextChapterRef(chapter.bookId, chapter.chapter)
    : null;
  const disablePrev = !chapter || !prevRef;
  const disableNext = !chapter || !nextRef;

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
          {ws.bookName(currentPos.bookId)} {currentPos.chapter}
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

      <div ref={containerRef} className="flex-1 overflow-auto">
        {error && <p className="panel__error">{error}</p>}
        {!error && loading && <p className="panel__muted">Loading…</p>}
        {!error && !loading && chapter && chapter.verses.length === 0 && (
          <p className="panel__muted">
            No verses for {ws.bookName(chapter.bookId)} {chapter.chapter} in{" "}
            {translation}.
          </p>
        )}
        {!error && chapter && chapter.verses.length > 0 && (
          <ChapterView
            bookId={chapter.bookId}
            chapter={chapter.chapter}
            verses={chapter.verses}
            headings={chapter.headings}
            flowMode={flowMode}
            flashVerse={flashVerse}
          />
        )}
      </div>

      <div className="reader__nav">
        <button
          className="iconbtn"
          title="Previous chapter"
          aria-label="Previous chapter"
          disabled={disablePrev}
          onClick={() => stepChapter(-1)}
        >
          <ChevronUpIcon size={16} />
        </button>
        <button
          className="iconbtn"
          title="Next chapter"
          aria-label="Next chapter"
          disabled={disableNext}
          onClick={() => stepChapter(1)}
        >
          <ChevronDownIcon size={16} />
        </button>
      </div>

      <TocDrawer
        open={tocOpen}
        books={ws.books}
        currentBookId={currentPos.bookId}
        currentChapter={currentPos.chapter}
        onNavigate={navigate}
        onClose={() => setTocOpen(false)}
      />
    </div>
  );
}
