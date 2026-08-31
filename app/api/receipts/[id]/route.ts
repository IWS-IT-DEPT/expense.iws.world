import { eq } from "drizzle-orm";

import { db } from "@/db";
import { receipts } from "@/db/schema";
import { canReview, getCurrentUser } from "@/lib/current-user";
import { blobStore } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/receipts/:id  — streams the receipt bytes to an authorized viewer.
 * `?download=1` forces a save dialog instead of inline display.
 *
 * Blob URLs are never exposed; this is the only path to receipt content.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { id } = await params;
  const receipt = await db.query.receipts.findFirst({
    where: eq(receipts.id, id),
    with: {
      transaction: { columns: { assignedUserId: true } },
      expenseItem: { columns: { userId: true } },
      pendingExpense: { columns: { userId: true } },
    },
  });
  // 404 (not 403) on any failure so receipt ids can't be probed.
  if (!receipt) return new Response("Not found", { status: 404 });

  const ownerId =
    receipt.transaction?.assignedUserId ??
    receipt.expenseItem?.userId ??
    receipt.pendingExpense?.userId ??
    null;
  const allowed =
    receipt.uploadedById === user.id || ownerId === user.id || canReview(user);
  if (!allowed) return new Response("Not found", { status: 404 });

  const blob = await blobStore.get(receipt.blobKey);
  if (!blob) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.has("download");
  const filename = receipt.filename.replace(/["\\\r\n]/g, "");
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
