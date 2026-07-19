// Notes are Markdown files on disk with YAML-ish frontmatter (see product
// doc). These sample notes stand in for the real store, which will read
// from disk + a SQLite index (see DESIGN.md) once that lands.
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

// Notes highlight palette: 7 hues evenly spaced around the accent's own hue
// (indigo, the primary), so every alternative harmonizes with it by
// construction. Values are CSS vars, not hex, so a saved selection stays
// legible when the user flips light/dark (see tokens.css). Shared by
// SettingsPanel's default highlight picker and NotesColorMenu's per-note
// color picker.
export const NOTES_HIGHLIGHT_SWATCHES = [
  { name: "Indigo", var: "--highlight-indigo" },
  { name: "Violet", var: "--highlight-violet" },
  { name: "Rose", var: "--highlight-rose" },
  { name: "Amber", var: "--highlight-amber" },
  { name: "Lime", var: "--highlight-lime" },
  { name: "Green", var: "--highlight-green" },
  { name: "Teal", var: "--highlight-teal" },
];

// ponytail: crude line-prefix strip instead of a Markdown parser — this is
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

function parseValue(raw: string): string | string[] {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v;
}

// ponytail: hand-rolled `key: value` / `[a, b]` frontmatter parser instead of
// a YAML dependency — the sample notes only ever use flat scalars and lists.
export function parseNote(raw: string): Note {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("Note is missing frontmatter");
  const [, frontmatter, body] = match;
  const data: Record<string, string | string[]> = {};
  for (const line of frontmatter.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    data[line.slice(0, i).trim()] = parseValue(line.slice(i + 1));
  }
  return {
    id: data.id as string,
    title: data.title as string,
    tags: (data.tags as string[]) ?? [],
    anchors: (data.anchors as string[]) ?? [],
    color: data.color as string | undefined,
    created: data.created as string,
    modified: data.modified as string,
    body: body.trim(),
  };
}

export function loadNotes(): Note[] {
  const files = import.meta.glob("./sample/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>;
  return Object.values(files).map(parseNote);
}
