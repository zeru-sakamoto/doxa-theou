// In-panel note list sidebar: cards sorted by most-recently-modified.
// Unlike reader/TocDrawer (an ephemeral overlay), this is a persistent
// collapsible column — the note body reflows around it when toggled.
import { motion, useReducedMotion } from "motion/react";
import type { Note } from "./notes";

// Matches --drawer-width in tokens.css.
const SIDEBAR_WIDTH = 244;

interface Props {
  open: boolean;
  notes: Note[];
  onSelect: (note: Note) => void;
}

export function NotesDrawer({ open, notes, onSelect }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.aside
      className="notes__sidebar"
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
      <div className="notes__sidebar__inner">
        {notes.length === 0 ? (
          <p className="panel__muted">No notes match.</p>
        ) : (
          <ul className="notecards">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="notecard"
                  onClick={() => onSelect(n)}
                >
                  <span className="notecard__title">{n.title}</span>
                  {n.tags.length > 0 && (
                    <span className="notecard__tags">
                      {n.tags.map((t) => (
                        <span key={t} className="notecard__tag">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="notecard__preview">
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
