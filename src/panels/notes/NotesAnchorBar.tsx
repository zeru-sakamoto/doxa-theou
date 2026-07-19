// Verse-anchor rows for the selected note — each a full-width rounded-rect
// block: reference, a live passage-text preview (ellipsis-truncated), and an
// X to remove it. Clicking a row (outside the X) jumps the Reader there,
// same navigation path as CommandPalette's go-to-reference. While composing,
// one extra row is an inline editable input pre-filled from the currently
// active reference.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { chapterCount, getChapter, type Book } from "../../api";
import { useWorkspace } from "../../state/workspace";
import { parseQuery } from "../../workspace/CommandPalette";
import { useDock } from "../../workspace/dock";
import { CheckIcon, CloseIcon } from "../../workspace/icons";
import { parseAnchor } from "./notes";

// Matches parseQuery's own trailing "chapter[:verse]" match — reused here to
// know where the book-name portion of the draft ends, so picking a
// suggestion replaces only that part and keeps any chapter/verse (or verse
// range, e.g. "3:1-5") the user already typed.
const NUM_SUFFIX = /(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/;

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

type DraftInfo =
  | { field: "book"; candidates: Book[] }
  | { field: "chapter"; book: Book; chapterStr: string }
  | {
      field: "verse";
      book: Book;
      chapter: number;
      verseStr: string;
      isEnd: boolean;
      verseStartNum: number | null;
    }
  | { field: "none" };

// Figures out which part of "BookName Chapter[:Verse[-Verse]]" the user is
// currently typing, so the composer can suggest/validate the right thing —
// reuses the same startsWith(bookName + " ") idiom as parseAnchor below,
// since the leniently-typed digits here (partial/empty groups allowed) are a
// superset of parseAnchor's strict "fully typed anchor" grammar.
function parseDraft(value: string, books: Book[]): DraftInfo {
  const match = books.find((b) =>
    value.toLowerCase().startsWith(b.name.toLowerCase() + " "),
  );
  if (!match)
    return { field: "book", candidates: parseQuery(value, books).candidates };

  const rest = value.slice(match.name.length + 1);
  const m = rest.match(/^(\d*)(?::(\d*)(?:-(\d*))?)?$/);
  if (!m) return { field: "none" };
  const [, chapterStr, verseStartStr, verseEndStr] = m;

  if (!rest.includes(":"))
    return { field: "chapter", book: match, chapterStr: chapterStr ?? "" };

  const chapter = parseInt(chapterStr || "0", 10);
  if (rest.includes("-"))
    return {
      field: "verse",
      book: match,
      chapter,
      verseStr: verseEndStr ?? "",
      isEnd: true,
      verseStartNum: verseStartStr ? parseInt(verseStartStr, 10) : null,
    };
  return {
    field: "verse",
    book: match,
    chapter,
    verseStr: verseStartStr ?? "",
    isEnd: false,
    verseStartNum: null,
  };
}

type Suggestion =
  | { kind: "book"; book: Book }
  | { kind: "chapter"; n: number }
  | { kind: "verse"; n: number };

interface Props {
  anchors: string[];
  onRemove: (anchor: string) => void;
  draft: string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function NotesAnchorBar({
  anchors,
  onRemove,
  draft,
  onConfirm,
  onCancel,
}: Props) {
  if (anchors.length === 0 && draft === null) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3">
      {anchors.map((a) => (
        <AnchorRow key={a} anchor={a} onRemove={onRemove} />
      ))}
      {draft !== null && (
        <AnchorComposer
          draft={draft}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function AnchorRow({
  anchor,
  onRemove,
}: {
  anchor: string;
  onRemove: (a: string) => void;
}) {
  const ws = useWorkspace();
  const dock = useDock();
  const [preview, setPreview] = useState("");
  const parsed = useMemo(
    () => parseAnchor(anchor, ws.books),
    [anchor, ws.books],
  );

  useEffect(() => {
    if (!parsed) {
      setPreview("");
      return;
    }
    let cancelled = false;
    getChapter(parsed.bookId, parsed.chapter, ws.activeTranslation)
      .then((verses) => {
        if (cancelled) return;
        const start = parsed.verseStart ?? 1;
        const end = parsed.verseEnd ?? start;
        setPreview(
          verses
            .filter((v) => v.verse >= start && v.verse <= end)
            .map((v) => v.text)
            .join(" "),
        );
      })
      .catch(() => {
        if (!cancelled) setPreview("");
      });
    return () => {
      cancelled = true;
    };
  }, [parsed, ws.activeTranslation]);

  function navigate() {
    if (!parsed) return;
    dock.gotoReference(parsed.bookId, parsed.chapter, parsed.verseStart);
    ws.setActiveReference({
      bookId: parsed.bookId,
      chapter: parsed.chapter,
      verse: parsed.verseStart,
    });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (parsed && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      navigate();
    }
  }

  return (
    <div
      role={parsed ? "button" : undefined}
      tabIndex={parsed ? 0 : undefined}
      title={parsed ? `Go to ${anchor}` : anchor}
      onClick={parsed ? navigate : undefined}
      onKeyDown={onKeyDown}
      className={
        "flex items-center gap-2 px-3 py-1.5 rounded-(--radius-md) bg-accent-tint transition-colors" +
        (parsed ? " cursor-pointer hover:bg-accent-tint-strong" : "")
      }
    >
      <span className="shrink-0 font-(family-name:--font-mono) text-(length:--text-xs) font-semibold text-accent">
        {anchor}
      </span>
      <span className="flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis font-(family-name:--font-serif) text-(length:--text-xs) text-muted">
        {preview}
      </span>
      <button
        type="button"
        className="shrink-0 flex items-center justify-center rounded-(--radius-full) p-0.5 text-muted hover:bg-accent-tint-strong hover:text-ink"
        title={`Remove anchor ${anchor}`}
        aria-label={`Remove anchor ${anchor}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(anchor);
        }}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

function AnchorComposer({
  draft,
  onConfirm,
  onCancel,
}: {
  draft: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const ws = useWorkspace();
  const [value, setValue] = useState(draft);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [verseCount, setVerseCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const draftInfo = useMemo(
    () => parseDraft(value, ws.books),
    [value, ws.books],
  );
  const verseBookId = draftInfo.field === "verse" ? draftInfo.book.id : null;
  const verseChapter = draftInfo.field === "verse" ? draftInfo.chapter : null;

  // Verse count for the chapter currently being typed — powers verse
  // suggestions/validation. Same fetch-and-cancel shape as AnchorRow's
  // passage preview above.
  useEffect(() => {
    if (verseBookId == null || !verseChapter) {
      setVerseCount(null);
      return;
    }
    let cancelled = false;
    getChapter(verseBookId, verseChapter, ws.activeTranslation)
      .then((verses) => {
        if (!cancelled) setVerseCount(verses.length);
      })
      .catch(() => {
        if (!cancelled) setVerseCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [verseBookId, verseChapter, ws.activeTranslation]);

  const { suggestions, error } = useMemo(() => {
    if (draftInfo.field === "book")
      return {
        suggestions: draftInfo.candidates.map((book): Suggestion => ({
          kind: "book",
          book,
        })),
        error: null as string | null,
      };
    if (draftInfo.field === "chapter") {
      const max = chapterCount(draftInfo.book.id);
      const suggestions = range(1, max)
        .filter(
          (n) =>
            !draftInfo.chapterStr || String(n).startsWith(draftInfo.chapterStr),
        )
        .slice(0, 10)
        .map((n): Suggestion => ({ kind: "chapter", n }));
      let error: string | null = null;
      if (draftInfo.chapterStr) {
        const n = parseInt(draftInfo.chapterStr, 10);
        if (n < 1 || n > max) error = `Chapter must be 1–${max}`;
      }
      return { suggestions, error };
    }
    if (draftInfo.field === "verse" && verseCount != null) {
      const suggestions = range(1, verseCount)
        .filter(
          (n) =>
            !draftInfo.verseStr || String(n).startsWith(draftInfo.verseStr),
        )
        .slice(0, 10)
        .map((n): Suggestion => ({ kind: "verse", n }));
      let error: string | null = null;
      if (draftInfo.verseStr) {
        const n = parseInt(draftInfo.verseStr, 10);
        if (n < 1 || n > verseCount) error = `Verse must be 1–${verseCount}`;
        else if (
          draftInfo.isEnd &&
          draftInfo.verseStartNum &&
          n < draftInfo.verseStartNum
        )
          error = "End verse must be ≥ start verse";
      }
      return { suggestions, error };
    }
    return { suggestions: [] as Suggestion[], error: null as string | null };
  }, [draftInfo, verseCount]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (suggestOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[0]);
        return;
      }
      if (e.key === "Enter" && highlighted >= 0) {
        e.preventDefault();
        pick(suggestions[highlighted]);
        return;
      }
    }
    if (e.key === "Enter" && !error) onConfirm(value);
    if (e.key === "Escape") suggestOpen ? setSuggestOpen(false) : onCancel();
  }

  function pick(s: Suggestion) {
    if (s.kind === "book") {
      const suffix = value.match(NUM_SUFFIX);
      const rest = suffix ? " " + value.slice(suffix.index) : " ";
      setValue(`${s.book.name}${rest}`.trimEnd() + " ");
    } else if (s.kind === "chapter" && draftInfo.field === "chapter") {
      setValue(`${draftInfo.book.name} ${s.n}`);
    } else if (s.kind === "verse" && draftInfo.field === "verse") {
      const prefix = draftInfo.isEnd
        ? `${draftInfo.book.name} ${draftInfo.chapter}:${draftInfo.verseStartNum}-`
        : `${draftInfo.book.name} ${draftInfo.chapter}:`;
      setValue(`${prefix}${s.n}`);
    }
    setSuggestOpen(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <div
        className={
          "flex items-center gap-2 px-3 py-1.5 rounded-(--radius-md) border bg-bg" +
          (error ? " border-danger" : " border-accent")
        }
      >
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuggestOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Book Chapter:Verse"
          className="flex-1 min-w-0 border-0 bg-transparent text-ink font-(family-name:--font-mono) text-(length:--text-xs) focus-visible:outline-none"
        />
        <button
          type="button"
          disabled={!!error}
          className="shrink-0 flex items-center justify-center rounded-(--radius-full) p-0.5 text-accent hover:bg-accent-tint-strong disabled:opacity-40 disabled:hover:bg-transparent"
          title="Add anchor"
          aria-label="Add anchor"
          onClick={() => !error && onConfirm(value)}
        >
          <CheckIcon size={12} />
        </button>
        <button
          type="button"
          className="shrink-0 flex items-center justify-center rounded-(--radius-full) p-0.5 text-muted hover:bg-accent-tint-strong"
          title="Cancel"
          aria-label="Cancel"
          onClick={onCancel}
        >
          <CloseIcon size={12} />
        </button>
      </div>
      {error && (
        <p className="mt-1 px-1 text-(length:--text-2xs) text-danger">
          {error}
        </p>
      )}
      {suggestOpen && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-(--z-menu) max-h-[180px] overflow-auto p-1 bg-panel border border-border-strong rounded-(--radius-md) shadow-(--shadow-2)">
          {suggestions.map((s, i) => (
            <li
              key={s.kind === "book" ? `book-${s.book.id}` : `${s.kind}-${s.n}`}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlighted(i)}
                className={
                  "flex items-center justify-between w-full px-2 py-1.5 rounded-(--radius-sm) bg-transparent text-left hover:bg-accent-tint" +
                  (i === highlighted ? " bg-accent-tint" : "")
                }
              >
                {s.kind === "book" ? (
                  <>
                    <span className="font-(family-name:--font-mono) text-(length:--text-xs) text-ink">
                      {s.book.name}
                    </span>
                    <span className="font-(family-name:--font-mono) text-(length:--text-2xs) text-muted">
                      {s.book.abbr}
                    </span>
                  </>
                ) : (
                  <span className="font-(family-name:--font-mono) text-(length:--text-xs) text-ink">
                    {s.n}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
