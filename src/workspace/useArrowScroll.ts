import { useEffect, type RefObject } from "react";

// Arrow-key scrolling for a panel's main scrollable content: a tap nudges by
// ARROW_TAP_STEP; a held key drives ARROW_HOLD_SPEED px/frame via
// requestAnimationFrame instead of relying on the OS's key-repeat timer,
// which fires at an uneven rate that reads as jitter when paired with
// per-event scrollBy calls. Only active while `active` is true (e.g. the
// panel is dockview's active tab), so multiple mounted panels don't all
// scroll on the same keypress. Skips normal typing (input/textarea/
// contenteditable) so this never hijacks text entry.
const ARROW_TAP_STEP = 60;
const ARROW_HOLD_SPEED = 18;

export function useArrowScroll(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const held = new Set<string>();
    let raf: number | null = null;

    function tick() {
      const el = containerRef.current;
      if (el) {
        if (held.has("ArrowDown")) el.scrollTop += ARROW_HOLD_SPEED;
        if (held.has("ArrowUp")) el.scrollTop -= ARROW_HOLD_SPEED;
      }
      raf = held.size > 0 ? requestAnimationFrame(tick) : null;
    }

    function stop() {
      held.clear();
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      e.preventDefault();
      if (e.repeat) return; // held-key motion comes from the rAF loop, not OS repeat
      // Arrow keys don't move focus off whatever element was last clicked,
      // but they do flip the browser's focus-visible heuristic on for it,
      // painting a stray ring — blur it.
      target?.blur();
      held.add(e.key);
      containerRef.current?.scrollBy({
        top: e.key === "ArrowDown" ? ARROW_TAP_STEP : -ARROW_TAP_STEP,
        behavior: "auto",
      });
      if (raf == null) raf = requestAnimationFrame(tick);
    }

    function onKeyUp(e: KeyboardEvent) {
      held.delete(e.key);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // A held key with no matching keyup (e.g. alt-tab away mid-hold) would
    // otherwise scroll forever — stop as soon as focus leaves the window.
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [active, containerRef]);
}
