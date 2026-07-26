// In-panel note list, sorted by most-recently-modified. Two variants:
// "sidebar" (default) is a persistent collapsible column next to an open
// note — unlike reader/TocDrawer (an ephemeral overlay), the note body
// reflows around it when toggled. "inline" is the full-width list shown in
// place of the editor when no note is selected yet.
import { motion, useReducedMotion } from "motion/react";
import { DRAWER_SPRING } from "../../motion";
import type { MouseEvent, RefObject } from "react";
import type { Note } from "./notes";
import { NoteRowContent } from "./NoteRowContent";

// Matches --drawer-width in tokens.css.
const SIDEBAR_WIDTH = 244;

interface Props {
  variant?: "sidebar" | "inline";
  open?: boolean;
  notes: Note[];
  onSelect: (note: Note, event: MouseEvent) => void;
  // Exposes the scrollable list element so a caller (NotesPanel) can drive
  // it with arrow-key scrolling (useArrowScroll).
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function NotesDrawer({
  variant = "sidebar",
  open = true,
  notes,
  onSelect,
  scrollRef,
}: Props) {
  const reduce = useReducedMotion();

  const list =
    notes.length === 0 ? (
      <p className="panel__muted">No notes match.</p>
    ) : (
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className="flex flex-col gap-1 w-full p-2 mb-0.5 border-0 border-l-2 border-l-transparent rounded-(--radius-sm) bg-transparent text-left hover:bg-accent-tint hover:border-l-accent"
              onClick={(e) => onSelect(n, e)}
            >
              <NoteRowContent note={n} />
            </button>
          </li>
        ))}
      </ul>
    );

  if (variant === "inline") {
    return (
      <div ref={scrollRef} className="flex-1 h-full overflow-auto p-2">
        {list}
      </div>
    );
  }

  return (
    <motion.aside
      className="overflow-hidden shrink-0"
      aria-label="Notes"
      aria-hidden={!open}
      initial={false}
      animate={{ width: open ? SIDEBAR_WIDTH : 0 }}
      transition={reduce ? { duration: 0 } : DRAWER_SPRING}
    >
      <div
        ref={scrollRef}
        className="w-[244px] h-full overflow-auto p-2 border-r border-border bg-panel"
      >
        {list}
      </div>
    </motion.aside>
  );
}
