"use client";

import { useState } from "react";

import { ConfirmAction } from "@/app/components/confirm-action";

import { sendTestMail } from "../actions";

/** Sends a clearly-labelled test message to one recipient group, after a confirm. */
export function SendTestButton({ group, label, to }: { group: string; label: string; to: string[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <ConfirmAction
        tone="primary"
        label={`Send test to ${label}`}
        confirmLabel="Yes, send the test"
        question={
          <>
            Email a test message to <strong>{to.join(", ")}</strong>?
          </>
        }
        run={async () => {
          const fd = new FormData();
          fd.set("group", group);
          const r = await sendTestMail(fd);
          setMsg(r.ok ? `✓ Test sent to ${to.join(", ")}.` : `Couldn't send: ${r.error}`);
        }}
      />
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}
