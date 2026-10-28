import Link from "next/link";

import { requireRole } from "@/lib/current-user";

import { inputClass } from "../../_ui";
import { upsertEntity } from "../../actions";

const modes = [
  ["none", "None — entity + location only"],
  ["unit", "Unit (trucks / equipment)"],
  ["job", "Job"],
  ["unit_or_job", "Unit or job"],
] as const;

export default async function NewEntityPage() {
  await requireRole("admin", "accounting");
  return (
    <div className="max-w-xl space-y-4">
      <Link href="/admin/entities" className="text-sm underline opacity-70">
        ← Entities
      </Link>
      <h2 className="text-base font-semibold">Add entity</h2>
      <form action={upsertEntity} className="space-y-4 text-sm">
        <input type="hidden" name="active" value="on" />
        <Field label="Code" hint="Short label shown on badges and reports, e.g. RGT. Letters, digits, - or _ (max 12). You can change it later.">
          <input
            name="code"
            required
            maxLength={12}
            pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,11}"
            className={`${inputClass} w-32 font-mono uppercase`}
          />
        </Field>
        <Field label="Name">
          <input name="name" required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Legal name" hint="Optional — as it appears on the QuickBooks company file.">
          <input name="legalName" className={`${inputClass} w-full`} />
        </Field>
        <Field label="Costing" hint="Decides whether the coding dropdowns require a truck/unit or a job.">
          <select name="costingMode" defaultValue="none" className={inputClass}>
            {modes.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Badge colour" hint="Hex, e.g. #2F9E5A. Optional.">
          <input name="brandColor" placeholder="#2F9E5A" className={`${inputClass} w-32`} />
        </Field>
        <button
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Create entity
        </button>
        <p className="text-xs opacity-60">After creating it you can set up QuickBooks for the entity.</p>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs opacity-60">{hint}</span> : null}
    </label>
  );
}
