// Pure typing-test logic: keystroke tracking, per-character diff, WPM/accuracy.
// No DOM — TypingPanel.tsx drives this from its hidden-input keydown handler.

export type CharState = "correct" | "incorrect" | "untyped";

export interface TypingState {
  target: string;
  typed: string;
  // Forward keystrokes only — a mistake is counted the moment it's typed;
  // backspacing to fix it does not erase it from either counter (matches
  // how Monkeytype scores accuracy, and blocks the "backspace every error
  // for 100%" exploit a naive final-diff comparison would allow).
  totalKeystrokes: number;
  correctKeystrokes: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export function createTypingState(target: string): TypingState {
  return {
    target,
    typed: "",
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    startedAt: null,
    finishedAt: null,
  };
}

// Straight ASCII quote/apostrophe keys are accepted for their typographic
// counterparts — verse text is typeset with curly quotes throughout, but no
// physical keyboard types " / ' / " / ' directly, so requiring an exact
// match would make every quoted line untypeable.
function normalizeQuote(ch: string): string {
  switch (ch) {
    case "“": // “
    case "”": // ”
      return '"';
    case "‘": // ‘
    case "’": // ’ (also the curly apostrophe in contractions)
      return "'";
    default:
      return ch;
  }
}

function charsMatch(typed: string, target: string): boolean {
  return normalizeQuote(typed) === normalizeQuote(target);
}

export function typeChar(s: TypingState, ch: string, now: number): TypingState {
  if (s.finishedAt !== null || s.typed.length >= s.target.length) return s;
  const correct = charsMatch(ch, s.target[s.typed.length]);
  const typed = s.typed + ch;
  return {
    ...s,
    typed,
    totalKeystrokes: s.totalKeystrokes + 1,
    correctKeystrokes: s.correctKeystrokes + (correct ? 1 : 0),
    startedAt: s.startedAt ?? now,
    finishedAt: typed.length === s.target.length ? now : null,
  };
}

export function backspace(s: TypingState): TypingState {
  if (s.finishedAt !== null || s.typed.length === 0) return s;
  return { ...s, typed: s.typed.slice(0, -1) };
}

// Ctrl/Cmd+Backspace: delete back to the start of the current word, same
// boundary rule as a standard text editor — trailing whitespace, then the
// run of non-whitespace before it.
export function backspaceWord(s: TypingState): TypingState {
  if (s.finishedAt !== null || s.typed.length === 0) return s;
  let i = s.typed.length;
  while (i > 0 && /\s/.test(s.typed[i - 1])) i--;
  while (i > 0 && !/\s/.test(s.typed[i - 1])) i--;
  return { ...s, typed: s.typed.slice(0, i) };
}

export function charStates(s: TypingState): CharState[] {
  return s.target
    .split("")
    .map((c, i) =>
      i >= s.typed.length
        ? "untyped"
        : charsMatch(s.typed[i], c)
          ? "correct"
          : "incorrect",
    );
}

export function accuracyNow(s: TypingState): number {
  return s.totalKeystrokes === 0 ? 1 : s.correctKeystrokes / s.totalKeystrokes;
}

// (correctChars / 5) / minutesElapsed — standard "5 chars = 1 word" WPM.
export function wpmNow(s: TypingState, now: number): number {
  if (s.startedAt === null) return 0;
  const minutes = Math.max((s.finishedAt ?? now) - s.startedAt, 1) / 60_000;
  const correctChars = charStates(s).filter((c) => c === "correct").length;
  return correctChars / 5 / minutes;
}

export function isComplete(s: TypingState): boolean {
  return s.finishedAt !== null;
}

export function hasStarted(s: TypingState): boolean {
  return s.startedAt !== null;
}
