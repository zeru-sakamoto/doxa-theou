// Standalone check, not part of the app build — run with:
//   node src/workspace/inlineSuggest.selfcheck.ts
import assert from "node:assert/strict";
import { suggestCompletion } from "./inlineSuggest.ts";
import type { Book, HeadingSuggestion } from "../api.ts";

const books = [
  { id: 1, testament: "OT", name: "Genesis", abbr: "Gen", canonical_order: 1 },
  { id: 43, testament: "NT", name: "John", abbr: "Jn", canonical_order: 43 },
  {
    id: 62,
    testament: "NT",
    name: "1 John",
    abbr: "1Jn",
    canonical_order: 62,
  },
  {
    id: 46,
    testament: "NT",
    name: "1 Corinthians",
    abbr: "1Cor",
    canonical_order: 46,
  },
] as Book[];

const headings = [
  { book_id: 42, chapter: 15, verse_start: 11, heading: "The Prodigal Son" },
] as HeadingSuggestion[];

// Prefix of a book name completes to the full name.
assert.equal(suggestCompletion("Gen", books, headings), "Genesis");
assert.equal(suggestCompletion("Jo", books, headings), "John");

// A leading digit that's part of the book's own name still completes —
// only a *trailing* chapter/verse number should block completion.
assert.equal(suggestCompletion("1 J", books, headings), "1 John");
assert.equal(suggestCompletion("1", books, headings), "1 John");
assert.equal(suggestCompletion("1 Corinthians 3", books, headings), null);

// A book abbreviation isn't a prefix of the full name, so it's left alone.
assert.equal(suggestCompletion("Jn", books, headings), null);

// Prefix of a passage heading completes to the full title.
assert.equal(
  suggestCompletion("The Prod", books, headings),
  "The Prodigal Son",
);

// Once a chapter/verse digit is typed, there's nothing left to complete.
assert.equal(suggestCompletion("John 3", books, headings), null);

// No match, or empty query.
assert.equal(suggestCompletion("Xyz", books, headings), null);
assert.equal(suggestCompletion("   ", books, headings), null);

console.log("inlineSuggest self-check passed");
