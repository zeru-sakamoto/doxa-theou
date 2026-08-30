// localStorage-backed history + panel-scoped settings for typing practice.
// Standalone module of get/set functions (dock.tsx's getRecentLayoutSnapshot
// pattern), not React-context state — this panel is a singleton, so there's
// nowhere else that needs to read these values.
import type { TypingScope, VerseLength } from "./passageSource";

export type TypingMode = "passage" | "chapter" | "verse";
export type TypingOrder = "random" | "sequential";
export type StatsScope = "global" | "session" | "lastN";

export interface TypingSession {
  date: string; // ISO
  mode: TypingMode;
  wpm: number;
  accuracy: number;
}

const HISTORY_KEY = "doxa-typing-history";
const HISTORY_MAX = 200;
const SHOW_WPM_KEY = "doxa-typing-show-wpm";
const SHOW_ACCURACY_KEY = "doxa-typing-show-accuracy";
const STATS_SCOPE_KEY = "doxa-typing-stats-scope";
const STATS_N_KEY = "doxa-typing-stats-n";
const VISIBLE_LINES_KEY = "doxa-typing-visible-lines";
const MODE_KEY = "doxa-typing-mode";
const ORDER_KEY = "doxa-typing-order";
const SCOPE_FILTER_KEY = "doxa-typing-scope-filter";
const VERSE_LENGTH_KEY = "doxa-typing-verse-length";

export function loadHistory(): TypingSession[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TypingSession[]) : [];
  } catch {
    return [];
  }
}

export function recordSession(session: TypingSession): TypingSession[] {
  const capped = [...loadHistory(), session].slice(-HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
  return capped;
}

function loadBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === "true";
}

export const loadShowWpm = () => loadBool(SHOW_WPM_KEY, true);
export const saveShowWpm = (v: boolean) =>
  localStorage.setItem(SHOW_WPM_KEY, String(v));
export const loadShowAccuracy = () => loadBool(SHOW_ACCURACY_KEY, true);
export const saveShowAccuracy = (v: boolean) =>
  localStorage.setItem(SHOW_ACCURACY_KEY, String(v));

export function loadStatsScope(): StatsScope {
  const raw = localStorage.getItem(STATS_SCOPE_KEY);
  return raw === "session" || raw === "lastN" ? raw : "global";
}
export function saveStatsScope(v: StatsScope): void {
  localStorage.setItem(STATS_SCOPE_KEY, v);
}

export function loadStatsN(): number {
  const raw = Number(localStorage.getItem(STATS_N_KEY));
  return Number.isFinite(raw) && raw >= 5 && raw <= 20 ? raw : 20;
}
export function saveStatsN(n: number): void {
  localStorage.setItem(STATS_N_KEY, String(Math.min(20, Math.max(5, n))));
}

export function loadVisibleLines(): number {
  const raw = Number(localStorage.getItem(VISIBLE_LINES_KEY));
  return Number.isFinite(raw) && raw >= 1 && raw <= 10 ? raw : 3;
}
export function saveVisibleLines(n: number): void {
  localStorage.setItem(VISIBLE_LINES_KEY, String(Math.min(10, Math.max(1, n))));
}

export function loadMode(): TypingMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "chapter" || raw === "verse" ? raw : "passage";
}
export function saveMode(v: TypingMode): void {
  localStorage.setItem(MODE_KEY, v);
}

// One shared setting across Verse/Passage/Chapter — like the book scope
// filter, switching mode should never silently change it.
export function loadOrder(): TypingOrder {
  return localStorage.getItem(ORDER_KEY) === "sequential"
    ? "sequential"
    : "random";
}
export function saveOrder(v: TypingOrder): void {
  localStorage.setItem(ORDER_KEY, v);
}

export function loadVerseLength(): VerseLength {
  const raw = localStorage.getItem(VERSE_LENGTH_KEY);
  return raw === "short" || raw === "long" ? raw : "medium";
}
export function saveVerseLength(v: VerseLength): void {
  localStorage.setItem(VERSE_LENGTH_KEY, v);
}

export function loadScopeFilter(): TypingScope {
  const raw = localStorage.getItem(SCOPE_FILTER_KEY);
  if (!raw) return { kind: "all" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.kind === "string") return parsed as TypingScope;
  } catch {
    /* fall through to default */
  }
  return { kind: "all" };
}
export function saveScopeFilter(v: TypingScope): void {
  localStorage.setItem(SCOPE_FILTER_KEY, JSON.stringify(v));
}

function average(sessions: TypingSession[]): number {
  return sessions.reduce((sum, s) => sum + s.accuracy, 0) / sessions.length;
}

// Derives the displayed running-accuracy figure. "session" never touches
// localStorage — it's the in-memory array the panel keeps for its own
// lifetime, cleared on unmount.
export function computeTrackedAccuracy(
  scope: StatsScope,
  n: number,
  sessionHistory: TypingSession[],
): number | null {
  if (scope === "session") {
    return sessionHistory.length ? average(sessionHistory) : null;
  }
  const history = loadHistory();
  const slice = scope === "lastN" ? history.slice(-n) : history;
  return slice.length ? average(slice) : null;
}
