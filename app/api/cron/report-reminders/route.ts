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

/** Current weekday (0=Sun) + hour in APP_TZ. */
function nowInTz(): { dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { dow, hour: Number(hourStr) % 24 };
}

function slotForNow(): Slot | null {
  const { dow, hour } = nowInTz();
  if (dow === 3 && hour === 8) return "wed_am";
  if (dow === 5 && hour === 8) return "fri_am";
  if (dow === 5 && hour === 15) return "fri_pm";
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
  const slot = (url.searchParams.get("slot") as Slot | null) ?? slotForNow();
  if (!slot) return NextResponse.json({ skipped: "no slot", tz: APP_TZ, ...nowInTz() });

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
