// In-panel Table of Contents drawer: book accordion -> chapter grid.
// Slides in over the Reader body. Navigation home #2 (with Cmd-K being #1).
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type Book, chapterCount } from "../../api";
import { ChevronRightIcon } from "../../workspace/icons";

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
        transition: { type: "spring" as const, stiffness: 520, damping: 44 },
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
            className="drawer__scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            aria-label="Table of contents"
            {...slide}
          >
            <div className="drawer__scroll">
              {groups.map(([label, list]) => (
                <section key={label} className="toc__group">
                  <h3 className="toc__grouphead">{label}</h3>
                  <ul className="toc__books">
                    {list.map((b) => {
                      const isOpen = expanded === b.id;
                      return (
                        <li key={b.id} className="toc__book">
                          <button
                            className={
                              "toc__bookrow" +
                              (b.id === currentBookId ? " is-current" : "")
                            }
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? -1 : b.id)}
                          >
                            <span
                              className={
                                "toc__chev" + (isOpen ? " is-open" : "")
                              }
                            >
                              <ChevronRightIcon size={14} />
                            </span>
                            <span className="toc__bookname">{b.name}</span>
                          </button>
                          {isOpen && (
                            <div
                              className="toc__chapters"
                              role="group"
                              aria-label={`${b.name} chapters`}
                            >
                              {Array.from(
                                { length: chapterCount(b.id) },
                                (_, i) => i + 1,
                              ).map((c) => (
                                <button
                                  key={c}
                                  className={
                                    "toc__chip" +
                                    (b.id === currentBookId &&
                                    c === currentChapter
                                      ? " is-current"
                                      : "")
                                  }
                                  onClick={() => onNavigate(b.id, c)}
                                >
                                  {c}
                                </button>
                              ))}
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
