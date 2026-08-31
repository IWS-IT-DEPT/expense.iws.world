import { eq } from "drizzle-orm";

import { db } from "@/db";
import { pendingExpenses, receiptUploadSessions, transactions } from "@/db/schema";
import { money, shortDate } from "@/lib/format";
import { isPast, verifyUploadToken } from "@/lib/upload-token";

import { PhoneScanner } from "./phone-scanner";

export const dynamic = "force-dynamic";

function Expired() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold">Link expired</h1>
      <p className="mt-2 text-sm opacity-70">
        This upload link is no longer valid. Open the receipt dialog on your computer again for a
        fresh QR code.
      </p>
    </main>
  );
}

export default async function ReceiptUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyUploadToken(token);
  if (!payload) return <Expired />;

  const session = await db.query.receiptUploadSessions.findFirst({
    where: eq(receiptUploadSessions.id, payload.n),
  });
  if (
    !session ||
    session.userId !== payload.u ||
    session.status === "expired" ||
    isPast(session.expiresAt)
  ) {
    return <Expired />;
  }

  let label: string | undefined;
  if (payload.p === "txn" && payload.t) {
    const t = await db.query.transactions.findFirst({
      where: eq(transactions.id, payload.t),
      columns: { merchantRaw: true, amountCents: true, txnDate: true },
    });
    if (t) label = `${t.merchantRaw} · ${money(t.amountCents)} · ${shortDate(t.txnDate)}`;
  } else if (payload.p === "pending" && payload.t) {
    const p = await db.query.pendingExpenses.findFirst({
      where: eq(pendingExpenses.id, payload.t),
      columns: { merchant: true, amountCents: true, purchaseDate: true },
    });
    if (p) label = `${p.merchant} · ${money(p.amountCents)} · ${shortDate(p.purchaseDate)}`;
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Add a receipt</h1>
        <p className="text-sm opacity-70">
          Point your camera at the receipt, line up the corners, and send. It appears on the computer
          that showed the QR code.
        </p>
      </div>
      <PhoneScanner
        token={token}
        purpose={payload.p}
        targetId={payload.t ?? undefined}
        targetLabel={label}
      />
    </main>
  );
}
