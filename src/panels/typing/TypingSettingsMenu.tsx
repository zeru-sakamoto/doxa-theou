// Gear popover for the typing-practice panel: display toggles (show WPM /
// show accuracy) and tracking scope (global / session / last N). Scoped to
// this panel only — separate from the app-wide SettingsPanel. Same
// trigger/shell as NotesFilterMenu, iconbtn trigger since this one has no
// text label.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../../motion";
import { ICON, SettingsIcon } from "../../workspace/icons";
import { useMenuAlign } from "../../workspace/useMenuAlign";
import type { StatsScope } from "./typingStats";

interface Props {
  showWpm: boolean;
  onShowWpmChange: (v: boolean) => void;
  showAccuracy: boolean;
  onShowAccuracyChange: (v: boolean) => void;
  statsScope: StatsScope;
  onStatsScopeChange: (v: StatsScope) => void;
  statsN: number;
  onStatsNChange: (v: number) => void;
  visibleLines: number;
  onVisibleLinesChange: (v: number) => void;
}

export function TypingSettingsMenu({
  showWpm,
  onShowWpmChange,
  showAccuracy,
  onShowAccuracyChange,
  statsScope,
  onStatsScopeChange,
  statsN,
  onStatsNChange,
  visibleLines,
  onVisibleLinesChange,
}: Props) {
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

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="iconbtn"
        title="Typing settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SettingsIcon size={ICON.md} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className="menu__list menu__list--right flex flex-col gap-3 w-[240px] p-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: DUR_FAST }}
          >
            <section>
              <h4 className="mb-1 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                Show
              </h4>
              <div className="seg" role="group" aria-label="Display">
                <button
                  type="button"
                  className={"seg__btn" + (showWpm ? " is-on" : "")}
                  onClick={() => onShowWpmChange(!showWpm)}
                >
                  WPM
                </button>
                <button
                  type="button"
                  className={"seg__btn" + (showAccuracy ? " is-on" : "")}
                  onClick={() => onShowAccuracyChange(!showAccuracy)}
                >
                  Accuracy
                </button>
              </div>
            </section>
            <section>
              <h4 className="mb-1 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                Lines shown
              </h4>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  className="slider"
                  min={1}
                  max={10}
                  step={1}
                  value={visibleLines}
                  onChange={(e) => onVisibleLinesChange(Number(e.target.value))}
                  aria-label="Number of lines shown at once"
                />
                <span className="w-[5ch] shrink-0 text-right text-(length:--text-xs) font-(family-name:--font-mono) text-muted">
                  {visibleLines}
                </span>
              </div>
            </section>
            <section>
              <h4 className="mb-1 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
                Tracking accuracy over
              </h4>
              <div className="seg" role="group" aria-label="Tracking scope">
                <button
                  type="button"
                  className={
                    "seg__btn" + (statsScope === "global" ? " is-on" : "")
                  }
                  onClick={() => onStatsScopeChange("global")}
                >
                  All time
                </button>
                <button
                  type="button"
                  className={
                    "seg__btn" + (statsScope === "session" ? " is-on" : "")
                  }
                  onClick={() => onStatsScopeChange("session")}
                >
                  Session
                </button>
                <button
                  type="button"
                  className={
                    "seg__btn" + (statsScope === "lastN" ? " is-on" : "")
                  }
                  onClick={() => onStatsScopeChange("lastN")}
                >
                  Last N
                </button>
              </div>
              {statsScope === "lastN" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="range"
                    className="slider"
                    min={5}
                    max={20}
                    step={1}
                    value={statsN}
                    onChange={(e) => onStatsNChange(Number(e.target.value))}
                    aria-label="Number of recent sessions to track"
                  />
                  <span className="w-[5ch] shrink-0 text-right text-(length:--text-xs) font-(family-name:--font-mono) text-muted">
                    {statsN}
                  </span>
                </div>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
