"use client";

import { useEffect } from "react";

/**
 * A light haptic tick when a button or tappable card is pressed, where the
 * device supports it (Android; iPhone doesn't expose vibration to web apps).
 * The visual "pressed in" effect is pure CSS — see globals.css.
 */
export function PressFeedback() {
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, a.press, summary");
      if (!el || (el as HTMLButtonElement).disabled) return;
      navigator.vibrate(8);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
