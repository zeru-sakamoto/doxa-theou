// Notes are Markdown files on disk with YAML-ish frontmatter (see product
// doc). These sample notes stand in for the real store, which will read
// from disk + a SQLite index (see DESIGN.md) once that lands.
export interface Note {
  id: string;
  title: string;
  tags: string[];
  anchors: string[];
  created: string;
  modified: string;
  body: string;
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
