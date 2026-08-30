// Standalone check, not part of the app build — run with:
//   node src/panels/typing/typingEngine.selfcheck.ts
import assert from "node:assert/strict";
import {
  createTypingState,
  typeChar,
  backspace,
  backspaceWord,
  charStates,
  accuracyNow,
  wpmNow,
  isComplete,
  hasStarted,
} from "./typingEngine.ts";

// Typing the target exactly: all correct, full accuracy, completes.
let s = createTypingState("cat");
s = typeChar(s, "c", 0);
s = typeChar(s, "a", 100);
s = typeChar(s, "t", 200);
assert.deepEqual(charStates(s), ["correct", "correct", "correct"]);
assert.equal(accuracyNow(s), 1);
assert.equal(isComplete(s), true);

// A mistake that gets backspaced and fixed still counts against accuracy —
// the keystroke was already recorded when it happened.
s = createTypingState("cat");
s = typeChar(s, "x", 0); // wrong
s = backspace(s);
s = typeChar(s, "c", 0);
s = typeChar(s, "a", 0);
s = typeChar(s, "t", 0);
assert.equal(s.totalKeystrokes, 4); // the wrong keystroke still counted
assert.equal(s.correctKeystrokes, 3);
assert.equal(accuracyNow(s), 0.75);
assert.deepEqual(charStates(s), ["correct", "correct", "correct"]); // display is post-backspace

// Backspace on an empty/completed state is a no-op.
let empty = createTypingState("cat");
assert.equal(backspace(empty), empty);
let done = typeChar(
  typeChar(typeChar(createTypingState("hi"), "h", 0), "i", 0),
  "x",
  0,
);
assert.equal(isComplete(done), true);
assert.equal(typeChar(done, "y", 0), done); // no keys accepted past completion
assert.equal(backspace(done), done); // frozen once complete

// WPM: "hello" (5 correct chars) typed over exactly 6 seconds = 0.1 min
// => (5/5) / 0.1 = 10 wpm.
let w = createTypingState("hello");
w = typeChar(w, "h", 0);
w = typeChar(w, "e", 1000);
w = typeChar(w, "l", 2000);
w = typeChar(w, "l", 3000);
w = typeChar(w, "o", 6000);
assert.equal(wpmNow(w, 6000), 10);

// Ctrl+Backspace deletes back to the start of the current word: trailing
// whitespace first, then the run of non-whitespace before it.
let ww = createTypingState("the cat sat down"); // longer than what's typed, so it stays incomplete
for (const ch of "the cat sat") ww = typeChar(ww, ch, 0);
ww = backspaceWord(ww);
assert.equal(ww.typed, "the cat "); // trailing word removed, trailing space kept
ww = backspaceWord(ww);
assert.equal(ww.typed, "the "); // space-then-word removed together
ww = backspaceWord(ww);
assert.equal(ww.typed, ""); // last word removed, nothing left to trim
assert.equal(backspaceWord(ww), ww); // no-op on empty state

// Word-backspace on a completed state is a no-op (frozen like plain backspace).
let wwDone = typeChar(typeChar(createTypingState("hi"), "h", 0), "i", 0);
assert.equal(backspaceWord(wwDone), wwDone);

// Straight quote/apostrophe keys count as correct against their curly
// typographic counterparts in the target text (no physical key types a
// curly quote directly).
let q = createTypingState("“Before’ I”");
q = typeChar(q, '"', 0); // “
q = typeChar(q, "B", 0);
q = typeChar(q, "e", 0);
q = typeChar(q, "f", 0);
q = typeChar(q, "o", 0);
q = typeChar(q, "r", 0);
q = typeChar(q, "e", 0);
q = typeChar(q, "'", 0); // ’
q = typeChar(q, " ", 0);
q = typeChar(q, "I", 0);
q = typeChar(q, '"', 0); // ”
assert.equal(accuracyNow(q), 1);
assert.equal(
  charStates(q).every((c) => c === "correct"),
  true,
);
// A genuinely wrong character (not a quote at all) is still marked incorrect.
let qWrong = typeChar(createTypingState("“Hi"), "x", 0);
assert.deepEqual(charStates(qWrong), ["incorrect", "untyped", "untyped"]);

// Untouched state: no keystrokes yet, not started, full accuracy by convention.
let fresh = createTypingState("abc");
assert.equal(hasStarted(fresh), false);
assert.equal(accuracyNow(fresh), 1);
assert.equal(wpmNow(fresh, 9999), 0);

console.log("typingEngine self-check passed");
