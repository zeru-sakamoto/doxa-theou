// Book/testament scope filter for the typing-practice random/sequential
// pool. Single-select, triggered by a filter icon that opens a centered
// modal (same fixed-overlay shell as CommandPalette) rather than an
// anchored dropdown. Portaled to document.body: the toolbar this button
// lives in is translate-x centered, and a `transform` on any ancestor
// turns `position: fixed` descendants into being positioned relative to
// that ancestor instead of the viewport — without the portal the overlay
// collapsed into the toolbar's own small box instead of covering the app.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import type { Book } from "../../api";
import { CloseIcon, FilterIcon, ICON } from "../../workspace/icons";
import type { TypingScope } from "./passageSource";

interface Props {
  books: Book[];
  scope: TypingScope;
  onChange: (scope: TypingScope) => void;
}

export function scopeLabel(scope: TypingScope, books: Book[]): string {
  switch (scope.kind) {
    case "all":
      return "All books";
    case "testament":
      return scope.testament === "OT" ? "Old Testament" : "New Testament";
    case "book":
      return books.find((b) => b.id === scope.bookId)?.name ?? "All books";
  }
}

const optionClass =
  "w-full text-left py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)";
const optionActive = " bg-accent border-accent text-on-accent";
const optionInactive =
  " bg-transparent border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-tint";

export function TypingScopeMenu({ books, scope, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const choose = (next: TypingScope) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={"iconbtn" + (scope.kind !== "all" ? " is-active" : "")}
        title={`Scope: ${scopeLabel(scope, books)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <FilterIcon size={ICON.md} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 flex items-center justify-center bg-(--scrim) z-(--z-palette)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR_FAST }}
              onMouseDown={() => setOpen(false)}
            >
              <motion.div
                className="flex flex-col gap-3 w-[min(320px,90%)] max-h-[80%] bg-panel border border-border-strong rounded-(--radius-md) shadow-(--shadow-2) p-3"
                onMouseDown={(e) => e.stopPropagation()}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                transition={{ duration: DUR_FAST }}
              >
                <div className="flex items-center justify-between shrink-0">
                  <h3 className="font-(family-name:--font-mono) text-(length:--text-xs) uppercase tracking-[0.08em] text-muted">
                    Book scope
                  </h3>
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                  >
                    <CloseIcon size={ICON.sm} />
                  </button>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    className={
                      optionClass +
                      (scope.kind === "all" ? optionActive : optionInactive)
                    }
                    onClick={() => choose({ kind: "all" })}
                  >
                    All books
                  </button>
                  <button
                    type="button"
                    className={
                      optionClass +
                      (scope.kind === "testament" && scope.testament === "OT"
                        ? optionActive
                        : optionInactive)
                    }
                    onClick={() =>
                      choose({ kind: "testament", testament: "OT" })
                    }
                  >
                    Old Testament
                  </button>
                  <button
                    type="button"
                    className={
                      optionClass +
                      (scope.kind === "testament" && scope.testament === "NT"
                        ? optionActive
                        : optionInactive)
                    }
                    onClick={() =>
                      choose({ kind: "testament", testament: "NT" })
                    }
                  >
                    New Testament
                  </button>
                </div>
                <div className="overflow-auto">
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
                      <div className="grid grid-cols-4 gap-1">
                        {list.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className={
                              "py-[3px] px-2 border rounded-(--radius-sm) font-(family-name:--font-mono) text-(length:--text-xs)" +
                              (scope.kind === "book" && scope.bookId === b.id
                                ? optionActive
                                : optionInactive)
                            }
                            onClick={() =>
                              choose({ kind: "book", bookId: b.id })
                            }
                          >
                            {b.abbr}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
