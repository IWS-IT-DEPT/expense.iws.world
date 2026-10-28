"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * A form whose Save button only appears once something has changed.
 * Compares the current field values to what they were when it mounted; typing
 * something and then undoing it hides the button again. After a save the page
 * re-renders with new defaults — pass a `resetKey` that changes with them so the
 * baseline resets.
 */
function snapshot(form: HTMLFormElement): string {
  const parts: string[] = [];
  for (const [k, v] of new FormData(form).entries()) {
    parts.push(`${k}=${typeof v === "string" ? v : v.name}`);
  }
  return parts.join("&");
}

export function DirtyForm({
  action,
  children,
  resetKey,
  saveLabel = "Save changes",
  className = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  resetKey?: string;
  saveLabel?: string;
  className?: string;
}) {
  return (
    <DirtyFormInner key={resetKey} action={action} saveLabel={saveLabel} className={className}>
      {children}
    </DirtyFormInner>
  );
}

function DirtyFormInner({
  action,
  children,
  saveLabel,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  saveLabel: string;
  className: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const base = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function check() {
    const form = ref.current;
    if (!form) return;
    if (base.current === null) base.current = snapshot(form);
    setDirty(snapshot(form) !== base.current);
  }

  return (
    <form
      ref={ref}
      action={action}
      className={className}
      onFocusCapture={() => {
        // Baseline taken on first interaction so defaults are fully applied.
        if (base.current === null && ref.current) base.current = snapshot(ref.current);
      }}
      onInput={check}
      onChange={check}
    >
      {children}
      {dirty ? (
        <div className="sticky bottom-3 z-10 mt-4 flex items-center gap-3 rounded-lg border border-black/15 bg-white/95 px-4 py-2.5 shadow-md backdrop-blur dark:border-white/20 dark:bg-neutral-900/95">
          <span className="text-sm opacity-70">You have unsaved changes.</span>
          <button
            type="submit"
            className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {saveLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
