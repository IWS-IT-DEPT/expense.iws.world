import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { sendEmail } from "./email";
import { renderEmail, type EmailContent } from "./email-template";
import { money } from "./format";
import { resolveRecipients } from "./mail-settings";
import { sendPushToUser } from "./push";

/**
 * Workflow notifications. Each swallows its own errors — a mail hiccup must not
 * break the action that triggered it. `EMAIL_REDIRECT_TO` (see lib/email.ts)
 * still applies to everything here.
 */

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

async function userEmail(
  userId: string,
): Promise<{ email: string; name: string; role: string } | null> {
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true, name: true, role: true },
  });
  return u ?? null;
}

/** What each role means, in the words used in the welcome email. */
const ROLE_INTRO: Record<string, { title: string; text: string }> = {
  cardholder: {
    title: "Employee",
    text: "You can log your own company-card purchases, out-of-pocket expenses and mileage, attach receipts, and submit them. If you're also on the IT, Finance or HR team in Microsoft 365, those extra sections appear in Help on their own the first time you sign in.",
  },
  approver: {
    title: "Approver",
    text: "On top of logging your own expenses, you review company-card charges after Accounting has checked them and give final approval (Accounting section → Reconcile and Approvals).",
  },
  accounting: {
    title: "Accounting",
    text: "On top of logging your own expenses, you reconcile company-card charges against the statement (your own too — approval still comes from someone else), run the card-spend reports, and maintain the shared lists (companies, locations, units, jobs and categories).",
  },
  payroll: {
    title: "Payroll",
    text: "On top of logging your own expenses, you reconcile and approve everyone's mileage and out-of-pocket reimbursements (your own lines too — approval of your own report still comes from someone else) and run the reimbursement reports (Payroll section).",
  },
  admin: {
    title: "Administrator",
    text: "You're an administrator of IWS Expense. You have access to everything: your own expenses, the Accounting and Payroll queues, and Settings — where you add and manage people, assign roles, set up the companies and their QuickBooks details, and choose who receives the alert emails.",
  },
};

async function safeSend(to: string | string[], subject: string, content: EmailContent) {
  try {
    const { html, text } = renderEmail(content);
    await sendEmail({ to, subject, text, html });
  } catch (err) {
    console.warn("[notify] send failed:", err instanceof Error ? err.message : err);
  }
}

/** Submitter: something they turned in was sent back. `by` names the team. */
export async function notifySentBack(
  userId: string,
  label: string,
  reason: string,
  by: "Accounting" | "Payroll" = "Accounting",
) {
  const u = await userEmail(userId);
  if (!u) return;
  // Push if they've turned it on; otherwise (or if it can't be delivered) email.
  const delivered = await sendPushToUser(userId, {
    title: `Sent back: ${label}`,
    body: `${by}: ${reason}`,
    url: "/expenses",
    tag: "sent-back",
  });
  if (delivered > 0) return;
  await safeSend(u.email, `Sent back: ${label}`, {
    accent: "amber",
    preheader: `${by} sent ${label} back to you`,
    heading: "An expense was sent back",
    paragraphs: [
      `Hi ${u.name.split(" ")[0]},`,
      `${by} sent this back for a change: ${label}.`,
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

/** Accounting: a cardholder submitted new card expense(s). */
export async function notifyAccountingSubmitted(
  fromName: string,
  description: string,
  totalCents: number,
) {
  await safeSend((await resolveRecipients("accounting")).addresses, `New expenses submitted — ${fromName}`, {
    accent: "blue",
    preheader: `${fromName} submitted ${description}`,
    heading: "New expenses to reconcile",
    paragraphs: [`${fromName} submitted ${description}, totalling ${money(totalCents)}.`],
    cta: { label: "Open the reconcile queue", url: `${APP_URL}/reconcile` },
  });
}

/** Payroll: an employee submitted a reimbursement report (mileage + OOP). */
export async function notifyPayrollSubmitted(
  fromName: string,
  description: string,
  totalCents: number,
) {
  await safeSend((await resolveRecipients("payroll")).addresses, `Reimbursement submitted — ${fromName}`, {
    accent: "blue",
    preheader: `${fromName} submitted ${description}`,
    heading: "New reimbursement to reconcile",
    paragraphs: [`${fromName} submitted ${description}, totalling ${money(totalCents)}.`],
    cta: { label: "Open the payroll reconcile queue", url: `${APP_URL}/payroll/reconcile` },
  });
}

/**
 * New person: how to sign in, put the app on their phone/computer, and where
 * the guide for their access lives. We can't know their phone, so both iPhone
 * and Android steps go in. Returns false if there was nobody to send to.
 */
export async function notifyWelcome(userId: string): Promise<boolean> {
  const u = await userEmail(userId);
  if (!u) return false;
  const host = APP_URL.replace(/^https?:\/\//, "") || "expense.iws.world";
  const role = ROLE_INTRO[u.role] ?? ROLE_INTRO.cardholder;
  await safeSend(u.email, "Welcome to IWS Expense — get set up in 2 minutes", {
    accent: "green",
    preheader: "Sign in, add the app to your phone, and find your how-to guide",
    heading: `Welcome to IWS Expense, ${u.name.split(" ")[0]}`,
    paragraphs: [
      "You've been added to IWS Expense, where you log company-card purchases, out-of-pocket expenses and mileage — receipts included.",
      `Your role: ${role.title}. ${role.text}`,
      `Sign in at ${host} with your Microsoft 365 work account (the same one you use for email). Then put the app on your phone so it's one tap away:`,
    ],
    sections: [
      {
        title: "Add it to your iPhone",
        steps: [
          `Open ${host} in Safari. (If you tapped a link inside Outlook or Teams, choose "Open in Safari" first.)`,
          "Tap the Share button — the square with an arrow.",
          'Scroll down and tap "Add to Home Screen", then "Add".',
          "Open IWS Expense from your home screen and sign in with Microsoft.",
        ],
      },
      {
        title: "Add it to your Android phone",
        steps: [
          `Open ${host} in Chrome and sign in.`,
          'Tap "Install" on the green banner at the top — or tap the ⋮ menu, then "Install app" / "Add to Home screen".',
          "Open IWS Expense from your home screen.",
        ],
      },
      {
        title: "On a Windows computer",
        steps: [
          `Open ${host} in Microsoft Edge or Chrome and sign in.`,
          'Click the install icon at the right end of the address bar (or menu → Apps → "Install IWS Expense").',
        ],
      },
      ...(u.role === "admin"
        ? [
            {
              title: "Your administrator tools (Settings, in the top bar)",
              steps: [
                "Users — add people and set their role. Nobody can sign in until you add them. Roles follow their Microsoft 365 groups by default; Admin only ever comes from membership of the admin group — it can't be assigned inside the app.",
                "Roles & groups — map each Microsoft 365 group to a role (including the admin group), and check what role an email address would get.",
                "Email — choose who receives the Accounting and Payroll alert emails, and send a test.",
                "Entities — each company's details, codes and QuickBooks setup.",
                "Errors and Policy — see anything that has gone wrong, and set the receipt-required amount.",
              ],
            },
          ]
        : []),
      {
        title: "Learn how to use it",
        steps: [
          `Once you're signed in, tap "Help" at the top of any screen. It opens with the employee guide${u.role === "cardholder" ? "" : ` and has a section for your ${role.title} role`} — and shows more sections if you're later given extra access.`,
          "The same page has the install steps above and a switch to turn on notifications, so you'll know right away if something is sent back.",
        ],
      },
    ],
    cta: { label: "Open IWS Expense", url: `${APP_URL}/expenses` },
    secondaryCta: { label: "Go straight to the how-to guide", url: `${APP_URL}/help` },
    callout: {
      label: "Need help?",
      text: "If you can't sign in or something looks wrong, contact IT.",
    },
  });
  return true;
}
