import fs from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./db";
export interface StorageAdapter {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}
export class LocalStorage implements StorageAdapter {
  private resolve(key: string) {
    if (process.env.VERCEL === "1") throw new Error("Penyimpanan lokal tidak tersedia di Vercel");
    const root = path.join(dataRoot(), "storage");
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep))
      throw new Error("Invalid storage key");
    return file;
  }
  async put(key: string, bytes: Buffer) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes, { flag: "wx" });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
}
export class SupabaseStorage implements StorageAdapter {
  private url(key: string) {
    return `${process.env.SUPABASE_URL}/storage/v1/object/${process.env.SUPABASE_BUCKET || "sikepel"}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  private headers() {
    return {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    };
  }
  async put(key: string, bytes: Buffer) {
    const r = await fetch(this.url(key), {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("Storage upload failed");
  }
  async get(key: string) {
    const r = await fetch(this.url(key), {
      headers: this.headers(),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("Storage download failed");
    return Buffer.from(await r.arrayBuffer());
  }
}
export const storage: StorageAdapter = process.env.SUPABASE_URL
  ? new SupabaseStorage()
  : new LocalStorage();
