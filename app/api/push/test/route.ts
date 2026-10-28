import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { pushConfigured, sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

/** "Send me a test notification" — only ever to the signed-in user's own devices. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }
  if (!pushConfigured) return NextResponse.json({ error: "Notifications aren't set up yet." }, { status: 503 });
  if (!(await rateLimit(`push-test:${user.id}`, 5, 10 * 60))) {
    return NextResponse.json({ error: "Too many tests — wait a few minutes." }, { status: 429 });
  }

  const delivered = await sendPushToUser(
    user.id,
    {
      title: "IWS Expense",
      body: "Notifications are working on this device.",
      url: "/expenses",
      tag: "test",
    },
    { force: true },
  );
  return NextResponse.json({ delivered });
}
