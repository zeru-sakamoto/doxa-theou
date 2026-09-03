// Icon-triggered popover to pick one *specific* Verse/Passage/Chapter for
// typing practice, bypassing the random/sequential pickers in
// passageSource.ts for a one-off manual load. Same trigger + outside-click/
// Escape popover shell as TypingScopeMenu (itself adapted from
// NotesFilterMenu), with its own Verse/Passage/Chapter tab.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import {
  chapterCount,
  getChapter,
  type Book,
  type HeadingRange,
} from "../../api";
import { SearchIcon, ICON } from "../../workspace/icons";
import { useMenuAlign } from "../../workspace/useMenuAlign";
import {
  fetchChapterText,
  fetchPassageText,
  fetchVerseText,
  type PassageText,
} from "./passageSource";
import type { TypingMode } from "./typingStats";

interface Props {
  books: Book[];
  ranges: HeadingRange[];
  translation: string;
  mode: TypingMode;
  onPick: (mode: TypingMode, pt: PassageText) => void;
}

const optionClass =
  "w-full text-left py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)";
const optionInactive =
  " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint";

export function TypingReferencePicker({
  books,
  ranges,
  translation,
  mode,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pickMode, setPickMode] = useState<TypingMode>(mode);
  const [bookId, setBookId] = useState<number | null>(null);
  const [verseNumbers, setVerseNumbers] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useMenuAlign(open, listRef);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const reset = () => {
    setBookId(null);
    setVerseNumbers(null);
  };

  const toggle = () => {
    if (!open) setPickMode(mode);
    reset();
    setOpen((o) => !o);
  };

  const chooseBook = (id: number) => {
    setBookId(id);
    setVerseNumbers(null);
  };

  const pendingChapter = useRef<number | null>(null);

  const chooseChapter = async (chapter: number) => {
    if (bookId == null) return;
    if (pickMode === "chapter") {
      setBusy(true);
      try {
        const pt = await fetchChapterText(
          { bookId, chapter },
          translation,
          books,
        );
        onPick("chapter", pt);
        setOpen(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    // verse mode: fetch this chapter's verse numbers, then let the user pick one
    setBusy(true);
    try {
      const verses = await getChapter(bookId, chapter, translation);
      setVerseNumbers(verses.map((v) => v.verse));
      pendingChapter.current = chapter;
    } finally {
      setBusy(false);
    }
  };

  const chooseVerse = async (verse: number) => {
    if (bookId == null || pendingChapter.current == null) return;
    setBusy(true);
    try {
      const pt = await fetchVerseText(
        { bookId, chapter: pendingChapter.current, verse },
        translation,
        books,
      );
      onPick("verse", pt);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const choosePassage = async (range: HeadingRange) => {
    setBusy(true);
    try {
      const pt = await fetchPassageText(range, translation, books);
      onPick("passage", pt);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const book = bookId != null ? books.find((b) => b.id === bookId) : undefined;
  const passagesInBook =
    pickMode === "passage" && bookId != null
      ? ranges.filter((r) => r.book_id === bookId)
      : [];

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={"iconbtn" + (open ? " is-active" : "")}
        title="Pick a reference"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <SearchIcon size={ICON.md} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className="menu__list menu__list--right flex flex-col gap-2 w-[260px] p-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: DUR_FAST }}
          >
            <div className="seg" role="group" aria-label="Pick type">
              {(["verse", "passage", "chapter"] as TypingMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={"seg__btn" + (pickMode === m ? " is-on" : "")}
                  onClick={() => {
                    setPickMode(m);
                    reset();
                  }}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {!book ? (
              <div className="max-h-[220px] overflow-auto">
                {(
                  [
                    [
                      "Old Testament",
                      books.filter((b) => b.testament === "OT"),
                    ],
                    [
                      "New Testament",
                      books.filter((b) => b.testament === "NT"),
                    ],
                  ] as Array<[string, Book[]]>
                ).map(([label, list]) => (
                  <section key={label} className="[&+&]:mt-3">
                    <h4 className="mb-1 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                      {label}
                    </h4>
                    <div className="grid grid-cols-3 gap-1">
                      {list.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          className={optionClass + optionInactive}
                          onClick={() => chooseBook(b.id)}
                        >
                          {b.abbr}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={optionClass + optionInactive}
                  onClick={reset}
                  disabled={busy}
                >
                  ← {book.name}
                </button>

                {pickMode === "passage" ? (
                  <div className="max-h-[220px] overflow-auto flex flex-col gap-1">
                    {passagesInBook.length === 0 ? (
                      <p className="panel__muted">No passages in this book.</p>
                    ) : (
                      passagesInBook.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          className={optionClass + optionInactive}
                          disabled={busy}
                          onClick={() => choosePassage(r)}
                        >
                          {r.chapter}:{r.verse_start}
                          {r.end_chapter !== r.chapter ||
                          r.verse_end !== r.verse_start
                            ? `-${r.end_chapter !== r.chapter ? `${r.end_chapter}:` : ""}${r.verse_end}`
                            : ""}{" "}
                          — {r.heading}
                        </button>
                      ))
                    )}
                  </div>
                ) : verseNumbers ? (
                  <div className="max-h-[220px] overflow-auto grid grid-cols-6 gap-1">
                    {verseNumbers.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={
                          optionClass + optionInactive + " text-center"
                        }
                        disabled={busy}
                        onClick={() => chooseVerse(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="max-h-[220px] overflow-auto grid grid-cols-6 gap-1">
                    {Array.from(
                      { length: chapterCount(book.id) },
                      (_, i) => i + 1,
                    ).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={
                          optionClass + optionInactive + " text-center"
                        }
                        disabled={busy}
                        onClick={() => chooseChapter(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
