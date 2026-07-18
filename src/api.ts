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

export interface SearchHit {
  verse_ref_id: number;
  book_id: number;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
  score: number; // bm25, lower = better
}

export const listBooks = () => invoke<Book[]>("list_books");
export const listTranslations = () =>
  invoke<Translation[]>("list_translations");
export const getChapter = (
  bookId: number,
  chapter: number,
  translation: string,
) => invoke<Verse[]>("get_chapter", { bookId, chapter, translation });
export const search = (query: string, translation?: string) =>
  invoke<SearchHit[]>("search", { query, translation });

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
