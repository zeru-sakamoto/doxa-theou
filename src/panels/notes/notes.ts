// Frontend-only notes helpers. The Note type, disk I/O, and the SQLite index
// now live in the backend (src-tauri/src/notes.rs, wrapped in api.ts); what's
// left here is UI-side: the list preview, the highlight palette, and anchor
// parsing (shared by the Reader's highlight index and the anchor rows).
import type { Book, Note } from "../../api";

export type { Note };

// Notes highlight palette: 7 hues evenly spaced around the accent's own hue
// (indigo, the primary), so every alternative harmonizes with it by
// construction. Values are CSS vars, not hex, so a saved selection stays
// legible when the user flips light/dark (see tokens.css). Shared by
// SettingsPanel's default highlight picker and NotesColorMenu's per-note
// color picker.
export interface Swatch {
  name: string;
  var: string;
}

// Koine Ink — the 7 hues that harmonize with the indigo accent (see tokens).
export const NOTES_HIGHLIGHT_SWATCHES: Swatch[] = [
  { name: "Indigo", var: "--highlight-indigo" },
  { name: "Violet", var: "--highlight-violet" },
  { name: "Rose", var: "--highlight-rose" },
  { name: "Amber", var: "--highlight-amber" },
  { name: "Lime", var: "--highlight-lime" },
  { name: "Green", var: "--highlight-green" },
  { name: "Teal", var: "--highlight-teal" },
];

// Selectable anchor-highlight palettes (tokens in tokens.css). The chosen
// palette drives the swatches offered for a note's color and the editor's
// default highlight; existing notes keep whatever color var they were given,
// so switching palette never recolors old highlights (Logos-style).
export type PaletteId = "koine" | "manuscript" | "vivid";

export interface Palette {
  id: PaletteId;
  name: string;
  swatches: Swatch[];
}

export const HIGHLIGHT_PALETTES: Palette[] = [
  { id: "koine", name: "Koine Ink", swatches: NOTES_HIGHLIGHT_SWATCHES },
  {
    id: "manuscript",
    name: "Manuscript",
    swatches: [
      { name: "Gold", var: "--highlight-gold" },
      { name: "Sage", var: "--highlight-sage" },
      { name: "Mauve", var: "--highlight-mauve" },
      { name: "Clay", var: "--highlight-clay" },
      { name: "Moss", var: "--highlight-moss" },
      { name: "Slate", var: "--highlight-slate" },
    ],
  },
  {
    id: "vivid",
    name: "Vivid",
    swatches: [
      { name: "Yellow", var: "--highlight-yellow" },
      { name: "Grass", var: "--highlight-grass" },
      { name: "Pink", var: "--highlight-pink" },
      { name: "Sky", var: "--highlight-sky" },
      { name: "Orange", var: "--highlight-orange" },
      { name: "Purple", var: "--highlight-purple" },
    ],
  },
];

export const paletteById = (id: string): Palette =>
  HIGHLIGHT_PALETTES.find((p) => p.id === id) ?? HIGHLIGHT_PALETTES[0];

// Crude line-prefix strip instead of a Markdown parser — this is
// only ever shown as a truncated list-card preview, never rendered as HTML.
function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(#{1,6}|[-*+>]|`{1,3})\s*/, ""))
    .join(" ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function notePreview(note: Note): string {
  const title = note.title.trim();
  if (title) return title;
  const preview = stripMarkdown(note.body);
  return preview.length > 80 ? preview.slice(0, 80) + "…" : preview;
}

// A resolved anchor: "BookName Chapter[:Verse[-Verse]]" -> ids. A bare chapter
// leaves verse bounds undefined (whole-chapter anchor); a single verse has
// verseStart === verseEnd. Lifted out of NotesAnchorBar so the Reader's
// highlight index and the anchor rows share one parser (mirrors the Rust
// resolve_anchor used to build the SQLite index).
export interface AnchorRef {
  bookId: number;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

export function parseAnchor(anchor: string, books: Book[]): AnchorRef | null {
  const book = books.find((b) =>
    anchor.toLowerCase().startsWith(b.name.toLowerCase() + " "),
  );
  if (!book) return null;
  const rest = anchor.slice(book.name.length).trim();
  const m = rest.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  return {
    bookId: book.id,
    chapter: parseInt(m[1], 10),
    verseStart: m[2] ? parseInt(m[2], 10) : undefined,
    verseEnd: m[3] ? parseInt(m[3], 10) : m[2] ? parseInt(m[2], 10) : undefined,
  };
}
