// A note's summary content — title/preview, tag pills, anchors — shared by
// the sidebar drawer, the inline full-width bars list, and the card grid, so
// there's one definition of what a note "row" looks like.
import { formatModified, notePreview, type Note } from "./notes";

export function NoteRowContent({ note }: { note: Note }) {
  return (
    <>
      <span className="flex items-center gap-1.5 text-(length:--text-sm) font-medium text-ink">
        {note.color && (
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ background: note.color }}
          />
        )}
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {notePreview(note)}
        </span>
      </span>
      {note.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {note.tags.map((t) => (
            <span
              key={t}
              className="py-px px-1.5 rounded-full bg-accent-tint text-accent text-(length:--text-2xs)"
            >
              {t}
            </span>
          ))}
        </span>
      )}
      <span className="flex items-center gap-2 font-(family-name:--font-mono) text-(length:--text-xs) text-muted">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {note.anchors.join(" · ")}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          {formatModified(note.modified)}
        </span>
      </span>
    </>
  );
}
