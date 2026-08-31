import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { storeReceipts } from "@/lib/receipt-store";
import type { UploadPurpose } from "@/lib/upload-token";

export const runtime = "nodejs";

const PURPOSES: UploadPurpose[] = ["txn", "pending", "bank", "item"];

/**
 * POST /api/receipts  (multipart form-data)
 *   purpose: "txn" | "pending" | "bank" | "item"
 *   targetId: uuid (omit for "bank")
 *   file: one or more receipt files (image/* or application/pdf)
 *
 * The logged-in / same-device upload path. The QR handoff uses
 * /api/receipt-upload with a signed token instead.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) {
        return NextResponse.json({ error: "Bad origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    }
  }

  const form = await req.formData();
  const purpose = String(form.get("purpose") || "");
  if (!PURPOSES.includes(purpose as UploadPurpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }
  const targetId = form.get("targetId") ? String(form.get("targetId")) : null;
  const files = form.getAll("file").filter((f): f is File => f instanceof File);

  const result = await storeReceipts({
    purpose: purpose as UploadPurpose,
    targetId,
    userId: user.id,
    files,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    receiptCount: result.receiptCount,
    pendingExpenseId: result.pendingExpenseId ?? null,
    transactionId: result.transactionId ?? null,
  });
}
