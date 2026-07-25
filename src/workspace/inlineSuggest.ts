// Ghost-text completion for the search bars: given what's typed so far,
// find a book name or passage heading that starts with it and return the
// full string to complete to. Append-only (like a browser address bar) —
// once a chapter/verse number is typed after the book name there's nothing
// left to complete, so a *trailing* number bails out. A number can still be
// the start of a book's own name ("1 John", "2 Corinthians"), so this only
// rejects a number at the end of the string preceded by other text — same
// split CommandPalette's parseQuery/exactReference use for "Book Chapter".
import type { Book, HeadingSuggestion } from "../api";

const TRAILING_NUMBER = /(\d+)(?::(\d+))?\s*$/;

export function suggestCompletion(
  query: string,
  books: Book[],
  headings: HeadingSuggestion[],
): string | null {
  const q = query.trim();
  if (!q) return null;
  const trailing = q.match(TRAILING_NUMBER);
  if (trailing && trailing.index !== undefined && trailing.index > 0) {
    return null;
  }
  const ql = q.toLowerCase();

  // ponytail: first-match-in-canonical-order, not relevance-ranked — fine for
  // a ghost-text hint. Use the Cmd-K palette (parseQuery/scoreBook) if this
  // ever needs fuzzy ranking. Abbreviations aren't completed against here:
  // an abbr like "Jn" isn't a prefix of "John", so there's nothing valid to
  // append — only full book names are genuine completions of themselves.
  for (const b of books) {
    if (b.name.toLowerCase().startsWith(ql)) return b.name;
  }
  for (const h of headings) {
    if (h.heading.toLowerCase().startsWith(ql)) return h.heading;
  }
  return null;
}
