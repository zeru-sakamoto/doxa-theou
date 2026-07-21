// In-panel Table of Contents drawer: book accordion -> chapter grid.
// Slides in over the Reader body. Navigation home #2 (with Cmd-K being #1).
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DRAWER_SPRING, DUR_FAST } from "../../motion";
import { type Book, chapterCount } from "../../api";
import { ChevronRightIcon, ICON } from "../../workspace/icons";

interface Props {
  open: boolean;
  books: Book[];
  currentBookId: number;
  currentChapter: number;
  onNavigate: (bookId: number, chapter: number) => void;
  onClose: () => void;
}

export function TocDrawer({
  open,
  books,
  currentBookId,
  currentChapter,
  onNavigate,
  onClose,
}: Props) {
  const [expanded, setExpanded] = useState(currentBookId);
  const reduce = useReducedMotion();

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { x: "-100%" },
        animate: { x: 0 },
        exit: { x: "-100%" },
        transition: DRAWER_SPRING,
      };

  const groups: Array<[string, Book[]]> = [
    ["Old Testament", books.filter((b) => b.testament === "OT")],
    ["New Testament", books.filter((b) => b.testament === "NT")],
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute top-[30px] inset-x-0 bottom-0 bg-(--drawer-scrim) z-[calc(var(--z-drawer)-1)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR_FAST }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute top-[30px] bottom-0 left-0 w-(--drawer-width) flex bg-panel border-r border-border shadow-(--shadow-2) z-(--z-drawer)"
            aria-label="Table of contents"
            {...slide}
          >
            <div className="flex-1 overflow-auto p-2">
              {groups.map(([label, list]) => (
                <section key={label} className="[&+&]:mt-3">
                  <h3 className="mb-1 px-2 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                    {label}
                  </h3>
                  <ul>
                    {list.map((b) => {
                      const isOpen = expanded === b.id;
                      const isCurrentBook = b.id === currentBookId;
                      return (
                        <li key={b.id}>
                          <button
                            className={
                              "flex items-center gap-1 w-full py-1 px-2 border-0 rounded-(--radius-sm) bg-transparent text-(length:--text-sm) text-left hover:bg-accent-tint" +
                              (isCurrentBook
                                ? " text-accent font-medium"
                                : " text-ink")
                            }
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? -1 : b.id)}
                          >
                            <span
                              className={
                                "inline-flex text-muted transition-transform duration-(--dur-fast) ease-(--ease-standard)" +
                                (isOpen ? " rotate-90" : "")
                              }
                            >
                              <ChevronRightIcon size={ICON.sm} />
                            </span>
                            <span>{b.name}</span>
                          </button>
                          {isOpen && (
                            <div
                              className="grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-1 pt-1 pr-2 pb-2 pl-[22px]"
                              role="group"
                              aria-label={`${b.name} chapters`}
                            >
                              {Array.from(
                                { length: chapterCount(b.id) },
                                (_, i) => i + 1,
                              ).map((c) => {
                                const isCurrentChip =
                                  isCurrentBook && c === currentChapter;
                                return (
                                  <button
                                    key={c}
                                    className={
                                      "inline-flex items-center justify-center aspect-square border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                                      (isCurrentChip
                                        ? " bg-accent border-accent text-on-accent"
                                        : " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint")
                                    }
                                    onClick={() => onNavigate(b.id, c)}
                                  >
                                    {c}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
