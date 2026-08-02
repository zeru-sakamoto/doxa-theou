// Toolbar picker for inserting a [[wikilink]] to another note at the cursor —
// a separate, simpler insertion path than WikiLink.ts's `[[`-triggered
// suggestion plugin (that one replaces a typed `[[` range via
// insertContentAt; this one always targets the current selection via
// insertContent, since the Editor retains its selection even after DOM focus
// moves to this toolbar button/popover — same as every other toolbar button).
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import { useNotes } from "../../state/notes";
import { useMenuAlign } from "../../workspace/useMenuAlign";
import { WikiLinkIcon, ICON } from "../../workspace/icons";
import type { Note } from "./notes";

export function NoteLinkMenu({
  editor,
  noteId,
}: {
  editor: Editor;
  noteId: string;
}) {
  const { notes } = useNotes();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
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

  // Empty until a query is typed — an unfiltered dump of every note both
  // overwhelms the popup and (with enough notes to exceed the list's max
  // height) triggers a flexbox clipping bug: `truncate`'s `overflow: hidden`
  // drops each row's automatic minimum size to 0, so without `shrink-0`
  // flexbox would compress rows below their content height to fit instead of
  // overflowing/scrolling. Fixed below via `shrink-0`, but keeping the list
  // small by default avoids relying on that alone.
  const q = query.trim().toLowerCase();
  const filtered = q
    ? notes.filter(
        (n) =>
          n.id !== noteId &&
          [n.title, ...n.anchors, ...n.book, n.notebook]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
    : [];

  function pick(note: Note) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "wikiLink",
        attrs: { id: note.id, label: note.title },
      })
      .run();
    setOpen(false);
    setQuery("");
    setHighlighted(0);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (
      (e.key === "Enter" || e.key === "Tab") &&
      filtered[highlighted]
    ) {
      e.preventDefault();
      pick(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={"iconbtn shrink-0" + (open ? " is-active" : "")}
        title="Link to note"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setHighlighted(0);
        }}
      >
        <WikiLinkIcon size={ICON.md} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className="menu__list menu__list--right flex flex-col gap-1 min-w-[240px] max-w-[320px] p-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: DUR_FAST }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search notes…"
              className="input text-(length:--text-sm)"
            />
            <div className="flex flex-col gap-1 max-h-[220px] overflow-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-(length:--text-sm) text-muted">
                  {q ? "No matching notes" : "Type to search notes…"}
                </p>
              ) : (
                filtered.map((n, i) => (
                  <button
                    key={n.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => pick(n)}
                    className={
                      "w-full shrink-0 flex flex-col items-start gap-0.5 text-left py-2 px-2 rounded-(--radius-sm)" +
                      (i === highlighted
                        ? " bg-accent-tint"
                        : " hover:bg-accent-tint")
                    }
                  >
                    <span className="w-full truncate text-(length:--text-sm) font-medium text-ink">
                      {n.title.trim() || "Untitled"}
                    </span>
                    {(n.anchors.length > 0 || n.notebook) && (
                      <span className="w-full truncate font-(family-name:--font-mono) text-(length:--text-xs) text-muted">
                        {[...n.anchors, n.notebook].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
