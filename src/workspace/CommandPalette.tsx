// Cmd/Ctrl-K command palette — go-to-reference. Parses "Book Chapter[:Verse]"
// and drives the active Reader (opening one if none). Navigation home #1.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST, EASE_OUT } from "../motion";
import type { Book } from "../api";
import { useWorkspace } from "../state/workspace";
import { useDock } from "./dock";

const norm = (s: string) => s.toLowerCase().replace(/[.\s]/g, "");

function scoreBook(qn: string, b: Book): number {
  const name = norm(b.name);
  const abbr = norm(b.abbr);
  if (name === qn || abbr === qn) return 100;
  if (name.startsWith(qn) || abbr.startsWith(qn)) return 60;
  if (name.includes(qn)) return 30;
  return 0;
}

export function parseQuery(raw: string, books: Book[]) {
  const s = raw.trim();
  let bookText = s;
  let chapter = 1;
  let verse: number | undefined;
  const num = s.match(/(\d+)(?::(\d+))?\s*$/);
  if (num && num.index && num.index > 0) {
    bookText = s.slice(0, num.index).trim();
    chapter = Math.max(1, parseInt(num[1], 10));
    verse = num[2] ? parseInt(num[2], 10) : undefined;
  }
  const qn = norm(bookText);
  const candidates = qn
    ? books
        .map((b) => ({ b, score: scoreBook(qn, b) }))
        .filter((x) => x.score > 0)
        .sort((a, c) => c.score - a.score)
        .slice(0, 6)
        .map((x) => x.b)
    : [];
  return { candidates, chapter, verse };
}

export function CommandPalette() {
  const ws = useWorkspace();
  const dock = useDock();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const { candidates, chapter, verse } = useMemo(
    () => parseQuery(q, ws.books),
    [q, ws.books],
  );

  function commit(b: Book) {
    dock.gotoReference(b.id, chapter, verse);
    ws.setActiveReference({ bookId: b.id, chapter, verse });
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex justify-center items-start pt-[12vh] bg-(--scrim) z-(--z-palette)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR_FAST }}
          onMouseDown={() => setOpen(false)}
        >
          <motion.div
            className="w-[min(560px,92vw)] bg-panel border border-border-strong rounded-(--radius-md) shadow-(--shadow-2) overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            initial={
              reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: EASE_OUT }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (candidates[0]) commit(candidates[0]);
              }}
            >
              <input
                ref={inputRef}
                className="w-full px-4 py-3 border-0 border-b border-border bg-transparent text-ink text-(length:--text-lg) focus-visible:outline-none"
                value={q}
                placeholder="Go to reference — e.g. John 3:16"
                onChange={(e) => setQ(e.target.value)}
              />
            </form>
            <ul className="p-1 max-h-[300px] overflow-auto">
              {candidates.map((b, i) => (
                <li key={b.id}>
                  <button
                    className={
                      "flex items-center justify-between w-full px-3 py-2 border-0 rounded-(--radius-sm) bg-transparent text-left" +
                      (i === 0 ? " bg-accent-tint" : " hover:bg-accent-tint")
                    }
                    onClick={() => commit(b)}
                  >
                    <span className="font-(family-name:--font-mono) text-(length:--text-base) text-ink">
                      {b.name} {chapter}
                      {verse ? `:${verse}` : ""}
                    </span>
                    {i === 0 && (
                      <span className="font-(family-name:--font-mono) text-(length:--text-2xs) text-muted px-1.5 py-px border border-border rounded-(--radius-xs)">
                        Enter
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {q.trim() && candidates.length === 0 && (
                <li className="p-3 text-muted text-(length:--text-sm)">
                  No matching book.
                </li>
              )}
              {!q.trim() && (
                <li className="p-3 text-muted text-(length:--text-sm)">
                  Type a book, chapter, and optional verse.
                </li>
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
