import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

/**
 * The server later POSTs to whatever endpoint is stored, so only accept the
 * browsers' real push services over https — never an arbitrary (or internal) URL.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
function isPushServiceUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

const SubscribeBody = z.object({
  endpoint: z.url().max(2000).refine(isPushServiceUrl, "Not a push service address"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(6).max(100) }),
});

async function session(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) return null;
  // Same-origin only (cookie-authenticated, state-changing).
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) return null;
    } catch {
      return null;
    }
  }
  return user;
}

/** Save this device's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const user = await session(req);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const parsed = SubscribeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  // A device belongs to whoever is signed in on it now (shared phones, re-sign-ins).
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    });
  return NextResponse.json({ ok: true });
}

/** Remove this device's subscription (turn notifications off). */
export async function DELETE(req: Request) {
  const user = await session(req);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, user.id)));
  return NextResponse.json({ ok: true });
}
