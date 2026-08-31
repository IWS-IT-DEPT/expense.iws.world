"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { codingRules, type CostingMode } from "@/lib/coding";

import { saveCoding, type SaveCodingState } from "../actions";

interface Option {
  id: string;
  name: string;
}
interface EntityOption extends Option {
  code: string;
  costingMode: string;
}
interface ScopedOption {
  id: string;
  entityId: string;
  label: string;
}

export function CodingForm({
  transactionId,
  cardOwnerEntityId,
  entities,
  locations,
  units,
  jobs,
  categories,
  initial,
}: {
  transactionId: string;
  cardOwnerEntityId: string;
  entities: EntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: ScopedOption[];
  jobs: ScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  initial?: {
    entityId: string;
    locationId: string;
    unitId: string | null;
    jobId: string | null;
    categoryId: string;
    businessPurpose: string;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SaveCodingState, FormData>(
    async (prev, fd) => {
      const result = await saveCoding(prev, fd);
      if (result.ok) router.push("/transactions");
      return result;
    },
    {},
  );

  const [entityId, setEntityId] = useState(initial?.entityId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");

  const entity = entities.find((e) => e.id === entityId);
  const category = categories.find((c) => c.id === categoryId);
  const rules = codingRules(
    (entity?.costingMode ?? "none") as CostingMode,
    category ? { requiresJobOrUnit: category.requiresJobOrUnit } : null,
  );

  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      const aHome = a.homeEntityId === entityId ? 0 : 1;
      const bHome = b.homeEntityId === entityId ? 0 : 1;
      return aHome - bHome || a.name.localeCompare(b.name);
    });
  }, [locations, entityId]);

  const entityUnits = units.filter((u) => u.entityId === entityId);
  const entityJobs = jobs.filter((j) => j.entityId === entityId);
  const intercompany = entityId && entityId !== cardOwnerEntityId;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="transactionId" value={transactionId} />

      <Field label="1. Who is this for?">
        <select
          name="entityId"
          required
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className={selectClass}
        >
          <option value="">Select entity…</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.code} — {e.name}
            </option>
          ))}
        </select>
        {intercompany ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Intercompany — this card is owned by another entity. Accounting will handle the due-to/due-from.
          </p>
        ) : null}
      </Field>

      <Field label="2. Which site?">
        <select name="locationId" required defaultValue={initial?.locationId ?? ""} className={selectClass}>
          <option value="">Select location…</option>
          {sortedLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.homeEntityId === entityId ? "" : "  (other)"}
            </option>
          ))}
        </select>
      </Field>

      {rules.needsUnit || rules.needsUnitOrJob ? (
        <Field label={rules.needsUnitOrJob ? "3. Which unit? (or pick a job below)" : "3. Which unit / truck?"}>
          <select
            name="unitId"
            required={rules.needsUnit}
            defaultValue={initial?.unitId ?? ""}
            className={selectClass}
          >
            <option value="">{rules.needsUnitOrJob ? "No unit" : "Select unit…"}</option>
            {entityUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {rules.needsJob || rules.needsUnitOrJob ? (
        <Field label={rules.needsUnitOrJob ? "3. …or which job?" : "3. Which job?"}>
          <select
            name="jobId"
            required={rules.needsJob}
            defaultValue={initial?.jobId ?? ""}
            className={selectClass}
          >
            <option value="">{rules.needsUnitOrJob ? "No job" : "Select job…"}</option>
            {entityJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="4. What kind of expense?">
        <select
          name="categoryId"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={selectClass}
        >
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="5. Why? (business purpose)">
        <textarea
          name="businessPurpose"
          required
          minLength={4}
          rows={2}
          defaultValue={initial?.businessPurpose ?? ""}
          placeholder="e.g. Fuel for the Houston delivery run"
          className={selectClass}
        />
      </Field>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Save coding"}
      </button>
    </form>
  );
}

const selectClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
