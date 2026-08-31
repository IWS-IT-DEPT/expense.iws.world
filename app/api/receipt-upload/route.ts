import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { receiptUploadSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { storeReceipts } from "@/lib/receipt-store";
import { verifyUploadToken } from "@/lib/upload-token";

export const runtime = "nodejs";

/**
 * Public receipt upload for the desktop→phone QR handoff. Authenticated by the
 * signed token in the request body, not a session cookie — so it's excluded from
 * the auth proxy (see proxy.ts).
 *
 *   POST  multipart: token, file[]   → stores receipts against the token's target
 *   GET   ?nonce=<id>                → desktop poll for {status, receiptCount}
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") || "");
  const payload = verifyUploadToken(token);
  if (!payload) return NextResponse.json({ error: "Link expired." }, { status: 401 });

  const session = await db.query.receiptUploadSessions.findFirst({
    where: eq(receiptUploadSessions.id, payload.n),
  });
  if (!session || session.userId !== payload.u) {
    return NextResponse.json({ error: "Link expired." }, { status: 401 });
  }
  if (session.status === "expired" || session.expiresAt.getTime() < Date.now()) {
    await db
      .update(receiptUploadSessions)
      .set({ status: "expired" })
      .where(eq(receiptUploadSessions.id, session.id));
    return NextResponse.json({ error: "Link expired." }, { status: 401 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const result = await storeReceipts({
    purpose: payload.p,
    targetId: payload.t,
    userId: payload.u,
    files,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await db
    .update(receiptUploadSessions)
    .set({
      status: "uploaded",
      receiptCount: session.receiptCount + result.receiptCount,
      ...(result.pendingExpenseId ? { createdPendingExpenseId: result.pendingExpenseId } : {}),
    })
    .where(eq(receiptUploadSessions.id, session.id));

  return NextResponse.json({ ok: true, receiptCount: result.receiptCount });
}

export async function GET(req: Request) {
  const nonce = new URL(req.url).searchParams.get("nonce");
  if (!nonce) return NextResponse.json({ error: "Missing nonce" }, { status: 400 });

  const session = await db.query.receiptUploadSessions.findFirst({
    where: eq(receiptUploadSessions.id, nonce),
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user || user.id !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let status = session.status;
  if (status === "pending" && session.expiresAt.getTime() < Date.now()) {
    status = "expired";
    await db
      .update(receiptUploadSessions)
      .set({ status: "expired" })
      .where(eq(receiptUploadSessions.id, session.id));
  }

  return NextResponse.json(
    {
      status,
      receiptCount: session.receiptCount,
      createdPendingExpenseId: session.createdPendingExpenseId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
