// Per-note notebook picker for the Notes header — assigns the selected note
// to a single notebook (frontmatter's `notebook`, distinct from the
// multi-valued `tags`). Notebooks aren't tracked separately: the option list
// is just the distinct non-empty `notebook` values across existing notes,
// same derivation as NotesPanel's `allTags`. Modeled on NotesFilterMenu's
// trigger + outside-click/Escape popover shell — the body (single-select
// rows + an inline create-input) isn't a flat action list, so
// workspace/Menu isn't reusable.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import { NotebookIcon, ICON } from "../../workspace/icons";
import { useMenuAlign } from "../../workspace/useMenuAlign";

interface Props {
  notebooks: string[];
  value: string;
  onChange: (notebook: string) => void;
}

export function NotebookMenu({ notebooks, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useMenuAlign(open, listRef);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(notebook: string) {
    onChange(notebook);
    setDraft("");
    setOpen(false);
  }

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={
          "btn-ghost h-[26px] gap-1.5 px-2" +
          (open ? " bg-accent-tint text-accent" : " text-muted")
        }
        title="Notebook"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <NotebookIcon size={ICON.md} />
        <span className="hidden @[420px]:inline font-(family-name:--font-mono) text-(length:--text-xs) max-w-[160px] truncate">
          {value || "Uncategorized"}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className="menu__list menu__list--right flex flex-col gap-1 min-w-[220px] max-w-[320px] p-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: DUR_FAST }}
          >
            <div className="flex flex-col gap-1 max-h-[220px] overflow-auto">
              <button
                type="button"
                className={
                  "w-full text-left truncate py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                  (!value
                    ? " bg-accent border-accent text-on-accent"
                    : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                }
                onClick={() => pick("")}
              >
                Uncategorized
              </button>
              {notebooks.map((nb) => (
                <button
                  key={nb}
                  type="button"
                  className={
                    "w-full text-left truncate py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                    (value === nb
                      ? " bg-accent border-accent text-on-accent"
                      : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                  }
                  onClick={() => pick(nb)}
                >
                  {nb}
                </button>
              ))}
            </div>
            <input
              className="input text-(length:--text-xs)"
              value={draft}
              placeholder="+ New notebook…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) pick(draft.trim());
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
