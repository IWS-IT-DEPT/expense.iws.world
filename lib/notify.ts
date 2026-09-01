import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { sendEmail } from "./email";
import { renderEmail, type EmailContent } from "./email-template";
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

async function safeSend(to: string, subject: string, content: EmailContent) {
  try {
    const { html, text } = renderEmail(content);
    await sendEmail({ to, subject, text, html });
  } catch (err) {
    console.warn("[notify] send failed:", err instanceof Error ? err.message : err);
  }
}

/** Cardholder: something they submitted was sent back. */
export async function notifySentBack(userId: string, label: string, reason: string) {
  const u = await userEmail(userId);
  if (!u) return;
  await safeSend(u.email, `Sent back: ${label}`, {
    accent: "amber",
    preheader: `Accounting sent ${label} back to you`,
    heading: "An expense was sent back",
    paragraphs: [
      `Hi ${u.name.split(" ")[0]},`,
      `Accounting sent this back for a change: ${label}.`,
    ],
    callout: { label: "Reason", text: reason },
    cta: { label: "Fix and resubmit", url: `${APP_URL}/expenses` },
  });
}

/** Cardholder: something they submitted was approved. */
export async function notifyApproved(userId: string, label: string) {
  const u = await userEmail(userId);
  if (!u) return;
  await safeSend(u.email, `Approved: ${label}`, {
    accent: "green",
    preheader: `${label} has been approved`,
    heading: "Approved",
    paragraphs: [
      `Hi ${u.name.split(" ")[0]},`,
      `Good news — ${label} has been approved. Nothing more for you to do.`,
    ],
    cta: { label: "View your expenses", url: `${APP_URL}/expenses` },
  });
}

/** Accounting: a cardholder submitted new expense(s). */
export async function notifyAccountingSubmitted(
  fromName: string,
  description: string,
  totalCents: number,
) {
  await safeSend(ACCOUNTING, `New expenses submitted — ${fromName}`, {
    accent: "blue",
    preheader: `${fromName} submitted ${description}`,
    heading: "New expenses to reconcile",
    paragraphs: [`${fromName} submitted ${description}, totalling ${money(totalCents)}.`],
    cta: { label: "Open the reconcile queue", url: `${APP_URL}/reconcile` },
  });
}
