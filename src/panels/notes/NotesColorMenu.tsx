// Per-note color picker for the Notes header — tags the selected note with
// one of the 7 highlight hues (or clears it). Distinct from
// ws.notesHighlightColor, which is the default color for in-text highlight
// marks, not a note's own color. Modeled on NotesFilterMenu's custom
// trigger + outside-click/Escape popover shell — same reason: the body is a
// swatch grid, not a flat action list, so workspace/Menu isn't reusable.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import { useWorkspace } from "../../state/workspace";
import { paletteById } from "./notes";
import { useMenuAlign } from "../../workspace/useMenuAlign";

interface Props {
  color: string | undefined;
  onChange: (color: string | undefined) => void;
}

export function NotesColorMenu({ color, onChange }: Props) {
  const ws = useWorkspace();
  const swatches = paletteById(ws.anchorPalette).swatches;
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

  function pick(value: string | undefined) {
    onChange(value);
    setOpen(false);
  }

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={"iconbtn" + (open ? " is-active" : "")}
        title="Note color"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={
            "w-3.5 h-3.5 rounded-full border-2" +
            (color ? " border-border-strong" : " border-dashed border-muted")
          }
          style={color ? { background: color } : undefined}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className="menu__list menu__list--right flex flex-wrap gap-2 w-[168px] p-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: DUR_FAST }}
          >
            <button
              type="button"
              title="No color"
              aria-label="No color"
              aria-pressed={!color}
              onClick={() => pick(undefined)}
              className={
                "w-[22px] h-[22px] rounded-full border border-dashed" +
                (!color
                  ? " border-ink ring-2 ring-offset-2 ring-offset-bg ring-ink"
                  : " border-border")
              }
            />
            {swatches.map((s) => {
              const value = `var(${s.var})`;
              return (
                <button
                  key={s.var}
                  type="button"
                  title={s.name}
                  aria-label={`Use ${s.name} as this note's color`}
                  aria-pressed={color === value}
                  onClick={() => pick(value)}
                  className={
                    "w-[22px] h-[22px] rounded-full border" +
                    (color === value
                      ? " border-ink ring-2 ring-offset-2 ring-offset-bg ring-ink"
                      : " border-border")
                  }
                  style={{ background: value }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
