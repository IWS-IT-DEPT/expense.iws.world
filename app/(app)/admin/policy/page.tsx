import { db } from "@/db";
import { requireRole } from "@/lib/current-user";

import { inputClass, SaveButton, Section } from "../_ui";
import { updatePolicy } from "../actions";

export default async function AdminPolicyPage() {
  await requireRole("admin");
  const rows = await db.query.policySettings.findMany();
  const p = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const cents =
    typeof p.receipt_threshold_cents === "number" ? p.receipt_threshold_cents : 7500;

  return (
    <Section title="Policy">
      <form action={updatePolicy} className="max-w-md space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Receipt required at/above ($)</span>
          <input
            name="receipt_threshold"
            type="number"
            min={0}
            step="1"
            defaultValue={cents / 100}
            className={inputClass}
          />
          <span className="mt-1 block text-xs opacity-60">
            Card purchases and out-of-pocket items at or above this amount can&apos;t be submitted
            without a receipt. Mileage never requires one.
          </span>
        </label>
        <SaveButton />
      </form>
    </Section>
  );
}
