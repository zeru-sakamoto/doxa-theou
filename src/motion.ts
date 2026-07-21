// Shared motion values, mirroring the CSS motion tokens in styles/tokens.css.
// motion/react needs JS numbers/arrays, not CSS vars, so these are the JS-side
// source for animated components. Keep in sync with --dur-*/--ease-* there.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // = --ease-out
export const DUR_FAST = 0.12; // = --dur-fast (120ms)
export const DUR_BASE = 0.18; // = --dur-base (180ms)
export const DUR_SLOW = 0.24; // = --dur-slow (240ms)

// Reader TOC + Notes list drawers share one spring feel.
export const DRAWER_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 44,
} as const;
