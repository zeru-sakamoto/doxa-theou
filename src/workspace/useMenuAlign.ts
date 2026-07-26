import { useLayoutEffect, type RefObject } from "react";

const EDGE_PADDING = 8;

// The header dropdown popovers (Menu, NotesFilterMenu, NotebookMenu,
// NotesColorMenu) are fixed-width and pick a static left/right CSS anchor,
// which overflows the dock panel whenever the panel is narrower than the
// popover — the panel width isn't known at author time since panels can be
// split/resized freely. This nudges an already-positioned popover back
// inside the nearest panel's bounds via margin-left (not transform, so it
// doesn't fight the entrance animation's own transform).
export function useMenuAlign(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;

    function clamp() {
      if (!el) return;
      el.style.marginLeft = "0px";
      const rect = el.getBoundingClientRect();
      const panel = el.closest(".panel");
      const bounds = panel
        ? panel.getBoundingClientRect()
        : { left: 0, right: window.innerWidth };

      let shift = 0;
      const rightOverflow = rect.right - (bounds.right - EDGE_PADDING);
      if (rightOverflow > 0) shift -= rightOverflow;
      const leftOverflow = bounds.left + EDGE_PADDING - (rect.left + shift);
      if (leftOverflow > 0) shift += leftOverflow;

      el.style.marginLeft = `${shift}px`;
    }

    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [open, menuRef]);
}
