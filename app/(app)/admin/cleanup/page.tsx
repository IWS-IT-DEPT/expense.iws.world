import { asc } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { countsByUser } from "@/lib/cleanup";
import { requireRole } from "@/lib/current-user";

import { CleanupForm, type CleanupUser } from "./cleanup-form";

export const dynamic = "force-dynamic";

export default async function CleanupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await requireRole("admin");
  const sp = await searchParams;
  const [rows, counts] = await Promise.all([db.query.users.findMany({ orderBy: [asc(users.name)] }), countsByUser()]);

  const list: CleanupUser[] = rows.map((u) => {
    const c = counts.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      isMe: u.id === me.id,
      cardExpenses: c?.cardExpenses ?? 0,
      items: c?.items ?? 0,
      reports: c?.reports ?? 0,
      receipts: c?.receipts ?? 0,
      cards: c?.cards ?? 0,
    };
  });

  const done = sp.done === "accounts" || sp.done === "expenses";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Go-live cleanup</h2>
        <p className="text-sm opacity-70">
          Clear out test users and test expenses before going live. This permanently deletes data — use it once,
          carefully, then it&apos;s just here if you ever need it again.
        </p>
      </div>

      {done ? (
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
          <p className="font-semibold">Done.</p>
          <p>
            Removed {sp.done === "accounts" ? `${sp.users} user account(s), ` : ""}
            {sp.cardExpenses} card expense(s), {sp.items} out-of-pocket / mileage entr{sp.items === "1" ? "y" : "ies"},{" "}
            {sp.reports} weekly report(s) and {sp.receipts} receipt file(s).
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
        <p className="font-medium">Before you start</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Do this <strong>before</strong> clearing <code>EMAIL_REDIRECT_TO</code>, so nothing real is notified
            while you work.
          </li>
          <li>
            For a dry run, point a copy of the database (a Neon branch) at a preview deployment and try it there
            first.
          </li>
          <li>
            Your own real account should <strong>not</strong> be ticked for deletion — the tool won&apos;t let you
            delete yourself.
          </li>
        </ul>
      </div>

      <CleanupForm users={list} />
    </div>
  );
}
