import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { sendEmail } from "./email";
import { money } from "./format";

/**
 * Workflow notifications. Each swallows its own errors — a mail hiccup must not
 * break the action that triggered it. `EMAIL_REDIRECT_TO` (see lib/email.ts)
 * still applies to everything here.
 */

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");
const ACCOUNTING = process.env.MAIL_TO_ACCOUNTING?.trim() || "accounting@iws.world";

async function userEmail(userId: string): Promise<{ email: string; name: string } | null> {
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true, name: true },
  });
  return u ?? null;
}

async function safeSend(input: { to: string; subject: string; text: string }) {
  try {
    await sendEmail(input);
  } catch (err) {
    console.warn("[notify] send failed:", err instanceof Error ? err.message : err);
  }
}

/** Cardholder: something they submitted was sent back. */
export async function notifySentBack(userId: string, label: string, reason: string) {
  const u = await userEmail(userId);
  if (!u) return;
  await safeSend({
    to: u.email,
    subject: `Sent back: ${label}`,
    text: [
      `Hi ${u.name.split(" ")[0]},`,
      "",
      `Accounting sent this back to you:`,
      `  ${label}`,
      "",
      `Reason: ${reason}`,
      "",
      `Fix it and resubmit: ${APP_URL}/expenses`,
    ].join("\n"),
  });
}

/** Cardholder: something they submitted was approved. */
export async function notifyApproved(userId: string, label: string) {
  const u = await userEmail(userId);
  if (!u) return;
  await safeSend({
    to: u.email,
    subject: `Approved: ${label}`,
    text: [
      `Hi ${u.name.split(" ")[0]},`,
      "",
      `Good news — this has been approved:`,
      `  ${label}`,
      "",
      `${APP_URL}/expenses`,
    ].join("\n"),
  });
}

/** Accounting: a cardholder submitted new expense(s). */
export async function notifyAccountingSubmitted(
  fromName: string,
  description: string,
  totalCents: number,
) {
  await safeSend({
    to: ACCOUNTING,
    subject: `New expenses submitted — ${fromName}`,
    text: [
      `${fromName} submitted ${description} (${money(totalCents)}).`,
      "",
      `Reconcile: ${APP_URL}/reconcile`,
    ].join("\n"),
  });
}
