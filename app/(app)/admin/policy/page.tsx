import { db } from "@/db";

import { inputClass, SaveButton, Section } from "../_ui";
import { updatePolicy } from "../actions";

export default async function AdminPolicyPage() {
  const rows = await db.query.policySettings.findMany();
  const p = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : d);

  return (
    <Section title="Policy">
      <form action={updatePolicy} className="max-w-md space-y-4 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Receipt required at/above ($)</span>
          <input
            name="receipt_threshold_cents"
            type="number"
            defaultValue={num("receipt_threshold_cents", 7500) / 100}
            className={inputClass}
          />
          <span className="ml-2 text-xs opacity-50">stored as cents; enter dollars</span>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Always surface for review at/above ($)</span>
          <input
            name="review_threshold_cents"
            type="number"
            defaultValue={num("review_threshold_cents", 50000) / 100}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Weekly report due (day of week, 0=Sun)</span>
          <input
            name="weekly_report_due_dow"
            type="number"
            min={0}
            max={6}
            defaultValue={num("weekly_report_due_dow", 1)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="auto_approve_clean" defaultChecked={p.auto_approve_clean === true} />
          <span>Auto-approve items with no exception flags</span>
        </label>
        <SaveButton />
      </form>
      <p className="text-xs opacity-60">
        Note: the dollar fields are divided/multiplied by 100 here; the action converts back to cents.
      </p>
    </Section>
  );
}
