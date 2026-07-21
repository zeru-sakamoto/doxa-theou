// Full-window loading overlay: a slowly pulsing "Doxa Theou" wordmark on the
// themed background, shown until the app's data is ready. It sits above
// everything (z-toast) and fades out — via AnimatePresence in WorkspaceShell —
// once the workspace has mounted underneath, so the hand-off is a smooth
// reveal, not a swap flash. Picks up seamlessly from the static boot wordmark
// in index.html (same position/text/size).
import { motion, useReducedMotion } from "motion/react";
import { DUR_SLOW, EASE_OUT } from "../motion";

export function LoadingScreen() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="fixed inset-0 z-(--z-toast) flex items-center justify-center bg-bg text-ink"
      initial={{ opacity: 1 }} // continues the boot wordmark; no fade-in
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR_SLOW, ease: EASE_OUT }}
    >
      <motion.span
        className="select-none font-(family-name:--font-serif) text-(length:--text-3xl) font-semibold tracking-[0.01em]"
        animate={
          reduce ? undefined : { opacity: [0.5, 1, 0.5], scale: [1, 1.04, 1] }
        }
        transition={
          reduce
            ? undefined
            : { duration: 1.8, ease: "easeInOut", repeat: Infinity }
        }
      >
        Doxa&nbsp;Theou
      </motion.span>
    </motion.div>
  );
}
