"use client";

import { useMemo, useState } from "react";

import { codingRules } from "@/lib/coding";

/**
 * The five dependent coding selects + business-purpose textarea, shared by the
 * transaction coding wizard (`transactions/[id]/coding-form.tsx`) and the Receipt
 * Bank pre-coding form. Emits plain form fields — `entityId`, `locationId`,
 * `jobId`, `categoryId`, `businessPurpose` — so any server action can
 * read it straight off `FormData`.
 */

export interface CodingEntityOption {
  id: string;
  code: string;
  name: string;
}
export interface CodingScopedOption {
  id: string;
  entityId: string;
  label: string;
}
export interface CodingFieldsProps {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJob: boolean }[];
  /** this person must code a job on every expense */
  userRequiresJob?: boolean;
  /** when set, an intercompany hint shows if a different entity is picked */
  cardOwnerEntityId?: string;
  /** false → the four always-needed fields aren't `required` (code-later flows) */
  required?: boolean;
  initial?: {
    entityId?: string | null;
    locationId?: string | null;
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
  jobs,
  categories,
  userRequiresJob,
  cardOwnerEntityId,
  required = true,
  initial,
}: CodingFieldsProps) {
  const [entityId, setEntityId] = useState(initial?.entityId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");

  const category = categories.find((c) => c.id === categoryId);
  const rules = codingRules({ categoryRequiresJob: category?.requiresJob, userRequiresJob });

  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      const aHome = a.homeEntityId === entityId ? 0 : 1;
      const bHome = b.homeEntityId === entityId ? 0 : 1;
      return aHome - bHome || a.name.localeCompare(b.name);
    });
  }, [locations, entityId]);

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

      <Field label="3. What kind of expense?">
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

      {rules.needsJob ? (
        <Field label="Which job?">
          <select
            name="jobId"
            required={required}
            defaultValue={initial?.jobId ?? ""}
            className={selectClass}
          >
            <option value="">Select job…</option>
            {entityJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
          {entityId && entityJobs.length === 0 ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              No jobs are set up for this company yet — ask Accounting to add it under Settings → Jobs.
            </p>
          ) : (
            <p className="mt-1 text-xs opacity-60">
              {userRequiresJob ? "You code a job on every expense." : "This category is a job / project expense."}
            </p>
          )}
        </Field>
      ) : null}

      <Field label="4. Why? (business purpose)">
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
