import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses, reminderSends, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
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
    subject: "Your weekly expense report is due Friday",
    lead: "Heads-up — your weekly expense report is due end of day Friday.",
  },
  fri_am: {
    subject: "Your weekly expense report is due today",
    lead: "Your weekly expense report is due today, end of day.",
  },
  fri_pm: {
    subject: "Last call: weekly expense report due end of day",
    lead: "Last call — your weekly expense report is due by end of day today.",
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

  const { start } = weekBounds(new Date());
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");

  // active users with ≥1 active card who haven't filed this week's report
  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        inArray(users.role, ["cardholder", "approver", "accounting", "admin"]),
        sql`exists (select 1 from cards c where c.user_id = ${users.id} and c.active = true)`,
        sql`not exists (
          select 1 from expense_reports er
          where er.user_id = ${users.id}
            and er.period_start = ${start}
            and er.status in ('submitted','reconciled','approved')
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
        n: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('draft','rejected') and ${pendingExpenses.reportId} is null)`,
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
    const text = [
      `Hi ${u.name.split(" ")[0]},`,
      "",
      c.lead,
      pending > 0
        ? `You have ${pending} expense${pending === 1 ? "" : "s"} logged that aren't submitted yet.`
        : `You haven't logged any expenses for this week yet.`,
      "",
      `Review and submit: ${appUrl}/report`,
    ].join("\n");

    await sendEmail({ to: u.email, subject: c.subject, text });
    sent++;
  }

  return NextResponse.json({ slot, periodStart: start, considered: recipients.length, sent, ...(dry ? { list } : {}) });
}
