// Book/testament scope filter for the typing-practice random/sequential
// pool. Single-select (unlike NotesFilterMenu's multi-select), modeled on
// the same trigger + outside-click/Escape popover shell, but with a text
// label on the trigger instead of an icon-only iconbtn.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import type { Book } from "../../api";
import { ChevronDownIcon, ICON } from "../../workspace/icons";
import { useMenuAlign } from "../../workspace/useMenuAlign";
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

  const choose = (next: TypingScope) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={
          "inline-flex items-center gap-1 h-[26px] px-2 rounded-(--radius-sm) bg-transparent text-muted text-(length:--text-xs) font-(family-name:--font-mono) transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint hover:text-ink" +
          (scope.kind !== "all" ? " text-accent bg-accent-tint" : "")
        }
        title="Scope"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {scopeLabel(scope, books)}
        <ChevronDownIcon size={ICON.sm} />
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
            <div className="flex flex-col gap-1">
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
                onClick={() => choose({ kind: "testament", testament: "OT" })}
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
                onClick={() => choose({ kind: "testament", testament: "NT" })}
              >
                New Testament
              </button>
            </div>
            <div className="max-h-[200px] overflow-auto">
              {(
                [
                  ["Old Testament", books.filter((b) => b.testament === "OT")],
                  ["New Testament", books.filter((b) => b.testament === "NT")],
                ] as Array<[string, Book[]]>
              ).map(([label, list]) => (
                <section key={label} className="[&+&]:mt-3">
                  <h4 className="mb-1 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                    {label}
                  </h4>
                  <div className="grid grid-cols-3 gap-1">
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
                        onClick={() => choose({ kind: "book", bookId: b.id })}
                      >
                        {b.abbr}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
