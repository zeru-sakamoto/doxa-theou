// Typed wrappers over the Rust #[tauri::command] surface (see src-tauri/src/db.rs).
// Tauri maps camelCase JS args -> snake_case Rust params.
import { invoke } from "@tauri-apps/api/core";

export type Testament = "OT" | "NT";

export interface Book {
  id: number; // = canonical_order = source book number (1..66)
  testament: Testament;
  name: string;
  abbr: string;
  canonical_order: number;
}

export interface Translation {
  id: number;
  code: string; // 'ESV', 'NASB', ...
  name: string;
  license: string;
  is_default: boolean;
}

export interface Verse {
  verse_ref_id: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface SectionHeading {
  chapter: number;
  verse_start: number;
  end_chapter: number;
  verse_end: number;
  heading: string;
}

export interface SearchHit {
  verse_ref_id: number;
  book_id: number;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
  score: number; // bm25, lower = better
}

// A note: Markdown-on-disk (frontmatter) mirrored by these fields. Disk I/O
// and the SQLite index live in Rust (src-tauri/src/notes.rs); this is the DTO.
export interface Note {
  id: string;
  title: string;
  tags: string[];
  anchors: string[];
  color?: string;
  created: string;
  modified: string;
  body: string;
}

// Read side of the notes index — anchors landing in a chapter.
export interface ChapterNote {
  note_id: string;
  title: string;
  color?: string;
  verse_start?: number;
  verse_end?: number;
}

export const listBooks = () => invoke<Book[]>("list_books");
export const listTranslations = () =>
  invoke<Translation[]>("list_translations");
export const search = (query: string, translation?: string) =>
  invoke<SearchHit[]>("search", { query, translation });

// ponytail: bounded FIFO cache over get_chapter — one chapter is a few KB, so
// keeping the last two dozen makes Reader back/forth and anchor previews free
// (no IPC/SQLite round-trip) at near-zero memory. Insertion order = eviction
// order (Map keeps it). Verse text is immutable, so entries never go stale.
const chapterCache = new Map<string, Verse[]>();
const CHAPTER_CACHE_MAX = 24;

export const getChapter = async (
  bookId: number,
  chapter: number,
  translation: string,
): Promise<Verse[]> => {
  const key = `${bookId}:${chapter}:${translation}`;
  const cached = chapterCache.get(key);
  if (cached) return cached;
  const verses = await invoke<Verse[]>("get_chapter", {
    bookId,
    chapter,
    translation,
  });
  chapterCache.set(key, verses);
  if (chapterCache.size > CHAPTER_CACHE_MAX) {
    const oldest = chapterCache.keys().next().value;
    if (oldest !== undefined) chapterCache.delete(oldest);
  }
  return verses;
};

// ponytail: same bounded-cache shape as chapterCache — headings are immutable
// per (book, chapter, translation) too, just a separate table/query on the Rust side.
const headingsCache = new Map<string, SectionHeading[]>();

export const sectionHeadingsForChapter = async (
  bookId: number,
  chapter: number,
  translation: string,
): Promise<SectionHeading[]> => {
  const key = `${bookId}:${chapter}:${translation}`;
  const cached = headingsCache.get(key);
  if (cached) return cached;
  const headings = await invoke<SectionHeading[]>(
    "section_headings_for_chapter",
    { bookId, chapter, translation },
  );
  headingsCache.set(key, headings);
  if (headingsCache.size > CHAPTER_CACHE_MAX) {
    const oldest = headingsCache.keys().next().value;
    if (oldest !== undefined) headingsCache.delete(oldest);
  }
  return headings;
};

// Notes: folder null → Rust uses the default app-local-data/notes dir.
export const loadNotes = (folder: string | null) =>
  invoke<Note[]>("load_notes", { folder });
export const saveNote = (note: Note, folder: string | null) =>
  invoke<void>("save_note", { note, folder });
export const deleteNote = (id: string, folder: string | null) =>
  invoke<void>("delete_note", { id, folder });
export const notesForChapter = (bookId: number, chapter: number) =>
  invoke<ChapterNote[]>("notes_for_chapter", { bookId, chapter });

// ponytail: canonical chapter counts for the 66-book Protestant canon, indexed
// by book id (1..66). Fixed across the imported translations (ESV/NASB/NKJV/AMP/
// NIV) — no backend query needed. If a version's versification ever differs,
// add a max(chapter) command in db.rs and load counts from it instead.
const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1,
  22,
];

export const chapterCount = (bookId: number): number =>
  CHAPTER_COUNTS[bookId - 1] ?? 1;
