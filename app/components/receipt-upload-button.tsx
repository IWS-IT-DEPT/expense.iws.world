"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { startReceiptUpload, type UploadLink } from "@/app/(app)/expenses/actions";
import { Modal } from "@/app/components/modal";
import { ReceiptScanner } from "@/app/components/receipt-scanner";
import type { UploadPurpose } from "@/lib/upload-token";

/**
 * "Upload receipt" entry point.
 *  - phone (coarse pointer): straight into the scanner
 *  - desktop: choose "scan/upload here" or "use my phone" (QR + status poll)
 */
export function ReceiptUploadButton({
  purpose,
  targetId,
  label = "Upload receipt",
  compact = false,
  className,
  onDone,
}: {
  purpose: UploadPurpose;
  targetId?: string;
  label?: string;
  compact?: boolean;
  /** Overrides the built-in trigger styling (compact is ignored when set). */
  className?: string;
  onDone?: (r: { receiptCount: number; pendingExpenseId?: string | null }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "device" | "phone">("choose");
  const [isCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
  );
  const [link, setLink] = useState<UploadLink | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [received, setReceived] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => clearPoll, [clearPoll]);

  function openModal() {
    setLink(null);
    setLinkErr(null);
    setReceived(false);
    setMode(isCoarse ? "device" : "choose");
    setOpen(true);
  }

  function close() {
    clearPoll();
    setOpen(false);
  }

  async function goPhone() {
    setMode("phone");
    setLinkErr(null);
    const res = await startReceiptUpload(purpose, targetId ?? null);
    if (!res.ok) {
      setLinkErr(res.error);
      return;
    }
    setLink(res.link);
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/receipt-upload?nonce=${res.link.nonce}`);
        if (!r.ok) return;
        const j = (await r.json()) as {
          status: string;
          receiptCount?: number;
          createdPendingExpenseId?: string | null;
        };
        if (j.status === "uploaded") {
          clearPoll();
          setReceived(true);
          router.refresh();
          onDone?.({
            receiptCount: j.receiptCount ?? 1,
            pendingExpenseId: j.createdPendingExpenseId ?? null,
          });
        } else if (j.status === "expired") {
          clearPoll();
          setLinkErr("That link expired — close and try again.");
        }
      } catch {
        /* transient network error; keep polling */
      }
    }, 3000);
  }

  const triggerClass =
    className ??
    (compact
      ? "text-xs underline opacity-70 hover:opacity-100"
      : "rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10");

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClass}>
        {label}
      </button>

      <Modal open={open} onClose={close} title="Add a receipt">
        {mode === "choose" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setMode("device")}
              className="block w-full rounded-md border border-black/15 px-3 py-3 text-left text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              <span className="font-medium">Scan or upload on this computer</span>
              <span className="block text-xs opacity-60">Webcam or a file from this device</span>
            </button>
            <button
              type="button"
              onClick={goPhone}
              className="block w-full rounded-md border border-black/15 px-3 py-3 text-left text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              <span className="font-medium">Use my phone</span>
              <span className="block text-xs opacity-60">
                Scan a QR code and photograph the receipt with your phone
              </span>
            </button>
          </div>
        )}

        {mode === "device" && (
          <ReceiptScanner
            endpoint="/api/receipts"
            purpose={purpose}
            targetId={targetId}
            onComplete={(r) => {
              router.refresh();
              onDone?.(r);
              close();
            }}
            onCancel={isCoarse ? undefined : () => setMode("choose")}
          />
        )}

        {mode === "phone" && (
          <div className="space-y-3 text-center">
            {linkErr ? <p className="text-sm text-red-600">{linkErr}</p> : null}
            {!link && !linkErr ? <p className="text-sm opacity-70">Generating a link…</p> : null}
            {link && !received ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={link.qrDataUrl} alt="Scan with your phone" className="mx-auto" />
                <p className="break-all text-xs opacity-50">{link.url}</p>
                <p className="text-sm opacity-70">
                  Scan with your phone&apos;s camera, then photograph the receipt. Waiting…
                </p>
              </>
            ) : null}
            {received ? (
              <p className="text-sm text-emerald-600">Receipt received from your phone.</p>
            ) : null}
            {!isCoarse ? (
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="text-xs underline opacity-60 hover:opacity-100"
              >
                Back
              </button>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}
