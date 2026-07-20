// Shown while WorkspaceShell waits on ws.ready (books/translations still
// loading). Text-only wordmark, quiet fade — no spinner, no logo glyph.
import { motion, useReducedMotion } from "motion/react";

export function LoadingScreen() {
  const reduce = useReducedMotion();

  return (
    <div className="flex h-full w-full items-center justify-center bg-bg text-ink">
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
        }
        className="font-(family-name:--font-serif) text-(length:--text-3xl) font-semibold tracking-[0.01em]"
      >
        Doxa&nbsp;Theou
      </motion.span>
    </div>
  );
}
