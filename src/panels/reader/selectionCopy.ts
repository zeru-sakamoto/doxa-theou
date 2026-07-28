// Pure string-formatting for the Reader's selection toolbar (Copy / Copy
// Blockquote). No DOM/React here — SelectionToolbar.tsx owns figuring out
// which verses a selection touched; these just render that Verse[] to text.
import type { Verse } from "../../api";

function formatRefRange(
  bookName: string,
  chapter: number,
  start: number,
  end: number,
  dash: string,
): string {
  const base = `${bookName} ${chapter}:${start}`;
  return start === end ? base : `${base}${dash}${end}`;
}

export function buildPlainCopy(
  bookName: string,
  chapter: number,
  verses: Verse[],
): string {
  const ref = formatRefRange(
    bookName,
    chapter,
    verses[0].verse,
    verses[verses.length - 1].verse,
    "-",
  );
  const body = verses.map((v) => `${v.verse} ${v.text}`).join("\n");
  return `**${ref}**\n${body}`;
}

export function buildReferenceCopy(
  bookName: string,
  chapter: number,
  verses: Verse[],
): string {
  return formatRefRange(
    bookName,
    chapter,
    verses[0].verse,
    verses[verses.length - 1].verse,
    "-",
  );
}

export function buildBlockquoteCopy(
  bookName: string,
  chapter: number,
  verses: Verse[],
): string {
  const ref = formatRefRange(
    bookName,
    chapter,
    verses[0].verse,
    verses[verses.length - 1].verse,
    "–", // en dash
  );
  const body = verses.map((v) => `> **\`${v.verse}\`** ${v.text}`).join("\n");
  return `## ${ref}\n${body}`;
}

// ponytail: no frontend test runner in this repo — dev-only self-check
// against the exact fixture from example.md instead of a real test file.
if (import.meta.env.DEV) {
  const fixture: Verse[] = [
    {
      verse_ref_id: 1,
      chapter: 10,
      verse: 5,
      text: "For Moses writes about the righteousness that is based on the law, that the person who does the commandments shall live by them.",
    },
    {
      verse_ref_id: 2,
      chapter: 10,
      verse: 6,
      text: "But the righteousness based on faith says, “Do not say in your heart, ‘Who will ascend into heaven?’” (that is, to bring Christ down)",
    },
    {
      verse_ref_id: 3,
      chapter: 10,
      verse: 7,
      text: "“or ‘Who will descend into the abyss?’” (that is, to bring Christ up from the dead).",
    },
  ];
  console.assert(
    buildPlainCopy("Romans", 10, fixture) ===
      "**Romans 10:5-7**\n" +
        "5 For Moses writes about the righteousness that is based on the law, that the person who does the commandments shall live by them.\n" +
        "6 But the righteousness based on faith says, “Do not say in your heart, ‘Who will ascend into heaven?’” (that is, to bring Christ down)\n" +
        "7 “or ‘Who will descend into the abyss?’” (that is, to bring Christ up from the dead).",
    "selectionCopy: buildPlainCopy mismatch",
  );
  console.assert(
    buildBlockquoteCopy("Romans", 10, fixture).startsWith(
      "## Romans 10:5–7\n> **`5`** For Moses",
    ),
    "selectionCopy: buildBlockquoteCopy mismatch",
  );
  console.assert(
    buildPlainCopy("Romans", 10, [fixture[0]]).startsWith("**Romans 10:5**\n"),
    "selectionCopy: single-verse range should omit the dash",
  );
  console.assert(
    buildReferenceCopy("Romans", 10, fixture) === "Romans 10:5-7",
    "selectionCopy: buildReferenceCopy mismatch",
  );
  console.assert(
    buildReferenceCopy("Romans", 10, [fixture[0]]) === "Romans 10:5",
    "selectionCopy: buildReferenceCopy single-verse mismatch",
  );
}
