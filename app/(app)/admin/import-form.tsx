"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ImportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/imports", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setResult(`Error: ${json.error ?? res.statusText}`);
      return;
    }
    setResult(
      `Parsed ${json.parsed}, inserted ${json.inserted}, skipped ${json.duplicatesSkipped} duplicates` +
        (json.unparseableRows?.length ? `, ${json.unparseableRows.length} unparseable rows` : ""),
    );
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h3 className="font-medium">Import a statement CSV</h3>
      <select
        name="cardAccountId"
        required
        className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
      >
        <option value="">Select card account…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Importing…" : "Import"}
      </button>
      {result && <p className="text-sm opacity-80">{result}</p>}
    </form>
  );
}
