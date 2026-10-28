import { eq } from "drizzle-orm";

import { db } from "@/db";
import { policySettings } from "@/db/schema";

/**
 * Where the internal "something needs your attention" emails go. Editable by an
 * admin under Settings → Email (stored in `policy_settings`). Resolution order:
 *   1. the admin's saved setting      2. the MAIL_TO_* environment variable
 *   3. the built-in default below
 */

export type MailGroup = "accounting" | "payroll";

export const MAIL_GROUPS: Record<
  MailGroup,
  { key: string; env: string; fallback: string; label: string; help: string }
> = {
  accounting: {
    key: "mail_to_accounting",
    env: "MAIL_TO_ACCOUNTING",
    fallback: "accounting@iws.world",
    label: "Accounting",
    help: "Gets \"new card expenses to reconcile\".",
  },
  payroll: {
    key: "mail_to_payroll",
    env: "MAIL_TO_PAYROLL",
    fallback: "HR@iws.world",
    label: "Payroll / HR",
    help: "Gets \"new reimbursement to reconcile\" (mileage and out-of-pocket).",
  },
};

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/** Split "a@x.com, b@x.com; c@x.com" into valid, de-duplicated addresses (invalid ones reported). */
export function parseAddresses(text: string): { ok: string[]; bad: string[] } {
  const seen = new Set<string>();
  const ok: string[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!EMAIL_RE.test(raw)) {
      bad.push(raw);
      continue;
    }
    const key = raw.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ok.push(raw);
    }
  }
  return { ok, bad };
}

export interface ResolvedRecipients {
  addresses: string[];
  source: "setting" | "environment" | "default";
  /** the saved admin value, "" when none */
  saved: string;
}

export async function resolveRecipients(group: MailGroup): Promise<ResolvedRecipients> {
  const g = MAIL_GROUPS[group];
  let saved = "";
  try {
    const row = await db.query.policySettings.findFirst({ where: eq(policySettings.key, g.key) });
    if (typeof row?.value === "string") saved = row.value;
  } catch {
    // fall through to env/default — a settings read must never stop an email
  }
  const fromSetting = parseAddresses(saved).ok;
  if (fromSetting.length) return { addresses: fromSetting, source: "setting", saved };

  const fromEnv = parseAddresses(process.env[g.env] ?? "").ok;
  if (fromEnv.length) return { addresses: fromEnv, source: "environment", saved };

  return { addresses: [g.fallback], source: "default", saved };
}
