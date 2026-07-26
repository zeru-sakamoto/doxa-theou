// A note's summary content — title/preview, tag pills, anchors — shared by
// the sidebar drawer, the inline full-width bars list, and the card grid, so
// there's one definition of what a note "row" looks like.
import { notePreview, type Note } from "./notes";

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
      <span className="font-(family-name:--font-mono) text-(length:--text-xs) text-muted whitespace-nowrap overflow-hidden text-ellipsis">
        {note.anchors.join(" · ")}
      </span>
    </>
  );
}
