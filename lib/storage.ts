import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Receipt blob storage. Abstracted so local dev writes to disk and production
 * uses Netlify Blobs (or S3-compatible storage) without touching call sites.
 *
 * Set STORAGE_DRIVER=netlify in production; defaults to local disk.
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

class NetlifyBlobStore implements BlobStore {
  private storeName = "receipts";

  private async store() {
    // Imported lazily so local dev / migrations don't need the package resolved.
    const { getStore } = await import("@netlify/blobs");
    return getStore(this.storeName);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredBlob> {
    const store = await this.store();
    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    await store.set(key, arrayBuffer, { metadata: { contentType } });
    return { key, size: data.byteLength, contentType };
  }

  async get(key: string) {
    const store = await this.store();
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return null;
    return {
      data: Buffer.from(result.data as ArrayBuffer),
      contentType: (result.metadata?.contentType as string) ?? "application/octet-stream",
    };
  }

  async delete(key: string) {
    const store = await this.store();
    await store.delete(key);
  }
}

export const blobStore: BlobStore =
  process.env.STORAGE_DRIVER === "netlify" ? new NetlifyBlobStore() : new LocalBlobStore();

export function receiptKey(scope: "txn" | "item", id: string, filename: string): string {
  const ext = path.extname(filename).toLowerCase() || ".bin";
  return `${scope}/${id}/${crypto.randomUUID()}${ext}`;
}
