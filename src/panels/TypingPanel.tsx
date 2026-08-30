// Typing Practice — Monkeytype-style: a faded target passage/chapter, type
// it, live WPM + accuracy. Panel-scoped settings (typingStats.ts) for what's
// tracked/shown; passage/chapter selection + fetching in passageSource.ts;
// keystroke/WPM/accuracy math in typingEngine.ts (pure, unit-checked).
import { useCallback, useEffect, useRef, useState } from "react";
import { listSectionHeadingRanges, type HeadingRange } from "../api";
import { useWorkspace } from "../state/workspace";
import {
  advanceSequentialChapter,
  advanceSequentialPassage,
  advanceSequentialVerse,
  fetchChapterText,
  fetchPassageText,
  fetchVerseText,
  nextSequentialChapter,
  nextSequentialPassage,
  nextSequentialVerse,
  pickRandomChapter,
  pickRandomPassage,
  pickRandomVerse,
  type ChapterSelection,
  type PassageText,
  type TypingScope,
  type VerseLength,
  type VerseSelection,
} from "./typing/passageSource";
import {
  accuracyNow,
  backspace,
  backspaceWord,
  charStates,
  createTypingState,
  hasStarted,
  isComplete,
  typeChar,
  wpmNow,
  type TypingState,
} from "./typing/typingEngine";
import {
  computeTrackedAccuracy,
  loadMode,
  loadOrder,
  loadScopeFilter,
  loadShowAccuracy,
  loadShowWpm,
  loadStatsN,
  loadStatsScope,
  loadVerseLength,
  loadVisibleLines,
  recordSession,
  saveMode,
  saveOrder,
  saveScopeFilter,
  saveShowAccuracy,
  saveShowWpm,
  saveStatsN,
  saveStatsScope,
  saveVerseLength,
  saveVisibleLines,
  type StatsScope,
  type TypingMode,
  type TypingOrder,
  type TypingSession,
} from "./typing/typingStats";
import { scopeLabel, TypingScopeMenu } from "./typing/TypingScopeMenu";
import { TypingSettingsMenu } from "./typing/TypingSettingsMenu";

// The text viewport's height and line-height are both derived from
// LINE_HEIGHT_EM so they can never drift out of sync with each other; how
// many lines that amounts to is the user-configurable "Lines shown" setting.
const LINE_HEIGHT_EM = 1.6;

export function TypingPanel() {
  const ws = useWorkspace();

  const [mode, setModeState] = useState<TypingMode>(() => loadMode());
  const [order, setOrderState] = useState<TypingOrder>(() => loadOrder());
  const [scope, setScopeState] = useState<TypingScope>(() => loadScopeFilter());
  const [showWpm, setShowWpmState] = useState(() => loadShowWpm());
  const [showAccuracy, setShowAccuracyState] = useState(() =>
    loadShowAccuracy(),
  );
  const [statsScope, setStatsScopeState] = useState<StatsScope>(() =>
    loadStatsScope(),
  );
  const [statsN, setStatsNState] = useState(() => loadStatsN());
  const [visibleLines, setVisibleLinesState] = useState(() =>
    loadVisibleLines(),
  );
  const [verseLength, setVerseLengthState] = useState<VerseLength>(() =>
    loadVerseLength(),
  );
  const [sessionHistory, setSessionHistory] = useState<TypingSession[]>([]);

  const setMode = (m: TypingMode) => {
    setModeState(m);
    saveMode(m);
  };
  const setOrder = (o: TypingOrder) => {
    setOrderState(o);
    saveOrder(o);
  };
  const setScope = (s: TypingScope) => {
    setScopeState(s);
    saveScopeFilter(s);
  };
  const setShowWpm = (v: boolean) => {
    setShowWpmState(v);
    saveShowWpm(v);
  };
  const setShowAccuracy = (v: boolean) => {
    setShowAccuracyState(v);
    saveShowAccuracy(v);
  };
  const setStatsScope = (v: StatsScope) => {
    setStatsScopeState(v);
    saveStatsScope(v);
  };
  const setStatsN = (v: number) => {
    setStatsNState(v);
    saveStatsN(v);
  };
  const setVisibleLines = (v: number) => {
    setVisibleLinesState(v);
    saveVisibleLines(v);
  };
  const setVerseLength = (v: VerseLength) => {
    setVerseLengthState(v);
    saveVerseLength(v);
  };

  const [ranges, setRanges] = useState<HeadingRange[]>([]);
  useEffect(() => {
    listSectionHeadingRanges(ws.defaultTranslation)
      .then(setRanges)
      .catch(() => setRanges([]));
  }, [ws.defaultTranslation]);

  const [target, setTarget] = useState<PassageText | null>(null);
  const [engine, setEngine] = useState<TypingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [, tick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const textViewportRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const caretIndicatorRef = useRef<HTMLSpanElement>(null);
  const composingRef = useRef(false);

  const loadNext = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "chapter") {
        const sel: ChapterSelection | null =
          order === "random"
            ? pickRandomChapter(scope, ws.books)
            : nextSequentialChapter(scope, ws.books);
        if (!sel) {
          setTarget(null);
          setEngine(null);
          return;
        }
        const pt = await fetchChapterText(sel, ws.defaultTranslation, ws.books);
        if (order === "sequential") advanceSequentialChapter(sel);
        setTarget(pt);
        setEngine(createTypingState(pt.text));
      } else if (mode === "verse") {
        const sel: VerseSelection | null =
          order === "random"
            ? await pickRandomVerse(
                scope,
                ws.books,
                verseLength,
                ws.defaultTranslation,
              )
            : await nextSequentialVerse(scope, ws.books, ws.defaultTranslation);
        if (!sel) {
          setTarget(null);
          setEngine(null);
          return;
        }
        const pt = await fetchVerseText(sel, ws.defaultTranslation, ws.books);
        if (order === "sequential") advanceSequentialVerse(sel);
        setTarget(pt);
        setEngine(createTypingState(pt.text));
      } else {
        const range: HeadingRange | null =
          order === "random"
            ? pickRandomPassage(ranges, scope, ws.books)
            : nextSequentialPassage(ranges, scope, ws.books);
        if (!range) {
          setTarget(null);
          setEngine(null);
          return;
        }
        const pt = await fetchPassageText(
          range,
          ws.defaultTranslation,
          ws.books,
        );
        if (order === "sequential") advanceSequentialPassage(range);
        setTarget(pt);
        setEngine(createTypingState(pt.text));
      }
    } finally {
      setLoading(false);
    }
  }, [
    mode,
    order,
    scope,
    ranges,
    verseLength,
    ws.books,
    ws.defaultTranslation,
  ]);

  // Fires on mode change, and once when passage-mode's range list first
  // arrives. Deliberately NOT on order/scope/verseLength changes — tweaking
  // those should only affect the *next* fetch (Tab), not yank the
  // in-progress passage.
  useEffect(() => {
    if (mode === "passage" && ranges.length === 0) return;
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ranges]);

  // Live WPM ticks even without new keystrokes, like Monkeytype's timer.
  useEffect(() => {
    if (!engine || !hasStarted(engine) || isComplete(engine)) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [engine]);

  // Only `visibleLines` lines show at once (viewport is overflow-hidden, no
  // user-driven scroll) — this scrolls it forward by whole lines as the
  // caret crosses into a new one, keeping the active line centered in the
  // window (for an even count, the upper of the two middle lines — e.g. 4
  // lines shown puts the caret's line 2nd from the top).
  useEffect(() => {
    const viewport = textViewportRef.current;
    const caret = caretRef.current;
    const indicator = caretIndicatorRef.current;
    if (!viewport) return;
    if (!caret) {
      if (indicator) indicator.style.opacity = "0";
      return;
    }
    const lineHeightPx = viewport.clientHeight / visibleLines;
    if (!lineHeightPx) return;
    const lineIndex = Math.round(caret.offsetTop / lineHeightPx);
    const centerRow = Math.floor((visibleLines - 1) / 2);
    viewport.scrollTop = Math.max(0, (lineIndex - centerRow) * lineHeightPx);
    if (indicator) {
      indicator.style.opacity = "1";
      indicator.style.transform = `translate(${caret.offsetLeft}px, ${caret.offsetTop}px)`;
    }
  }, [engine?.typed.length, target, visibleLines]);

  // Tab/Backspace are control keys, safe to intercept directly on keydown.
  // Printable characters are handled via onChange/onCompositionEnd instead
  // (see processTyped below) — relying on keydown's e.key for those broke
  // any character produced through composition (dead-key accents like
  // Shift+' on an International layout, or IME input): the browser doesn't
  // fire a plain keydown with that final character, so a keydown-only
  // handler with preventDefault() on every printable key silently ate the
  // dead-key press without ever seeing the composed result.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!engine || !target) return;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey || !hasStarted(engine) || isComplete(engine)) {
        loadNext();
      } else {
        setEngine(createTypingState(target.text));
      }
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      setEngine(
        e.ctrlKey || e.metaKey ? backspaceWord(engine) : backspace(engine),
      );
    }
  };

  // Applies each character of a completed input/composition value against
  // the engine in order, recording a session the moment it completes.
  const processTyped = (value: string) => {
    if (!engine || !target || !value) return;
    let current = engine;
    for (const ch of value) {
      const wasComplete = isComplete(current);
      const next = typeChar(current, ch, performance.now());
      if (next === current) break; // frozen (already complete)
      current = next;
      if (isComplete(current) && !wasComplete) {
        const session: TypingSession = {
          date: new Date().toISOString(),
          mode,
          wpm: Math.round(wpmNow(current, performance.now())),
          accuracy: accuracyNow(current),
        };
        recordSession(session);
        setSessionHistory((h) => [...h, session]);
      }
    }
    setEngine(current);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (composingRef.current) return; // wait for compositionend instead
    processTyped(e.target.value);
    e.target.value = "";
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>,
  ) => {
    composingRef.current = false;
    processTyped(e.currentTarget.value);
    e.currentTarget.value = "";
  };

  const trackedAccuracy = computeTrackedAccuracy(
    statsScope,
    statsN,
    sessionHistory,
  );
  const states = engine ? charStates(engine) : [];
  const started = engine ? hasStarted(engine) : false;
  const complete = engine ? isComplete(engine) : false;
  const now = performance.now();

  const hint =
    !engine || !started || complete
      ? "tab — next passage"
      : "tab — restart · shift+tab — new passage";

  return (
    <div className="panel relative">
      {/* Floating control bar — no bordered header, just a card that floats
          over the top of the content (Monkeytype's config-bar look). */}
      <div className="absolute top-12 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-(--radius-md) border border-border-strong bg-panel p-1.5 shadow-(--shadow-2)">
        {mode === "verse" && order === "random" && (
          <div className="seg" role="group" aria-label="Verse length">
            <button
              type="button"
              className={"seg__btn" + (verseLength === "short" ? " is-on" : "")}
              onClick={() => setVerseLength("short")}
            >
              Short
            </button>
            <button
              type="button"
              className={
                "seg__btn" + (verseLength === "medium" ? " is-on" : "")
              }
              onClick={() => setVerseLength("medium")}
            >
              Medium
            </button>
            <button
              type="button"
              className={"seg__btn" + (verseLength === "long" ? " is-on" : "")}
              onClick={() => setVerseLength("long")}
            >
              Long
            </button>
          </div>
        )}
        <div className="seg" role="group" aria-label="Mode">
          <button
            type="button"
            className={"seg__btn" + (mode === "verse" ? " is-on" : "")}
            onClick={() => setMode("verse")}
          >
            Verse
          </button>
          <button
            type="button"
            className={"seg__btn" + (mode === "passage" ? " is-on" : "")}
            onClick={() => setMode("passage")}
          >
            Passage
          </button>
          <button
            type="button"
            className={"seg__btn" + (mode === "chapter" ? " is-on" : "")}
            onClick={() => setMode("chapter")}
          >
            Chapter
          </button>
        </div>
        <div className="seg" role="group" aria-label="Order">
          <button
            type="button"
            className={"seg__btn" + (order === "random" ? " is-on" : "")}
            onClick={() => setOrder("random")}
          >
            Random
          </button>
          <button
            type="button"
            className={"seg__btn" + (order === "sequential" ? " is-on" : "")}
            onClick={() => setOrder("sequential")}
          >
            Sequential
          </button>
        </div>
        <TypingScopeMenu books={ws.books} scope={scope} onChange={setScope} />
      </div>

      <div className="absolute top-3 right-3 z-10">
        <TypingSettingsMenu
          showWpm={showWpm}
          onShowWpmChange={setShowWpm}
          showAccuracy={showAccuracy}
          onShowAccuracyChange={setShowAccuracy}
          statsScope={statsScope}
          onStatsScopeChange={setStatsScope}
          statsN={statsN}
          onStatsNChange={setStatsN}
          visibleLines={visibleLines}
          onVisibleLinesChange={setVisibleLines}
        />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col items-center justify-center py-3 px-4">
        <div className="w-full max-w-[640px] flex flex-col items-center gap-4">
          {(showWpm || showAccuracy) && engine && (
            <div className="flex items-center gap-6 text-(length:--text-2xl) font-(family-name:--font-mono)">
              {showWpm && (
                <span>
                  {Math.round(wpmNow(engine, now))}{" "}
                  <span className="text-(length:--text-xs) text-muted">
                    wpm
                  </span>
                </span>
              )}
              {showAccuracy && (
                <span>
                  {Math.round(accuracyNow(engine) * 100)}%{" "}
                  <span className="text-(length:--text-xs) text-muted">
                    acc
                  </span>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 text-(length:--text-xs) font-(family-name:--font-mono) text-muted">
            <span>{ws.defaultTranslation}</span>
            {target && <span>· {target.label}</span>}
            {mode === "passage" && target?.heading && (
              <span>· "{target.heading}"</span>
            )}
            {(showWpm || showAccuracy) && (
              <span>
                · tracking:{" "}
                {statsScope === "global"
                  ? "all time"
                  : statsScope === "session"
                    ? "this session"
                    : `last ${statsN}`}{" "}
                {trackedAccuracy !== null
                  ? `(${Math.round(trackedAccuracy * 100)}%)`
                  : "(no data)"}
              </span>
            )}
          </div>

          <div className="relative w-full select-none">
            {!target ? (
              <p className="panel__muted text-center">
                {loading
                  ? "Loading…"
                  : `No ${mode === "passage" ? "passages" : mode === "chapter" ? "chapters" : "verses"} match "${scopeLabel(scope, ws.books)}".`}
              </p>
            ) : (
              <div
                ref={textViewportRef}
                className="relative overflow-hidden font-(family-name:--font-mono) text-(length:--text-lg) tracking-wide cursor-text"
                style={{
                  lineHeight: `${LINE_HEIGHT_EM}em`,
                  height: `${LINE_HEIGHT_EM * visibleLines}em`,
                }}
              >
                {target.text.split("").map((ch, i) => {
                  const st = states[i];
                  const cls =
                    st === "correct"
                      ? "text-ink"
                      : st === "incorrect"
                        ? "text-danger underline decoration-danger"
                        : "text-muted";
                  const caret = engine && i === engine.typed.length;
                  return (
                    <span
                      key={i}
                      ref={caret ? caretRef : undefined}
                      className={cls}
                    >
                      {st === "incorrect" ? engine!.typed[i] : ch}
                    </span>
                  );
                })}
                {/* Floating caret — positioned imperatively (see the scroll
                    effect above) and animated via CSS transition, rather
                    than a border/box-shadow on the target span, so moving
                    between characters slides instead of jumping and never
                    perturbs the text's own layout. */}
                <span
                  ref={caretIndicatorRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 w-0.5 bg-accent transition-transform duration-100 ease-out motion-reduce:transition-none"
                  style={{ height: `${LINE_HEIGHT_EM}em`, opacity: 0 }}
                />
              </div>
            )}
            {target && !focused && (
              <div
                aria-hidden="true"
                className="panel__muted absolute inset-0 flex items-center justify-center bg-bg/80 pointer-events-none"
              >
                Click here or press any key to focus
              </div>
            )}
            <input
              ref={inputRef}
              className="absolute inset-0 w-full h-full opacity-0 cursor-text"
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={handleCompositionEnd}
              onPaste={(e) => e.preventDefault()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Typing practice input"
              disabled={!target}
            />
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 border-t border-border text-center text-(length:--text-2xs) font-(family-name:--font-mono) text-muted shrink-0">
        {hint}
      </div>
    </div>
  );
}
