"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * "Install the app" UI: registers the service worker, captures Chrome/Android's
 * install prompt, and explains Add to Home Screen on iPhone (which has no
 * prompt API). Hidden once the app is running installed.
 */

type Platform = "ios" | "android" | "other" | "installed" | "unknown";

function detect(): Platform {
  if (typeof window === "undefined") return "unknown";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with a touch screen.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

const noopSubscribe = () => () => {};
function usePlatform(): Platform {
  return useSyncExternalStore(noopSubscribe, detect, () => "unknown");
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function useInstallPrompt() {
  const [evt, setEvt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return {
    available: evt !== null,
    install: async () => {
      if (!evt) return;
      await evt.prompt();
      await evt.userChoice;
      setEvt(null);
    },
  };
}

/** Registers /sw.js. Mounted once in the root layout. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/** "your phone" / "your iPad" / "your computer" for banner copy. */
function deviceWord(platform: Platform): string {
  if (platform === "ios" || platform === "android") return "phone";
  return "computer";
}

const DISMISS_KEY = "iws-install-banner-dismissed";
const DISMISS_EVENT = "iws-install-banner";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeDismissed(cb: () => void) {
  window.addEventListener(DISMISS_EVENT, cb);
  return () => window.removeEventListener(DISMISS_EVENT, cb);
}

/** Slim, dismissible prompt at the top of the app on phones that can install. */
export function InstallBanner() {
  const platform = usePlatform();
  const { available, install } = useInstallPrompt();
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);

  // Phones always get the banner (iPhone has no prompt API, so it links to the how-to).
  // Desktop only when the browser offers installing (Chrome/Edge) — nothing to promise otherwise.
  const canInstall = available || platform === "ios" || platform === "android";
  if (!canInstall || platform === "installed" || dismissed) return null;
  const device = deviceWord(platform);

  return (
    <div className="border-b border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Install IWS Expense on your {device}</span>
        <span className="opacity-70">
          {device === "phone"
            ? "One tap from your home screen, full screen, no browser bar."
            : "Opens in its own window with a Start menu and taskbar icon — no browser tabs."}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {available ? (
            <button onClick={install} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
              Install
            </button>
          ) : (
            <Link href="/help#install-app" className="text-xs font-medium underline">
              Show me how
            </Link>
          )}
          <button
            aria-label="Dismiss"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, "1");
              } catch {}
              window.dispatchEvent(new Event(DISMISS_EVENT));
            }}
            className="text-lg leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </span>
      </div>
    </div>
  );
}

/** Full instructions for the Help page. */
export function InstallPanel() {
  const platform = usePlatform();
  const { available, install } = useInstallPrompt();

  return (
    <div className="mt-3 space-y-4 text-sm leading-relaxed">
      {platform === "installed" ? (
        <p className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2">
          ✓ You&apos;re already using the installed app.
        </p>
      ) : null}
      {available ? (
        <button onClick={install} className="rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white">
          Install IWS Expense
        </button>
      ) : null}

      <div className={platform === "ios" ? "rounded-lg border border-emerald-600/40 p-3" : "p-0"}>
        <h3 className="font-semibold">iPhone / iPad</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Open <strong>expense.iws.world</strong> in <strong>Safari</strong> (links opened inside Outlook or
            Teams can&apos;t install — tap &ldquo;Open in Safari&rdquo; first).
          </li>
          <li>
            Tap the <strong>Share</strong> button (the square with an arrow).
          </li>
          <li>
            Scroll and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
      </div>

      <div className={platform === "android" ? "rounded-lg border border-emerald-600/40 p-3" : "p-0"}>
        <h3 className="font-semibold">Android</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Open <strong>expense.iws.world</strong> in <strong>Chrome</strong>.
          </li>
          <li>
            Tap <strong>Install</strong> above (or the <strong>⋮</strong> menu → <strong>Install app</strong> /{" "}
            <strong>Add to Home screen</strong>).
          </li>
        </ol>
      </div>

      <div className={platform === "other" ? "rounded-lg border border-emerald-600/40 p-3" : "p-0"}>
        <h3 className="font-semibold">Windows / Mac computer</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Open <strong>expense.iws.world</strong> in <strong>Microsoft Edge</strong> or{" "}
            <strong>Chrome</strong> and sign in.
          </li>
          <li>
            Click <strong>Install</strong> above, or the install icon (a small screen with a down arrow) at
            the right end of the address bar, or menu → <strong>Apps → Install IWS Expense</strong>.
          </li>
          <li>
            It opens in its own window and appears in the <strong>Start menu</strong> and taskbar — right-click
            it to pin it. Safari on Mac: <strong>File → Add to Dock</strong>.
          </li>
        </ol>
        <p className="mt-1 text-xs opacity-60">Firefox can&apos;t install web apps — use Edge or Chrome.</p>
      </div>

      <ul className="list-disc space-y-1 pl-5 opacity-80">
        <li>The installed app has its own icon and opens in its own window or full screen. The receipt camera works the same.</li>
        <li>
          The installed app keeps its own sign-in, so you&apos;ll sign in with Microsoft once inside it — you
          don&apos;t lose anything in your browser.
        </li>
        <li>
          It needs a connection. Nothing is stored on your phone, so if someone else picks it up after you
          sign out there&apos;s nothing to see.
        </li>
      </ul>
    </div>
  );
}
