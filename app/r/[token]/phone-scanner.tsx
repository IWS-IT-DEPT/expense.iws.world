"use client";

import { useState } from "react";

import { ReceiptScanner } from "@/app/components/receipt-scanner";
import type { UploadPurpose } from "@/lib/upload-token";

export function PhoneScanner({
  token,
  purpose,
  targetId,
  targetLabel,
}: {
  token: string;
  purpose: UploadPurpose;
  targetId?: string;
  targetLabel?: string;
}) {
  const [count, setCount] = useState(0);

  if (count > 0) {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          {count} receipt{count > 1 ? "s" : ""} sent. It&apos;s now on your computer.
        </p>
        <button
          type="button"
          onClick={() => setCount(0)}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Send another
        </button>
        <p className="opacity-60">You can close this tab.</p>
      </div>
    );
  }

  return (
    <ReceiptScanner
      endpoint="/api/receipt-upload"
      token={token}
      purpose={purpose}
      targetId={targetId}
      targetLabel={targetLabel}
      onComplete={(r) => setCount((c) => c + (r.receiptCount || 1))}
    />
  );
}
