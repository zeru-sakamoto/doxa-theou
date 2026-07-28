// Floating "Copy / Copy Blockquote / Copy Reference" menu for the Reader.
// Appears once the mouse is released on a text selection inside the chapter
// container (not live while dragging), positioned near the cursor. Always
// copies the FULL text of every verse the selection touches (not the literal
// substring), since verse text has no sub-string markup to preserve — see
// selectionCopy.ts for the formats.
import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Verse } from "../../api";
import { DUR_FAST } from "../../motion";
import {
  buildBlockquoteCopy,
  buildPlainCopy,
  buildReferenceCopy,
} from "./selectionCopy";

interface ActiveSelection {
  verses: Verse[];
  x: number;
  y: number;
}

const COPIED_RESET_MS = 900;
const EDGE_MARGIN = 100;
const ABOVE_THRESHOLD = 60;
const CURSOR_GAP = 12;

export function SelectionToolbar({
  containerRef,
  bookId,
  chapter,
  verses,
  bookName,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  bookId: number;
  chapter: number;
  verses: Verse[];
  bookName: (id: number) => string;
}) {
  const [sel, setSel] = useState<ActiveSelection | null>(null);
  const [copied, setCopied] = useState<"plain" | "quote" | "reference" | null>(
    null,
  );
  const copiedTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Whether the browser's Selection actually changed since the current
  // mousedown — a click that doesn't touch text (a button, empty chrome)
  // leaves the previous selection object untouched, so without this a
  // completely unrelated click would re-show the toolbar for the old,
  // stale selection instead of doing nothing.
  const gestureChangedSelection = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onSelectionChange = () => {
      gestureChangedSelection.current = true;
    };
    // Starting a new drag (or a plain click elsewhere) hides whatever's
    // showing — the menu only reappears once the new selection is final,
    // on mouseup below. Ignore mousedowns on the toolbar itself so pressing
    // a button doesn't hide it out from under the click.
    const onMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      gestureChangedSelection.current = false;
      setSel(null);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      if (!gestureChangedSelection.current) return;
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const touched = Array.from(
        container.querySelectorAll<HTMLElement>("[data-verse]"),
      ).filter((el) => range.intersectsNode(el));
      if (touched.length === 0) return;
      const nums = touched.map((el) => Number(el.dataset.verse));
      const start = Math.min(...nums);
      const end = Math.max(...nums);
      const touchedVerses = verses.filter(
        (v) => v.verse >= start && v.verse <= end,
      );
      if (touchedVerses.length === 0) return;
      setSel({ verses: touchedVerses, x: e.clientX, y: e.clientY });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [containerRef, verses]);

  // Chapter switched mid-selection — don't leave a stale toolbar up.
  useEffect(() => {
    setSel(null);
  }, [bookId, chapter]);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      window.getSelection()?.removeAllRanges();
      setSel(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel]);

  useEffect(() => () => clearTimeout(copiedTimeout.current), []);

  const handleCopy = async (kind: "plain" | "quote" | "reference") => {
    if (!sel) return;
    const name = bookName(bookId);
    const text =
      kind === "plain"
        ? buildPlainCopy(name, chapter, sel.verses)
        : kind === "quote"
          ? buildBlockquoteCopy(name, chapter, sel.verses)
          : buildReferenceCopy(name, chapter, sel.verses);
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    clearTimeout(copiedTimeout.current);
    copiedTimeout.current = setTimeout(() => {
      setCopied(null);
      window.getSelection()?.removeAllRanges();
      setSel(null);
    }, COPIED_RESET_MS);
  };

  const above = (sel?.y ?? 0) > ABOVE_THRESHOLD;
  const style = sel
    ? {
        left: Math.min(
          Math.max(sel.x, EDGE_MARGIN),
          window.innerWidth - EDGE_MARGIN,
        ),
        top: above ? sel.y - CURSOR_GAP : sel.y + CURSOR_GAP,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }
    : undefined;

  return (
    <AnimatePresence>
      {sel && (
        <motion.div
          ref={toolbarRef}
          className="selection-toolbar"
          style={style}
          role="menu"
          onMouseDown={(e) => e.preventDefault()}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: DUR_FAST }}
        >
          <button
            type="button"
            role="menuitem"
            className="selection-toolbar__btn"
            onClick={() => handleCopy("plain")}
          >
            {copied === "plain" ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="selection-toolbar__btn"
            onClick={() => handleCopy("quote")}
          >
            {copied === "quote" ? "Copied" : "Copy Blockquote"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="selection-toolbar__btn"
            onClick={() => handleCopy("reference")}
          >
            {copied === "reference" ? "Copied" : "Copy Reference"}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
