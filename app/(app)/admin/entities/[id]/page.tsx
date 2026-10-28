import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cards, categories, dimensionMappings, entities, jobs, locations, units, users } from "@/db/schema";
import { entityBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { cardLabel } from "../../../expenses/coding-options";
import { DirtyForm } from "../../_dirty-form";
import { CodeField, DeleteEntityConfirm } from "./confirm-controls";
import { inputClass } from "../../_ui";
import { deleteEntity, saveQboMappings, saveQboSettings, upsertEntity } from "../../actions";

const modes = [
  ["none", "None — entity + location only"],
  ["unit", "Unit (trucks / equipment)"],
  ["job", "Job"],
  ["unit_or_job", "Unit or job"],
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function EntityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "accounting");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const e = await db.query.entities.findFirst({
    where: eq(entities.id, id),
    with: { qboSettings: true, qboConnection: true },
  });
  if (!e) notFound();

  const [blockers, cats, locs, entUnits, entJobs, cardRows, people, maps] = await Promise.all([
    entityBlockers(id),
    db.query.categories.findMany({ where: eq(categories.active, true), orderBy: [asc(categories.name)] }),
    db.query.locations.findMany({ where: eq(locations.active, true), orderBy: [asc(locations.name)] }),
    db.query.units.findMany({
      where: and(eq(units.entityId, id), eq(units.active, true)),
      orderBy: [asc(units.unitNumber)],
    }),
    db.query.jobs.findMany({
      where: and(eq(jobs.entityId, id), eq(jobs.active, true)),
      orderBy: [asc(jobs.jobNumber)],
    }),
    db.query.cards.findMany({ where: eq(cards.active, true), orderBy: [asc(cards.last4)], with: { user: true } }),
    db.query.users.findMany({ where: eq(users.active, true), orderBy: [asc(users.name)] }),
    db.query.dimensionMappings.findMany({ where: eq(dimensionMappings.entityId, id) }),
  ]);

  const mapped = new Map(maps.map((m) => [`${m.localType}:${m.localId}`, m.qboId]));
  const q = e.qboSettings;
  const conn = e.qboConnection;

  const env = {
    clientId: !!process.env.QBO_CLIENT_ID,
    clientSecret: !!process.env.QBO_CLIENT_SECRET,
    encKey: !!process.env.QBO_TOKEN_ENC_KEY,
  };
  const redirectUri = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/qbo/callback`;

  const mapGroups: {
    key: string;
    title: string;
    qbo: string;
    rows: { id: string; label: string; sub?: string }[];
    hidden?: boolean;
  }[] = [
    {
      key: "category",
      title: "Categories → QuickBooks accounts",
      qbo: "Account ID",
      rows: cats.map((c) => ({ id: c.id, label: c.name, sub: c.code })),
    },
    {
      key: "location",
      title: "Locations → QuickBooks locations",
      qbo: "Location ID",
      rows: locs.map((l) => ({ id: l.id, label: l.name, sub: l.code })),
      hidden: q ? !q.usesLocations : false,
    },
    {
      key: "unit",
      title: "Units → QuickBooks classes",
      qbo: "Class ID",
      rows: entUnits.map((u) => ({ id: u.id, label: u.unitNumber })),
      hidden: q ? !q.usesClasses : false,
    },
    {
      key: "job",
      title: `Jobs → QuickBooks ${q?.jobsAs === "customer" ? "customers" : "projects"}`,
      qbo: q?.jobsAs === "customer" ? "Customer ID" : "Project ID",
      rows: entJobs.map((j) => ({ id: j.id, label: j.jobNumber, sub: j.name ?? j.customerName ?? undefined })),
    },
    {
      key: "card",
      title: "Cards → credit-card accounts (overrides the default above)",
      qbo: "Account ID",
      rows: cardRows.map((c) => ({ id: c.id, label: cardLabel(c), sub: c.user?.name })),
    },
    {
      key: "user",
      title: "Employees → QuickBooks vendors (for reimbursement bills)",
      qbo: "Vendor ID",
      rows: people.map((u) => ({ id: u.id, label: u.name, sub: u.email })),
    },
  ].filter((g) => !g.hidden);

  const detailsKey = [e.code, e.name, e.legalName, e.costingMode, e.brandColor, e.active].join("|");
  const qboKey = q ? String(q.updatedAt.getTime()) : "none";
  const mapKey = maps.map((m) => `${m.localType}${m.localId}${m.qboId}`).sort().join(",");

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <Link href="/admin/entities" className="text-sm underline opacity-70">
          ← Entities
        </Link>
        <h2 className="mt-2 text-lg font-semibold">
          <span className="font-mono">{e.code}</span> · {e.name}
          {!e.active ? <span className="ml-2 text-sm font-normal opacity-60">(retired)</span> : null}
        </h2>
      </div>

      {/* ------------------------------------------------------ details */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Details</h3>
        <DirtyForm action={upsertEntity} resetKey={detailsKey} className="space-y-4 text-sm">
          <input type="hidden" name="id" value={e.id} />
          <div>
            <span className="mb-1 block font-medium">Code</span>
            <CodeField original={e.code} />
            <span className="mt-1 block text-xs opacity-60">
              Shown on badges, reports and exports. Changing it asks you to confirm first.
            </span>
          </div>
          <Field label="Name">
            <input name="name" defaultValue={e.name} required className={`${inputClass} w-full`} />
          </Field>
          <Field label="Legal name">
            <input name="legalName" defaultValue={e.legalName ?? ""} className={`${inputClass} w-full`} />
          </Field>
          <Field label="Costing" hint="Decides whether the coding dropdowns require a truck/unit or a job.">
            <select name="costingMode" defaultValue={e.costingMode} className={inputClass}>
              {modes.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Badge colour">
            <input name="brandColor" defaultValue={e.brandColor ?? ""} placeholder="#2F9E5A" className={`${inputClass} w-32`} />
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={e.active} />
            <span>
              Active <span className="text-xs opacity-60">— uncheck to retire it from the dropdowns without deleting history</span>
            </span>
          </label>
        </DirtyForm>
      </section>

      {/* --------------------------------------------------- quickbooks */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">QuickBooks company</h3>
        <p className="text-xs opacity-60">
          Each entity has its own QuickBooks Online company file. IDs come from QuickBooks (the number
          in the URL when you open an account, class, location, vendor or customer there).
        </p>

        <div className="rounded-lg border border-black/10 p-3 text-xs dark:border-white/15">
          <p className="font-medium">Connection &amp; app readiness</p>
          <ul className="mt-1 space-y-0.5">
            <li>
              Connection to QuickBooks: <strong>{conn?.status ?? "not connected"}</strong>
              {conn?.lastError ? <span className="text-red-600"> — {conn.lastError}</span> : null}
            </li>
            <li>Intuit app client ID: {env.clientId ? "set" : <strong>missing (QBO_CLIENT_ID)</strong>}</li>
            <li>Intuit app client secret: {env.clientSecret ? "set" : <strong>missing (QBO_CLIENT_SECRET)</strong>}</li>
            <li>Token encryption key: {env.encKey ? "set" : <strong>missing (QBO_TOKEN_ENC_KEY)</strong>}</li>
            <li>
              Redirect URI to register in the Intuit app: <code>{redirectUri}</code>
            </li>
          </ul>
          <p className="mt-2 opacity-70">
            The QuickBooks sign-in and the push to QuickBooks are not built yet. These settings are
            stored now so the integration can use them as soon as it is.
          </p>
        </div>

        <DirtyForm action={saveQboSettings} resetKey={qboKey} className="space-y-4 text-sm">
          <input type="hidden" name="entityId" value={e.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Realm ID (Company ID)" hint="Digits only. QuickBooks → Settings → Account and settings → Company.">
              <input name="realmId" defaultValue={q?.realmId ?? ""} inputMode="numeric" className={`${inputClass} w-full font-mono`} />
            </Field>
            <Field label="Company name in QuickBooks" hint="For checking you picked the right file.">
              <input name="companyName" defaultValue={q?.companyName ?? ""} className={`${inputClass} w-full`} />
            </Field>
            <Field label="Environment">
              <select name="environment" defaultValue={q?.environment ?? "sandbox"} className={inputClass}>
                <option value="sandbox">Sandbox (testing)</option>
                <option value="production">Production (real books)</option>
              </select>
            </Field>
            <Field label="When to send to QuickBooks">
              <select name="exportTrigger" defaultValue={q?.exportTrigger ?? "manual"} className={inputClass}>
                <option value="manual">Manually, when someone exports</option>
                <option value="on_approval">Automatically when approved</option>
              </select>
            </Field>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
            <legend className="px-1 text-xs font-medium opacity-70">How this company uses QuickBooks</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="usesClasses" defaultChecked={q?.usesClasses ?? true} />
              Class tracking is on (units post to Classes)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="usesLocations" defaultChecked={q?.usesLocations ?? true} />
              Location tracking is on (sites post to Locations)
            </label>
            <label className="flex items-center gap-2">
              Jobs post to
              <select name="jobsAs" defaultValue={q?.jobsAs ?? "project"} className={inputClass}>
                <option value="project">Projects</option>
                <option value="customer">Customers</option>
              </select>
            </label>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default credit-card account ID" hint="Liability account card purchases post against. Individual cards can override it below.">
              <input name="cardAccountQboId" defaultValue={q?.cardAccountQboId ?? ""} className={`${inputClass} w-full font-mono`} />
            </Field>
            <Field label="…account name" hint="Optional label.">
              <input name="cardAccountName" defaultValue={q?.cardAccountName ?? ""} className={`${inputClass} w-full`} />
            </Field>
            <Field label="Accounts Payable account ID" hint="Used for reimbursement bills.">
              <input name="apAccountQboId" defaultValue={q?.apAccountQboId ?? ""} className={`${inputClass} w-full font-mono`} />
            </Field>
            <Field label="…account name">
              <input name="apAccountName" defaultValue={q?.apAccountName ?? ""} className={`${inputClass} w-full`} />
            </Field>
            <Field label="Default vendor ID for card purchases" hint="Used when a merchant isn't matched to a vendor.">
              <input name="defaultVendorQboId" defaultValue={q?.defaultVendorQboId ?? ""} className={`${inputClass} w-full font-mono`} />
            </Field>
            <Field label="…vendor name">
              <input name="defaultVendorName" defaultValue={q?.defaultVendorName ?? ""} className={`${inputClass} w-full`} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea name="notes" defaultValue={q?.notes ?? ""} rows={2} className={`${inputClass} w-full`} />
          </Field>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={q?.enabled ?? false} />
            <span>
              Export this entity to QuickBooks{" "}
              <span className="text-xs opacity-60">— requires a Realm ID; stays off until you turn it on</span>
            </span>
          </label>
        </DirtyForm>
      </section>

      {/* --------------------------------------------------- mappings */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">QuickBooks mappings</h3>
        <p className="text-xs opacity-60">
          Match each of our dropdown values to the matching item in this company&apos;s QuickBooks.
          Leave blank for anything you don&apos;t use. A value must be mapped before charges coded to
          it can be exported.
        </p>
        <DirtyForm action={saveQboMappings} resetKey={mapKey} className="space-y-3 text-sm">
          <input type="hidden" name="entityId" value={e.id} />
          {mapGroups.map((g) => (
            <details key={g.key} className="rounded-lg border border-black/10 dark:border-white/15">
              <summary className="cursor-pointer px-3 py-2 font-medium">
                {g.title}{" "}
                <span className="text-xs font-normal opacity-60">
                  ({g.rows.filter((r) => mapped.has(`${g.key}:${r.id}`)).length}/{g.rows.length} mapped)
                </span>
              </summary>
              <div className="divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/15">
                {g.rows.length === 0 ? <p className="px-3 py-2 text-xs opacity-60">Nothing to map yet.</p> : null}
                {g.rows.map((r) => (
                  <label key={r.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      {r.label}
                      {r.sub ? <span className="ml-2 text-xs opacity-60">{r.sub}</span> : null}
                    </span>
                    <input
                      name={`map:${g.key}:${r.id}`}
                      defaultValue={mapped.get(`${g.key}:${r.id}`) ?? ""}
                      placeholder={g.qbo}
                      className={`${inputClass} w-36 font-mono`}
                    />
                  </label>
                ))}
              </div>
            </details>
          ))}
        </DirtyForm>
      </section>

      {/* ---------------------------------------------------- delete */}
      <section className="space-y-2 border-t border-black/10 pt-6 dark:border-white/15">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Remove entity</h3>
        {blockers.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p>
              This entity can&apos;t be deleted because deleting it would erase or orphan:
            </p>
            <ul className="list-disc pl-5">
              {blockers.map((b) => (
                <li key={b.label}>
                  {b.count} {b.label}
                </li>
              ))}
            </ul>
            <p className="opacity-70">
              To stop using it, uncheck <strong>Active</strong> above and save — it disappears from all
              dropdowns and keeps its history. Once its sites, units, jobs and people are moved or
              removed (and no expenses reference it), you can delete it here.
            </p>
          </div>
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-red-700 underline dark:text-red-400">Delete this entity…</summary>
            <div className="mt-3">
              <DeleteEntityConfirm
                id={e.id}
                code={e.code}
                name={e.name}
                mappingCount={maps.length}
                hasQboSettings={!!q}
                action={deleteEntity}
              />
            </div>
          </details>
        )}
      </section>
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
