import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Receipt blob storage. Abstracted so local dev writes to disk and production
 * uses Vercel Blob without touching call sites.
 *
 * Set STORAGE_DRIVER=vercel in production; defaults to local disk.
 *
 * Callers must persist the `key` returned by `put()` (Vercel Blob rewrites it).
 * Receipts are financial documents — serve them through an authenticated route
 * handler that streams from the stored URL; never expose the blob URL directly.
 */

export interface StoredBlob {
  key: string;
  size: number;
  contentType: string;
}

export interface BlobStore {
  put(key: string, data: Buffer, contentType: string): Promise<StoredBlob>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

class LocalBlobStore implements BlobStore {
  private dir = path.join(process.cwd(), ".data", "receipts");

  private async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredBlob> {
    await this.ensureDir();
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    await fs.writeFile(path.join(this.dir, safe), data);
    await fs.writeFile(path.join(this.dir, `${safe}.meta`), contentType);
    return { key, size: data.byteLength, contentType };
  }

  async get(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    try {
      const data = await fs.readFile(path.join(this.dir, safe));
      const contentType = await fs
        .readFile(path.join(this.dir, `${safe}.meta`), "utf8")
        .catch(() => "application/octet-stream");
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    await fs.rm(path.join(this.dir, safe), { force: true });
    await fs.rm(path.join(this.dir, `${safe}.meta`), { force: true });
  }
}

/**
 * Receipts live in a **private** Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) —
 * the URL alone grants nothing. Receipts uploaded before the switch sit in the
 * old public store; their URLs still fetch without a token, so reads fall back
 * to a plain fetch until `scripts/migrate-receipts-private.ts` has moved them
 * (it rewrites `receipts.blob_key`).
 */
class VercelBlobStore implements BlobStore {
  private token = process.env.BLOB_READ_WRITE_TOKEN;

  private async lib() {
    return import("@vercel/blob");
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredBlob> {
    const { put } = await this.lib();
    const result = await put(key, data, {
      access: "private",
      contentType,
      addRandomSuffix: true,
      token: this.token,
    });
    return { key: result.url, size: data.byteLength, contentType };
  }

  async get(key: string) {
    const { get } = await this.lib();
    try {
      const res = await get(key, { access: "private", token: this.token });
      if (res === null) return null;
      if (res.statusCode === 200) {
        return {
          data: Buffer.from(await new Response(res.stream).arrayBuffer()),
          contentType: res.blob.contentType,
        };
      }
    } catch {
      // Not in the private store — fall through to the legacy public URL.
    }
    // Legacy: receipt still in the old public store.
    const res = await fetch(key);
    if (!res.ok) return null;
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async delete(key: string) {
    const { del } = await this.lib();
    try {
      await del(key, { token: this.token });
    } catch {
      // Legacy public-store blob: this token can't touch it. The orphan goes
      // away when the old store is deleted.
    }
  }
}

/**
 * Use Vercel Blob when explicitly asked, OR whenever a Blob token is
 * present and local storage wasn't explicitly forced. The local disk store only works with a writable
 * filesystem, i.e. dev.
 */
const useVercelBlob =
  process.env.STORAGE_DRIVER === "vercel" ||
  (process.env.STORAGE_DRIVER !== "local" && !!process.env.BLOB_READ_WRITE_TOKEN);

export const blobStore: BlobStore = useVercelBlob
  ? new VercelBlobStore()
  : new LocalBlobStore();

export function receiptKey(
  scope: "txn" | "item" | "pending",
  id: string,
  filename: string,
): string {
  const ext = path.extname(filename).toLowerCase() || ".bin";
  return `${scope}/${id}/${crypto.randomUUID()}${ext}`;
}
