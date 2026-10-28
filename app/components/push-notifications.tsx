"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Opt in to push notifications on THIS device (reminders and sent-back
 * notices). `publicKey` is the VAPID public key from the server; without it the
 * UI doesn't render at all.
 */

type PushState = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const noop = () => () => {};
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function toKey(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePush(publicKey: string | undefined) {
  const environment = useSyncExternalStore(
    noop,
    () => {
      if (!publicKey) return "unsupported" as const;
      if (supported()) return "ok" as const;
      // iPhone only offers push to apps installed on the home screen.
      return isIos() && !isInstalled() ? ("needs-install" as const) : ("unsupported" as const);
    },
    () => "loading" as const,
  );

  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (environment !== "ok") return;
    let alive = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!alive) return;
        setSubscribed(!!sub);
        setPermission(Notification.permission);
      })
      .catch(() => alive && setSubscribed(false));
    return () => {
      alive = false;
    };
  }, [environment]);

  let state: PushState;
  if (environment === "loading") state = "loading";
  else if (environment !== "ok") state = environment;
  else if (subscribed === null) state = "loading";
  else if (permission === "denied") state = "denied";
  else state = subscribed ? "on" : "off";

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("The server didn't accept the subscription.");
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications off.");
    } finally {
      setBusy(false);
    }
  }

  return { state, busy, error, enable, disable };
}

/** Full control for the Account and Help pages. */
export function NotifyPanel({ publicKey }: { publicKey?: string }) {
  const { state, busy, error, enable, disable } = usePush(publicKey);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  if (!publicKey || state === "loading") return null;

  async function test() {
    setTestMsg("Sending…");
    const res = await fetch("/api/push/test", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { delivered?: number; error?: string };
    setTestMsg(
      !res.ok
        ? (j.error ?? "Couldn't send a test.")
        : j.delivered
          ? "Sent — it should arrive in a moment."
          : "Nothing was delivered. Try turning notifications off and on again.",
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="opacity-70">
        Get a notification on this device when an expense is <strong>sent back</strong> and for the
        Wednesday/Friday <strong>reminders</strong>. If you turn them on you won&apos;t also get those
        emails.
      </p>

      {state === "needs-install" ? (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
          On iPhone, notifications only work once the app is installed. Tap <strong>Share → Add to Home
          Screen</strong>, then open it from your home screen and come back here.
        </p>
      ) : state === "unsupported" ? (
        <p className="opacity-70">This browser doesn&apos;t support notifications. Reminders will keep coming by email.</p>
      ) : state === "denied" ? (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
          Notifications are blocked for this site. Turn them back on in your device or browser settings
          (Site settings → Notifications), then come back here.
        </p>
      ) : state === "on" ? (
        <div className="space-y-2">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">✓ Notifications are on for this device.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={test}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-black/15 px-4 font-medium dark:border-white/20"
            >
              Send me a test
            </button>
            <button
              onClick={disable}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-black/15 px-4 font-medium disabled:opacity-50 dark:border-white/20"
            >
              Turn off
            </button>
          </div>
          {testMsg ? <p className="opacity-70">{testMsg}</p> : null}
        </div>
      ) : (
        <button
          onClick={enable}
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-600 px-5 font-semibold text-white disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {error ? <p className="text-red-600">{error}</p> : null}
    </div>
  );
}

const DISMISS_KEY = "iws-notify-banner-dismissed";
const DISMISS_EVENT = "iws-notify-banner";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};
const subscribeDismissed = (cb: () => void) => {
  window.addEventListener(DISMISS_EVENT, cb);
  return () => window.removeEventListener(DISMISS_EVENT, cb);
};

/** Gentle one-line nudge, shown only where push works and isn't on yet. */
export function NotifyBanner({ publicKey }: { publicKey?: string }) {
  const { state, busy, enable } = usePush(publicKey);
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);

  if (!publicKey || state !== "off" || dismissed) return null;

  return (
    <div className="border-b border-sky-600/30 bg-sky-600/10 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Get notified when something&apos;s sent back or due</span>
        <span className="ml-auto flex items-center gap-3">
          <button
            onClick={enable}
            disabled={busy}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Turn on
          </button>
          <button
            aria-label="Dismiss"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, "1");
              } catch {}
              window.dispatchEvent(new Event(DISMISS_EVENT));
            }}
            className="inline-flex h-9 w-9 items-center justify-center text-lg leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </span>
      </div>
    </div>
  );
}
