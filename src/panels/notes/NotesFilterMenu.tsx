// Filter popover for the Notes header: by tag or by book, both
// multi-select. Modeled on workspace/Menu's trigger + outside-click/Escape
// shell, but Menu only renders a flat action list — this needs a custom
// body (button list/grid), so it isn't reused directly.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import type { Book } from "../../api";
import { FilterIcon, ICON } from "../../workspace/icons";
import { useMenuAlign } from "../../workspace/useMenuAlign";

interface Props {
  tags: string[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  books: Book[];
  selectedBookIds: Set<number>;
  onToggleBook: (id: number) => void;
  notebooks: string[];
  selectedNotebooks: Set<string>;
  onToggleNotebook: (notebook: string) => void;
  onClear: () => void;
}

export function NotesFilterMenu({
  tags,
  selectedTags,
  onToggleTag,
  books,
  selectedBookIds,
  onToggleBook,
  notebooks,
  selectedNotebooks,
  onToggleNotebook,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"tags" | "books" | "notebooks">("tags");
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

  const active =
    selectedTags.size > 0 ||
    selectedBookIds.size > 0 ||
    selectedNotebooks.size > 0;

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
        <FilterIcon size={ICON.md} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className="menu__list menu__list--left flex flex-col gap-2 w-[260px] p-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: DUR_FAST }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="seg" role="group" aria-label="Filter mode">
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
                <button
                  type="button"
                  className={
                    "seg__btn" + (mode === "notebooks" ? " is-on" : "")
                  }
                  onClick={() => setMode("notebooks")}
                >
                  Notebooks
                </button>
              </div>
              <button
                type="button"
                disabled={!active}
                className="font-(family-name:--font-mono) text-(length:--text-2xs) text-muted hover:text-accent disabled:opacity-40 disabled:hover:text-muted"
                onClick={onClear}
              >
                Clear
              </button>
            </div>
            {mode === "tags" ? (
              <div className="flex flex-col gap-1 max-h-[260px] overflow-auto">
                {tags.length === 0 ? (
                  <p className="panel__muted">No tags yet.</p>
                ) : (
                  tags.map((t) => {
                    const active = selectedTags.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        className={
                          "w-full text-left py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                          (active
                            ? " bg-accent border-accent text-on-accent"
                            : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                        }
                        onClick={() => onToggleTag(t)}
                      >
                        {t}
                      </button>
                    );
                  })
                )}
              </div>
            ) : mode === "notebooks" ? (
              <div className="flex flex-col gap-1 max-h-[260px] overflow-auto">
                <button
                  type="button"
                  className={
                    "w-full text-left truncate py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                    (selectedNotebooks.has("")
                      ? " bg-accent border-accent text-on-accent"
                      : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                  }
                  onClick={() => onToggleNotebook("")}
                >
                  Uncategorized
                </button>
                {notebooks.map((nb) => {
                  const active = selectedNotebooks.has(nb);
                  return (
                    <button
                      key={nb}
                      type="button"
                      className={
                        "w-full text-left truncate py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                        (active
                          ? " bg-accent border-accent text-on-accent"
                          : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                      }
                      onClick={() => onToggleNotebook(nb)}
                    >
                      {nb}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="max-h-[260px] overflow-auto">
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
                  <section key={label} className="[&+&]:mt-3">
                    <h4 className="mb-1 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                      {label}
                    </h4>
                    <div className="grid grid-cols-3 gap-1">
                      {list.map((b) => {
                        const active = selectedBookIds.has(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            className={
                              "py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                              (active
                                ? " bg-accent border-accent text-on-accent"
                                : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                            }
                            onClick={() => onToggleBook(b.id)}
                          >
                            {b.abbr}
                          </button>
                        );
                      })}
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
