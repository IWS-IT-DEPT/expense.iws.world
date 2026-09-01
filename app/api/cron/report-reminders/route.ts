import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses, reminderSends, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { weekBounds } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Slot = "wed_am" | "fri_am" | "fri_pm";

const APP_TZ = process.env.APP_TZ ?? "America/Chicago";

/** Current weekday (0=Sun) in APP_TZ. */
function dowInTz(): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" }).format(
    new Date(),
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/**
 * Vercel cron is UTC-only, and the Hobby plan allows only 2 daily jobs — so
 * `vercel.json` runs two daily jobs and the **day of week in APP_TZ** picks the
 * slot (the exact minute doesn't matter for a reminder). The two UTC schedules
 * are set for US Central:
 *   ?window=am  13:00 UTC → 8:00 AM CDT / 7:00 AM CST
 *   ?window=pm  20:00 UTC → 3:00 PM CDT / 2:00 PM CST
 * i.e. exact during daylight time (Mar–Nov) and one hour earlier during standard
 * time. Hobby cron firing can also slip up to ~1h. Good enough for a nudge.
 */
function slotForWindow(window: string | null): Slot | null {
  const dow = dowInTz();
  if (window === "am") {
    if (dow === 3) return "wed_am";
    if (dow === 5) return "fri_am";
  }
  if (window === "pm" && dow === 5) return "fri_pm";
  return null;
}

const COPY: Record<Slot, { subject: string; lead: string }> = {
  wed_am: {
    subject: "Expenses due Friday",
    lead: "Heads-up — all of this week's expenses must be submitted by end of day Friday.",
  },
  fri_am: {
    subject: "Expenses due today",
    lead: "All of this week's expenses must be submitted by end of day today.",
  },
  fri_pm: {
    subject: "Last call — expenses due end of day",
    lead: "Last call — every expense for this week must be submitted by end of day today.",
  },
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.has("dry");
  const slot =
    (url.searchParams.get("slot") as Slot | null) ?? slotForWindow(url.searchParams.get("window"));
  if (!slot) {
    return NextResponse.json({ skipped: "no slot", tz: APP_TZ, dow: dowInTz() });
  }

  const { start, end } = weekBounds(new Date());
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");

  // active users who still have something unsubmitted (card draft/rejected, or an
  // out-of-pocket / mileage item not yet on a report) dated this week or earlier
  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        inArray(users.role, ["cardholder", "approver", "accounting", "admin"]),
        sql`(
          exists (
            select 1 from pending_expenses pe
            where pe.user_id = ${users.id}
              and pe.status in ('draft','rejected')
              and pe.purchase_date <= ${end}
          )
          or exists (
            select 1 from expense_items ei
            where ei.user_id = ${users.id}
              and ei.status in ('draft','rejected')
              and ei.report_id is null
              and ei.item_date <= ${end}
          )
        )`,
      ),
    );

  let sent = 0;
  const list: string[] = [];

  for (const u of recipients) {
    list.push(u.email);
    if (dry) continue;

    const inserted = await db
      .insert(reminderSends)
      .values({ userId: u.id, periodStart: start, slot })
      .onConflictDoNothing({
        target: [reminderSends.userId, reminderSends.periodStart, reminderSends.slot],
      })
      .returning({ id: reminderSends.id });
    if (inserted.length === 0) continue; // already sent this slot

    const [cardAgg] = await db
      .select({
        n: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('draft','rejected'))`,
      })
      .from(pendingExpenses)
      .where(eq(pendingExpenses.userId, u.id));
    const [itemAgg] = await db
      .select({
        n: sql<number>`count(*) filter (where ${expenseItems.status} in ('draft','rejected') and ${expenseItems.reportId} is null)`,
      })
      .from(expenseItems)
      .where(eq(expenseItems.userId, u.id));

    const pending = Number(cardAgg.n) + Number(itemAgg.n);
    const c = COPY[slot];
    const { html, text } = renderEmail({
      accent: slot === "wed_am" ? "amber" : "red",
      preheader: c.lead,
      heading: c.subject,
      paragraphs: [
        `Hi ${u.name.split(" ")[0]},`,
        c.lead,
        `You have ${pending} expense${pending === 1 ? "" : "s"} that ${pending === 1 ? "hasn't" : "haven't"} been submitted yet.`,
      ],
      cta: { label: "Finish and submit", url: `${appUrl}/report` },
    });

    await sendEmail({ to: u.email, subject: c.subject, text, html });
    sent++;
  }

  return NextResponse.json({ slot, periodStart: start, considered: recipients.length, sent, ...(dry ? { list } : {}) });
}
