"use client";
import { type ReactNode, useEffect, useRef } from "react";

// Small screens use document scrolling; the desktop panel folds its introduction
// before scrolling links, keeping the title and attribution in view.
export function CollectionHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = ref.current;
    const sheet = heading?.closest<HTMLElement>(".collection-sheet");
    const body = sheet?.querySelector<HTMLElement>(".sheet-body");
    const overview = heading?.querySelector<HTMLElement>(".collection-overview");
    if (!heading || !sheet || !body || !overview) return;
    const panel = window.matchMedia("(min-width: 1024px) and (min-height: 600px)");
    let folded = false;
    let lastTop = body.scrollTop;
    let touchY: number | undefined;
    let moving = false;
    let pendingScroll = 0;
    let revision = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fold = (value: boolean) => {
      const current = ++revision;
      folded = value;
      moving = true;
      pendingScroll = 0;
      overview.inert = value;
      if (value) heading.dataset.folded = "true";
      else delete heading.dataset.folded;
      body.scrollTop = 0;
      lastTop = 0;
      // Follow the actual CSS transitions, including interrupted reversals and
      // reduced motion. Keep one continuous gesture through the handoff.
      Promise.allSettled(overview.getAnimations().map((animation) => animation.finished)).then(
        () => {
          if (current !== revision) return;
          moving = false;
          if (folded && pendingScroll > 0) {
            body.scrollBy({
              top: pendingScroll,
              behavior: reducedMotion.matches ? "instant" : "smooth",
            });
          }
          pendingScroll = 0;
        },
      );
    };
    const turn = (direction: number, distance = 48) => {
      if (!panel.matches || !direction) return false;
      if (moving && direction > 0 && folded) {
        pendingScroll += distance;
        return true;
      }
      if (moving && direction < 0 && !folded) return true;
      if (!folded && direction > 0 && overview.getBoundingClientRect().height > 0) {
        fold(true);
        return true;
      }
      if (folded && direction < 0 && body.scrollTop <= 1) {
        fold(false);
        return true;
      }
      return false;
    };
    const wheel = (event: WheelEvent) => {
      const distance =
        Math.abs(event.deltaY) *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? body.clientHeight : 1);
      if (
        !event.ctrlKey &&
        Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
        turn(event.deltaY, distance)
      ) {
        event.preventDefault();
      }
    };
    const key = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || !body.contains(event.target)) return;
      if (event.target.closest("input, textarea, select, button, summary, [contenteditable]"))
        return;
      if (!panel.matches) return;
      if (event.key === "Home" && folded) {
        fold(false);
        event.preventDefault();
      } else if (
        turn(
          ["ArrowDown", "PageDown"].includes(event.key) || (event.key === " " && !event.shiftKey)
            ? 1
            : ["ArrowUp", "PageUp"].includes(event.key) || (event.key === " " && event.shiftKey)
              ? -1
              : 0,
        )
      ) {
        event.preventDefault();
      }
    };
    const touchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : undefined;
    };
    const touchMove = (event: TouchEvent) => {
      if (touchY === undefined || event.touches.length !== 1) return;
      const next = event.touches[0].clientY;
      if (Math.abs(touchY - next) < 8) return;
      if (turn(touchY - next, Math.abs(touchY - next))) event.preventDefault();
      touchY = next;
    };
    // Scrollbar dragging and focus navigation do not generate wheel/key input.
    // A layout-induced clamp to zero must not immediately undo the fold.
    const scroll = () => {
      if (!panel.matches || moving) return;
      const top = body.scrollTop;
      if (!folded && top > 0) {
        fold(true);
        // Anchor/item reveals and scrollbar moves already chose a destination.
        // Folding the introduction must not reset that destination to the top.
        pendingScroll = top;
      } else if (folded && lastTop > 1 && top <= 1) fold(false);
      else lastTop = top;
    };
    const resize = () => {
      if (!panel.matches && folded) fold(false);
      lastTop = body.scrollTop;
    };
    sheet.addEventListener("wheel", wheel, { passive: false });
    sheet.addEventListener("keydown", key);
    sheet.addEventListener("touchstart", touchStart, { passive: true });
    sheet.addEventListener("touchmove", touchMove, { passive: false });
    body.addEventListener("scroll", scroll, { passive: true });
    panel.addEventListener("change", resize);
    return () => {
      revision++;
      overview.inert = false;
      sheet.removeEventListener("wheel", wheel);
      sheet.removeEventListener("keydown", key);
      sheet.removeEventListener("touchstart", touchStart);
      sheet.removeEventListener("touchmove", touchMove);
      body.removeEventListener("scroll", scroll);
      panel.removeEventListener("change", resize);
      delete heading.dataset.folded;
    };
  }, []);
  return (
    <div ref={ref} className="page-heading collection-heading">
      {children}
    </div>
  );
}
