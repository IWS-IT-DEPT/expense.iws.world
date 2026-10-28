"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Drag down from the top of the page to refresh. Only active in the installed
 * app (display-mode: standalone): there's no browser reload button there, and
 * iPhone's installed apps have no built-in pull-to-refresh. In a normal browser
 * tab the browser's own gesture is left alone (globals.css only suppresses it
 * for the installed app, so the two never double up).
 */
const TRIGGER = 56; // damped pixels the page must be pulled to count
const MAX = 96;

export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const reset = () => {
      pullRef.current = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      startY.current = null;
      if (busyRef.current || e.touches.length !== 1 || window.scrollY > 0) return;
      // Not while a dialog is open, and not when the touch began inside something that's scrolled.
      if (document.querySelector('[role="dialog"]')) return;
      for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        if (el.scrollTop > 0) return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) reset();
        return;
      }
      const damped = Math.min(MAX, dy * 0.5);
      pullRef.current = damped;
      setPull(damped);
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= TRIGGER && !busyRef.current) {
        busyRef.current = true;
        setRefreshing(true);
        setPull(TRIGGER);
        router.refresh();
        setTimeout(() => {
          busyRef.current = false;
          setRefreshing(false);
          reset();
        }, 900);
      } else {
        reset();
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  if (pull === 0 && !refreshing) return null;

  const ready = pull >= TRIGGER;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center"
      style={{ transform: `translateY(${Math.max(0, pull - 36)}px)`, paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-xs font-medium shadow-md dark:border-white/15 dark:bg-neutral-900">
        {refreshing ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Refreshing…
          </>
        ) : (
          <>
            <span aria-hidden style={{ display: "inline-block", transform: ready ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
              ↓
            </span>
            {ready ? "Release to refresh" : "Pull to refresh"}
          </>
        )}
      </div>
    </div>
  );
}
