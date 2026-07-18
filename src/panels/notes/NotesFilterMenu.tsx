// Filter popover for the Notes header: by tag (free text) or by book
// (multi-select). Modeled on workspace/Menu's trigger + outside-click/Escape
// shell, but Menu only renders a flat action list — this needs a custom
// body (text input / button grid), so it isn't reused directly.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Book } from "../../api";
import { FilterIcon } from "../../workspace/icons";

interface Props {
  tagQuery: string;
  onTagQueryChange: (v: string) => void;
  books: Book[];
  selectedBookIds: Set<number>;
  onToggleBook: (id: number) => void;
}

export function NotesFilterMenu({
  tagQuery,
  onTagQueryChange,
  books,
  selectedBookIds,
  onToggleBook,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"tags" | "books">("tags");
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

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

  const active = tagQuery.trim() !== "" || selectedBookIds.size > 0;

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={"iconbtn" + (active ? " is-active" : "")}
        title="Filter notes"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <FilterIcon size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu__list menu__list--right filterpopover"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <div
              className="seg filterpopover__seg"
              role="group"
              aria-label="Filter mode"
            >
              <button
                type="button"
                className={"seg__btn" + (mode === "tags" ? " is-on" : "")}
                onClick={() => setMode("tags")}
              >
                Tags
              </button>
              <button
                type="button"
                className={"seg__btn" + (mode === "books" ? " is-on" : "")}
                onClick={() => setMode("books")}
              >
                Books
              </button>
            </div>
            {mode === "tags" ? (
              <input
                className="input filterpopover__taginput"
                value={tagQuery}
                placeholder="Filter by tag…"
                onChange={(e) => onTagQueryChange(e.target.value)}
                autoFocus
              />
            ) : (
              <div className="filterpopover__books">
                {(
                  [
                    [
                      "Old Testament",
                      books.filter((b) => b.testament === "OT"),
                    ],
                    [
                      "New Testament",
                      books.filter((b) => b.testament === "NT"),
                    ],
                  ] as Array<[string, Book[]]>
                ).map(([label, list]) => (
                  <section key={label} className="filterpopover__group">
                    <h4 className="filterpopover__grouphead">{label}</h4>
                    <div className="filterpopover__bookgrid">
                      {list.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          className={
                            "filterchip" +
                            (selectedBookIds.has(b.id) ? " is-active" : "")
                          }
                          onClick={() => onToggleBook(b.id)}
                        >
                          {b.abbr}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
