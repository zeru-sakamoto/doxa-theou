// Random/sequential passage & chapter selection + verse-text fetching for
// the typing-practice panel. No DB writes — reads via existing api.ts calls,
// remembers sequential position in localStorage (doxa-typing-seq-pos-*).
import {
  chapterCount,
  getChapter,
  type Book,
  type HeadingRange,
  type Testament,
} from "../../api";
import type { Reference } from "../../state/workspace";

export type TypingScope =
  | { kind: "all" }
  | { kind: "testament"; testament: Testament }
  | { kind: "book"; bookId: number };

export interface ChapterSelection {
  bookId: number;
  chapter: number;
}

export type VerseLength = "short" | "medium" | "long";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function matchesVerseLength(text: string, length: VerseLength): boolean {
  const n = wordCount(text);
  if (length === "short") return n <= 10;
  if (length === "long") return n > 20;
  return n > 10 && n <= 20; // medium
}

export interface VerseSelection {
  bookId: number;
  chapter: number;
  verse: number;
}

export interface PassageText {
  text: string;
  reference: Reference;
  label: string; // e.g. "John 3:16-21", for the info row
  heading?: string; // section heading, passage mode only
}

export function booksInScope(scope: TypingScope, books: Book[]): Book[] {
  switch (scope.kind) {
    case "all":
      return books;
    case "testament":
      return books.filter((b) => b.testament === scope.testament);
    case "book":
      return books.filter((b) => b.id === scope.bookId);
  }
}

function pickOne<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

export function pickRandomChapter(
  scope: TypingScope,
  books: Book[],
): ChapterSelection | null {
  const book = pickOne(booksInScope(scope, books));
  if (!book) return null;
  const chapter = 1 + Math.floor(Math.random() * chapterCount(book.id));
  return { bookId: book.id, chapter };
}

export function pickRandomPassage(
  ranges: HeadingRange[],
  scope: TypingScope,
  books: Book[],
): HeadingRange | null {
  const ids = new Set(booksInScope(scope, books).map((b) => b.id));
  return pickOne(ranges.filter((r) => ids.has(r.book_id)));
}

// Tries a bounded number of random chapters and picks a random verse
// matching the length bucket from whichever one has a match — cheap and
// reliable for any realistic scope/length combo. No exhaustive fallback:
// an empty result here means "try again" the same way an empty passage/
// chapter pool does, not a guarantee the scope truly has zero matches.
const RANDOM_VERSE_ATTEMPTS = 25;

export async function pickRandomVerse(
  scope: TypingScope,
  books: Book[],
  length: VerseLength,
  translation: string,
): Promise<VerseSelection | null> {
  for (let i = 0; i < RANDOM_VERSE_ATTEMPTS; i++) {
    const sel = pickRandomChapter(scope, books);
    if (!sel) return null; // no chapters at all in scope
    const verses = await getChapter(sel.bookId, sel.chapter, translation);
    const matches = verses.filter((v) => matchesVerseLength(v.text, length));
    if (matches.length) {
      const v = pickOne(matches)!;
      return { bookId: sel.bookId, chapter: sel.chapter, verse: v.verse };
    }
  }
  return null;
}

function orderedChapters(
  scope: TypingScope,
  books: Book[],
): ChapterSelection[] {
  const scoped = booksInScope(scope, books)
    .slice()
    .sort((a, b) => a.canonical_order - b.canonical_order);
  const list: ChapterSelection[] = [];
  for (const b of scoped) {
    for (let c = 1; c <= chapterCount(b.id); c++)
      list.push({ bookId: b.id, chapter: c });
  }
  return list;
}

function orderedPassages(
  ranges: HeadingRange[],
  scope: TypingScope,
  books: Book[],
): HeadingRange[] {
  // ranges arrive pre-sorted by (book_id, chapter, verse_start) from the
  // list_section_heading_ranges SQL query — filtering preserves that order.
  const ids = new Set(booksInScope(scope, books).map((b) => b.id));
  return ranges.filter((r) => ids.has(r.book_id));
}

const SEQ_CHAPTER_KEY = "doxa-typing-seq-pos-chapter";
const SEQ_PASSAGE_KEY = "doxa-typing-seq-pos-passage";

interface PassageSeqPos {
  bookId: number;
  chapter: number;
  verseStart: number;
}

function readSeqPos<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function nextSequentialChapter(
  scope: TypingScope,
  books: Book[],
): ChapterSelection | null {
  const list = orderedChapters(scope, books);
  if (!list.length) return null;
  const pos = readSeqPos<ChapterSelection>(SEQ_CHAPTER_KEY);
  const idx = pos
    ? list.findIndex(
        (c) => c.bookId === pos.bookId && c.chapter === pos.chapter,
      )
    : -1;
  return list[(idx + 1 + list.length) % list.length];
}

export function advanceSequentialChapter(sel: ChapterSelection): void {
  localStorage.setItem(SEQ_CHAPTER_KEY, JSON.stringify(sel));
}

export function nextSequentialPassage(
  ranges: HeadingRange[],
  scope: TypingScope,
  books: Book[],
): HeadingRange | null {
  const list = orderedPassages(ranges, scope, books);
  if (!list.length) return null;
  const pos = readSeqPos<PassageSeqPos>(SEQ_PASSAGE_KEY);
  const idx = pos
    ? list.findIndex(
        (r) =>
          r.book_id === pos.bookId &&
          r.chapter === pos.chapter &&
          r.verse_start === pos.verseStart,
      )
    : -1;
  return list[(idx + 1 + list.length) % list.length];
}

export function advanceSequentialPassage(range: HeadingRange): void {
  const pos: PassageSeqPos = {
    bookId: range.book_id,
    chapter: range.chapter,
    verseStart: range.verse_start,
  };
  localStorage.setItem(SEQ_PASSAGE_KEY, JSON.stringify(pos));
}

const SEQ_VERSE_KEY = "doxa-typing-seq-pos-verse";

interface VerseSeqPos {
  bookId: number;
  chapter: number;
  verse: number;
}

// Scans forward through every chapter in scope exactly once (plus a final
// re-check of the starting chapter's earlier verses, so it wraps around
// correctly even when scope is a single chapter) — unlike the random
// picker this must terminate with a definitive answer, not a probabilistic
// "try again", since Tab in sequential mode is expected to always advance.
export async function nextSequentialVerse(
  scope: TypingScope,
  books: Book[],
  translation: string,
): Promise<VerseSelection | null> {
  const chapters = orderedChapters(scope, books);
  if (!chapters.length) return null;
  const pos = readSeqPos<VerseSeqPos>(SEQ_VERSE_KEY);
  const startIdx = pos
    ? chapters.findIndex(
        (c) => c.bookId === pos.bookId && c.chapter === pos.chapter,
      )
    : -1;
  const anchorIdx = startIdx === -1 ? 0 : startIdx;
  const afterVerse = startIdx === -1 ? 0 : pos!.verse;

  for (let step = 0; step <= chapters.length; step++) {
    const idx = (anchorIdx + step) % chapters.length;
    const c = chapters[idx];
    const verses = await getChapter(c.bookId, c.chapter, translation);
    const candidates = verses.filter((v) => {
      if (step === 0) return v.verse > afterVerse;
      if (step === chapters.length) return v.verse <= afterVerse;
      return true;
    });
    if (candidates.length) {
      const v = candidates.reduce((a, b) => (a.verse < b.verse ? a : b));
      return { bookId: c.bookId, chapter: c.chapter, verse: v.verse };
    }
  }
  return null; // scanned the whole scope, no verses found
}

export function advanceSequentialVerse(sel: VerseSelection): void {
  localStorage.setItem(SEQ_VERSE_KEY, JSON.stringify(sel));
}

function bookName(bookId: number, books: Book[]): string {
  return books.find((b) => b.id === bookId)?.name ?? `Book ${bookId}`;
}

export async function fetchChapterText(
  sel: ChapterSelection,
  translation: string,
  books: Book[],
): Promise<PassageText> {
  const verses = await getChapter(sel.bookId, sel.chapter, translation);
  return {
    text: verses.map((v) => v.text).join(" "),
    reference: { bookId: sel.bookId, chapter: sel.chapter },
    label: `${bookName(sel.bookId, books)} ${sel.chapter}`,
  };
}

export async function fetchVerseText(
  sel: VerseSelection,
  translation: string,
  books: Book[],
): Promise<PassageText> {
  const verses = await getChapter(sel.bookId, sel.chapter, translation);
  const verse = verses.find((v) => v.verse === sel.verse);
  return {
    text: verse?.text ?? "",
    reference: { bookId: sel.bookId, chapter: sel.chapter, verse: sel.verse },
    label: `${bookName(sel.bookId, books)} ${sel.chapter}:${sel.verse}`,
  };
}

export async function fetchPassageText(
  range: HeadingRange,
  translation: string,
  books: Book[],
): Promise<PassageText> {
  const chapters: number[] = [];
  for (let c = range.chapter; c <= range.end_chapter; c++) chapters.push(c);
  const verseLists = await Promise.all(
    chapters.map((c) => getChapter(range.book_id, c, translation)),
  );
  const parts: string[] = [];
  verseLists.forEach((verses, i) => {
    const chapterNum = chapters[i];
    const lo = chapterNum === range.chapter ? range.verse_start : 1;
    const hi = chapterNum === range.end_chapter ? range.verse_end : Infinity;
    for (const v of verses) {
      if (v.verse >= lo && v.verse <= hi) parts.push(v.text);
    }
  });
  const name = bookName(range.book_id, books);
  const start = `${range.chapter}:${range.verse_start}`;
  const sameSpan =
    range.end_chapter === range.chapter &&
    range.verse_end === range.verse_start;
  const end =
    range.end_chapter === range.chapter
      ? `${range.verse_end}`
      : `${range.end_chapter}:${range.verse_end}`;
  return {
    text: parts.join(" "),
    reference: {
      bookId: range.book_id,
      chapter: range.chapter,
      verse: range.verse_start,
    },
    label: sameSpan ? `${name} ${start}` : `${name} ${start}-${end}`,
    heading: range.heading,
  };
}
