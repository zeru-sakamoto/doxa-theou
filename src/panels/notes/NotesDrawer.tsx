// In-panel note list sidebar: cards sorted by most-recently-modified.
// Unlike reader/TocDrawer (an ephemeral overlay), this is a persistent
// collapsible column — the note body reflows around it when toggled.
import { motion, useReducedMotion } from "motion/react";
import type { MouseEvent } from "react";
import { notePreview, type Note } from "./notes";

// Matches --drawer-width in tokens.css.
const SIDEBAR_WIDTH = 244;

interface Props {
  open: boolean;
  notes: Note[];
  onSelect: (note: Note, event: MouseEvent) => void;
}

export function NotesDrawer({ open, notes, onSelect }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.aside
      className="overflow-hidden shrink-0"
      aria-label="Notes"
      aria-hidden={!open}
      initial={false}
      animate={{ width: open ? SIDEBAR_WIDTH : 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 520, damping: 44 }
      }
    >
      <div className="w-[244px] h-full overflow-auto p-2 border-r border-border bg-panel">
        {notes.length === 0 ? (
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
                  <span className="flex items-center gap-1.5 text-(length:--text-sm) font-medium text-ink">
                    {n.color && (
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ background: n.color }}
                      />
                    )}
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {notePreview(n)}
                    </span>
                  </span>
                  {n.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {n.tags.map((t) => (
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
                    {n.anchors.join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.aside>
  );
}
