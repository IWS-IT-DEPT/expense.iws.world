/**
 * One-time: move receipts from the old PUBLIC Vercel Blob store into the new
 * PRIVATE store and repoint `receipts.blob_key`.
 *
 *   BLOB_READ_WRITE_TOKEN=<private store token> \
 *   DATABASE_URL=... npx tsx scripts/migrate-receipts-private.ts [--apply]
 *
 * Dry run by default. Safe to re-run: rows already in the private store are
 * skipped. Old blobs are NOT deleted — delete the public store from the Vercel
 * dashboard once you've verified receipts still open.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const apply = process.argv.includes("--apply");
  const priv = process.env.BLOB_READ_WRITE_TOKEN;
  if (!priv) throw new Error("BLOB_READ_WRITE_TOKEN is required");

  const { db } = await import("../db");
  const { receipts } = await import("../db/schema");

  const rows = await db.select().from(receipts);
  let moved = 0;
  let skipped = 0;
  for (const r of rows) {
    // Only legacy rows: full public blob URLs (local-disk keys aren't URLs).
    if (!/^https?:\/\//.test(r.blobKey) || r.blobKey.includes(".private.")) {
      skipped++;
      continue;
    }
    const res = await fetch(r.blobKey);
    if (!res.ok) {
      console.warn(`skip ${r.id}: legacy fetch ${res.status}`);
      skipped++;
      continue;
    }
    if (!apply) {
      console.log(`would move ${r.id} (${r.filename})`);
      moved++;
      continue;
    }
    const path = new URL(r.blobKey).pathname.replace(/^\//, "");
    const out = await put(path, Buffer.from(await res.arrayBuffer()), {
      access: "private",
      contentType: r.contentType,
      addRandomSuffix: true,
      token: priv,
    });
    await db.update(receipts).set({ blobKey: out.url }).where(eq(receipts.id, r.id));
    moved++;
  }
  console.log(`${apply ? "moved" : "would move"} ${moved}, skipped ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
