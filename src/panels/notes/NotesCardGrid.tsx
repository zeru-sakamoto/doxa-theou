// Card-grid layout for the full-width note list shown when no note is
// selected — an alternative to NotesDrawer's "inline" bars variant, sharing
// the same row content and click/ctrl-click semantics.
import type { MouseEvent, RefObject } from "react";
import type { Note } from "./notes";
import { NoteRowContent } from "./NoteRowContent";

interface Props {
  notes: Note[];
  onSelect: (note: Note, event: MouseEvent) => void;
  // Exposes the scrollable grid element so a caller (NotesPanel) can drive
  // it with arrow-key scrolling (useArrowScroll).
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function NotesCardGrid({ notes, onSelect, scrollRef }: Props) {
  if (notes.length === 0) {
    return <p className="panel__muted p-4">No notes match.</p>;
  }

  return (
    <div
      ref={scrollRef}
      className="columns-[240px] gap-3 p-3 overflow-y-auto overflow-x-hidden h-full"
    >
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          className="flex flex-col gap-2 min-w-0 w-full mb-3 p-4 text-left border border-border-strong rounded-(--radius-md) bg-panel transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint break-inside-avoid"
          onClick={(e) => onSelect(n, e)}
        >
          <NoteRowContent note={n} />
        </button>
      ))}
    </div>
  );
}
