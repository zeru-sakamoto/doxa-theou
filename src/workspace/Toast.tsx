// Transient bottom-center toast. Fired via a window CustomEvent ("doxa:toast",
// detail = message), so any part of the app can signal one without prop-
// drilling (same pattern as doxa:goto / doxa:search). Auto-dismisses after 2s;
// honors reduced-motion. Announced to screen readers via role="status".
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR_FAST } from "../motion";

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent).detail as string);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2000);
    };
    window.addEventListener("doxa:toast", onToast);
    return () => {
      window.removeEventListener("doxa:toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          role="status"
          className="fixed left-1/2 bottom-9 z-(--z-toast) -translate-x-1/2 px-3 py-1.5 rounded-(--radius-md) bg-panel text-ink text-(length:--text-sm) border border-border-strong shadow-(--shadow-2)"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: DUR_FAST }}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Fire a transient toast from anywhere. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("doxa:toast", { detail: message }));
}
