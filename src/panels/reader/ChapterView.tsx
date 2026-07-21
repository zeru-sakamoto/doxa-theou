// Renders one whole chapter — the Reader shows exactly one at a time, no
// continuous scroll, so there's no virtualization and no chapter divider to
// worry about. Verses are split into segments at passage-heading boundaries
// (buildSegments), same as before; this just maps over all of a chapter's
// segments directly instead of receiving one segment as a virtualized item.
import { useCallback, useMemo, type CSSProperties } from "react";
import type { SectionHeading, Verse } from "../../api";
import { useNotes } from "../../state/notes";
import { PassageHeading } from "./PassageHeading";

export interface Segment {
  key: string;
  heading?: string;
  verses: Verse[];
  isChapterStart: boolean;
}

// Splits a chapter's verses into segments at each heading's starting verse.
export function buildSegments(
  bookId: number,
  chapter: number,
  verses: Verse[],
  headingAt: Map<number, string>,
): Segment[] {
  const segs: Segment[] = [];
  for (const v of verses) {
    const heading = headingAt.get(v.verse);
    if (heading != null || segs.length === 0)
      segs.push({
        key: `${bookId}:${chapter}:${v.verse_ref_id}`,
        heading,
        verses: [v],
        isChapterStart: segs.length === 0,
      });
    else segs[segs.length - 1].verses.push(v);
  }
  return segs;
}

export function ChapterView({
  bookId,
  chapter,
  verses,
  headings,
  flowMode,
  flashVerse,
}: {
  bookId: number;
  chapter: number;
  verses: Verse[];
  headings: SectionHeading[];
  flowMode: "rows" | "paragraph";
  flashVerse?: number | null;
}) {
  const { anchorIndex } = useNotes();

  // Note anchors landing in this chapter → per-verse highlight washes.
  const highlights = useMemo(
    () => anchorIndex.get(`${bookId}:${chapter}`) ?? [],
    [anchorIndex, bookId, chapter],
  );

  const verseColors = useCallback(
    (verse: number): string[] => {
      const colors = new Set<string>();
      for (const h of highlights) {
        if (!h.color) continue;
        const start = h.verseStart ?? 1;
        const end = h.verseEnd ?? Number.MAX_SAFE_INTEGER;
        if (verse >= start && verse <= end) colors.add(h.color);
      }
      return [...colors];
    },
    [highlights],
  );

  const highlightStyle = useCallback(
    (verse: number): CSSProperties | undefined => {
      const list = verseColors(verse);
      if (list.length === 0) return undefined;
      const layers = list.map((c) => {
        const wash = `color-mix(in srgb, ${c} 42%, transparent)`;
        return `linear-gradient(${wash}, ${wash})`;
      });
      return {
        backgroundImage: layers.join(", "),
        backgroundBlendMode: list.length > 1 ? "multiply" : "normal",
        padding: "0.05em 0.3em",
        margin: "-0.05em -0.3em",
        borderRadius: "var(--radius-sm)",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      } as CSSProperties;
    },
    [verseColors],
  );

  const segments = useMemo(() => {
    const headingAt = new Map(
      headings
        .filter((h) => h.chapter === chapter)
        .map((h) => [h.verse_start, h.heading]),
    );
    return buildSegments(bookId, chapter, verses, headingAt);
  }, [bookId, chapter, verses, headings]);

  // Row mode only: within a segment, consecutive verses sharing a color are
  // grouped so the left bracket marker spans the whole run instead of
  // restarting per line.
  const colorGroups = useCallback(
    (list: Verse[]) => {
      const groups: { color?: string; verses: Verse[] }[] = [];
      for (const v of list) {
        const color = verseColors(v.verse)[0];
        const last = groups[groups.length - 1];
        if (last && last.color === color) last.verses.push(v);
        else groups.push({ color, verses: [v] });
      }
      return groups;
    },
    [verseColors],
  );

  if (flowMode === "rows") {
    return (
      <div className="py-4 px-6 max-w-[70ch] mx-auto font-(family-name:--font-serif) text-(length:--text-read) leading-(--lh-read) text-ink">
        {segments.map((seg, si) => (
          <div key={seg.key}>
            {seg.heading && (
              <PassageHeading
                text={seg.heading}
                className={si === 0 ? "mt-0" : "mt-8"}
              />
            )}
            {colorGroups(seg.verses).map((g, gi) => (
              <div
                key={gi}
                className={g.color ? "-ml-1.5 pl-1.5" : undefined}
                style={
                  g.color
                    ? { boxShadow: `inset 3px 0 0 ${g.color}` }
                    : undefined
                }
              >
                {g.verses.map((v) => (
                  <div
                    key={v.verse_ref_id}
                    data-book={bookId}
                    data-chapter={chapter}
                    data-verse={v.verse}
                    className={
                      "mb-[0.35em] scroll-mt-4 rounded-(--radius-sm)" +
                      (v.verse === flashVerse ? " verse-flash" : "")
                    }
                  >
                    <sup className="font-(family-name:--font-mono) text-[0.72em] font-medium text-accent align-super mr-[0.4em]">
                      {v.verse}
                    </sup>
                    <span style={highlightStyle(v.verse)}>{v.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="py-4 px-6 max-w-[70ch] mx-auto">
      {segments.map((seg, si) => (
        <div key={seg.key}>
          {seg.heading && (
            <PassageHeading
              text={seg.heading}
              className={si === 0 ? "mt-0" : "mt-8"}
            />
          )}
          <p className="m-0 font-(family-name:--font-serif) text-(length:--text-read) leading-(--lh-read) text-ink">
            {seg.verses.map((v) => (
              <span
                key={v.verse_ref_id}
                data-book={bookId}
                data-chapter={chapter}
                data-verse={v.verse}
                className={
                  "scroll-mt-4 rounded-(--radius-sm)" +
                  (v.verse === flashVerse ? " verse-flash" : "")
                }
              >
                <sup className="font-(family-name:--font-mono) text-[0.72em] font-medium text-accent align-super mr-[0.3em]">
                  {v.verse}
                </sup>
                <span style={highlightStyle(v.verse)}>{v.text} </span>
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  );
}
