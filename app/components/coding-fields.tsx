"use client";

import { useMemo, useState } from "react";

import { codingRules, type CostingMode } from "@/lib/coding";

/**
 * The five dependent coding selects + business-purpose textarea, shared by the
 * transaction coding wizard (`transactions/[id]/coding-form.tsx`) and the Receipt
 * Bank pre-coding form. Emits plain form fields — `entityId`, `locationId`,
 * `unitId`, `jobId`, `categoryId`, `businessPurpose` — so any server action can
 * read it straight off `FormData`.
 */

export interface CodingEntityOption {
  id: string;
  code: string;
  name: string;
  costingMode: string;
}
export interface CodingScopedOption {
  id: string;
  entityId: string;
  label: string;
}
export interface CodingFieldsProps {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  /** when set, an intercompany hint shows if a different entity is picked */
  cardOwnerEntityId?: string;
  /** false → the four always-needed fields aren't `required` (code-later flows) */
  required?: boolean;
  initial?: {
    entityId?: string | null;
    locationId?: string | null;
    unitId?: string | null;
    jobId?: string | null;
    categoryId?: string | null;
    businessPurpose?: string | null;
  };
}

export const selectClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function CodingFields({
  entities,
  locations,
  units,
  jobs,
  categories,
  cardOwnerEntityId,
  required = true,
  initial,
}: CodingFieldsProps) {
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
  const intercompany = !!cardOwnerEntityId && !!entityId && entityId !== cardOwnerEntityId;

  return (
    <>
      <Field label="1. Who is this for?">
        <select
          name="entityId"
          required={required}
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
            Intercompany — this card is owned by another entity. Accounting will handle the
            due-to/due-from.
          </p>
        ) : null}
      </Field>

      <Field label="2. Which site?">
        <select
          name="locationId"
          required={required}
          defaultValue={initial?.locationId ?? ""}
          className={selectClass}
        >
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
        <Field
          label={rules.needsUnitOrJob ? "3. Which unit? (or pick a job below)" : "3. Which unit / truck?"}
        >
          <select
            name="unitId"
            required={required && rules.needsUnit}
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
            required={required && rules.needsJob}
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
          required={required}
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
          required={required}
          minLength={4}
          rows={2}
          defaultValue={initial?.businessPurpose ?? ""}
          placeholder="e.g. Fuel for the Houston delivery run"
          className={selectClass}
        />
      </Field>
    </>
  );
}
