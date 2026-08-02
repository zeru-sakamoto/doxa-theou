// Tag chip list + input for the selected note, with a frequency-sorted
// suggestion dropdown drawn from every tag already used across all notes.
// Combobox mechanics (open/close, keyboard nav, outside-click) mirror
// NoteLinkMenu.tsx.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import { CloseIcon, ICON } from "../../workspace/icons";
import type { Note } from "./notes";

export function NotesTagInput({
  note,
  tagsByFrequency,
  onUpdateNote,
}: {
  note: Note;
  tagsByFrequency: string[];
  onUpdateNote: (
    id: string,
    patch: Partial<Note> | ((n: Note) => Partial<Note>),
  ) => void;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
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

  function addTag(value: string) {
    const v = value.trim().replace(/^-+|-+$/g, "");
    if (v && !note.tags.includes(v))
      onUpdateNote(note.id, (n) => ({ tags: [...n.tags, v] }));
    setTagDraft("");
    setHighlighted(-1);
  }

  function removeTag(tag: string) {
    onUpdateNote(note.id, (n) => ({ tags: n.tags.filter((t) => t !== tag) }));
  }

  const q = tagDraft.trim().toLowerCase();
  const suggestions = tagsByFrequency.filter(
    (t) => !note.tags.includes(t) && (!q || t.toLowerCase().startsWith(q)),
  );

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      if (highlighted >= 0 && suggestions[highlighted]) e.preventDefault();
      addTag(
        highlighted >= 0 && suggestions[highlighted]
          ? suggestions[highlighted]
          : tagDraft,
      );
    } else if (
      e.key === "Tab" &&
      highlighted >= 0 &&
      suggestions[highlighted]
    ) {
      e.preventDefault();
      addTag(suggestions[highlighted]);
    } else if (
      e.key === "Backspace" &&
      tagDraft === "" &&
      note.tags.length > 0
    ) {
      e.preventDefault();
      removeTag(note.tags[note.tags.length - 1]);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-nowrap focus-within:flex-wrap justify-end focus-within:justify-start items-center gap-1.5 px-2 py-1 h-[30px] focus-within:h-auto overflow-hidden focus-within:overflow-visible rounded-(--radius-sm) border border-border-strong bg-bg focus-within:border-accent focus-within:shadow-[0_0_0_2px_var(--accent-tint-strong)]"
    >
      {note.tags.map((t) => (
        <span
          key={t}
          title={t}
          className="flex items-center gap-1 py-px pl-1.5 pr-1 rounded-full bg-accent-tint text-accent text-(length:--text-2xs) max-w-[140px] shrink-0"
        >
          <span className="truncate">{t}</span>
          <button
            type="button"
            className="flex items-center justify-center rounded-(--radius-full) text-accent hover:text-ink"
            title={`Remove tag ${t}`}
            aria-label={`Remove tag ${t}`}
            onClick={() => removeTag(t)}
          >
            <CloseIcon size={ICON.xs} />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[100px] border-0 bg-transparent text-ink placeholder:text-muted text-(length:--text-sm) py-0.5"
        style={{ outline: "none" }}
        value={tagDraft}
        placeholder="Add tag…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTagDraft(e.target.value.replace(/\s+/g, "-"));
          setHighlighted(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu__list menu__list--left flex flex-col gap-1 max-w-[280px] max-h-[184px] overflow-auto p-1 top-auto bottom-[calc(100%+4px)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: DUR_FAST }}
          >
            {suggestions.length === 0 ? (
              <p className="px-2 py-2 text-(length:--text-sm) text-muted">
                {tagsByFrequency.length === 0
                  ? "No tags yet"
                  : "No matching tags"}
              </p>
            ) : (
              suggestions.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => addTag(t)}
                  className={
                    "menu__item" + (i === highlighted ? " bg-accent-tint" : "")
                  }
                >
                  {t}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
