import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { getPool } from "./db.js";

export type AutoReplyMatchType = "EXACT" | "CONTAINS" | "REGEX";

export interface AutoReply {
  id: string;
  keyword: string;
  match_type: AutoReplyMatchType;
  reply_text: string;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export function cleanTextNoEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/gu, "");
}

const DEFAULT_TEMPLATES: Omit<AutoReply, "id" | "created_at" | "updated_at">[] = [
  {
    keyword: "syarat domisili",
    match_type: "CONTAINS",
    reply_text:
      "Persyaratan Surat Keterangan Domisili:\n1. Fotokopi KTP elektronik pemohon\n2. Fotokopi Kartu Keluarga\n3. Surat pengantar RT dan RW setempat\n\nPengajuan mandiri online dapat diakses melalui:\nhttps://mandiri.sikepel.biz.id",
    is_active: true,
    created_by: "SYSTEM",
  },
  {
    keyword: "jam pelayanan",
    match_type: "CONTAINS",
    reply_text:
      "Jam Pelayanan Kantor Kelurahan Cibodas:\nSenin s.d. Jumat: Pukul 08.00 - 15.00 WIB\nSabtu, Minggu, dan Hari Libur Nasional: Tutup\n\nUntuk pengajuan mandiri daring tetap dapat diakses 24 jam via portal resmi SIKEPEL.",
    is_active: true,
    created_by: "SYSTEM",
  },
  {
    keyword: "lokasi",
    match_type: "CONTAINS",
    reply_text:
      "Kantor Kelurahan Cibodas berlokasi di Jl. Raya Cibodas No. 1.\nPelayanan administrasi kependudukan dan surat keterangan dibuka pada hari kerja di loket terpadu kelurahan.",
    is_active: true,
    created_by: "SYSTEM",
  },
];

export class AutoReplyStore {
  private items: Map<string, AutoReply> = new Map();
  private filePath: string;
  private initialized: boolean = false;

  constructor(customFilePath?: string) {
    this.filePath =
      customFilePath ||
      path.join(config.sessionDir, "auto-replies.json");
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Coba baca dari PostgreSQL jika tersedia
    const pool = getPool();
    if (pool) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS wa_auto_replies (
            id uuid PRIMARY KEY,
            keyword text NOT NULL,
            match_type text NOT NULL CHECK(match_type IN ('EXACT', 'CONTAINS', 'REGEX')),
            reply_text text NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_by text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS wa_auto_replies_active_idx ON wa_auto_replies(is_active);
        `);

        const res = await pool.query(
          "SELECT id, keyword, match_type, reply_text, is_active, created_by, created_at, updated_at FROM wa_auto_replies ORDER BY created_at ASC",
        );

        if (res.rows.length > 0) {
          for (const row of res.rows) {
            const item: AutoReply = {
              id: row.id,
              keyword: cleanTextNoEmoji(row.keyword),
              match_type: row.match_type,
              reply_text: cleanTextNoEmoji(row.reply_text),
              is_active: Boolean(row.is_active),
              created_by: row.created_by,
              created_at: new Date(row.created_at).toISOString(),
              updated_at: new Date(row.updated_at).toISOString(),
            };
            this.items.set(item.id, item);
          }
          await this.saveToFile();
          return;
        }
      } catch (err: any) {
        logger.warn({ error: err.message }, "Gagal sinkronisasi wa_auto_replies dari PostgreSQL, menggunakan berkas JSON");
      }
    }

    // 2. Baca dari berkas JSON
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const raw of parsed) {
          if (raw && typeof raw.id === "string" && typeof raw.keyword === "string") {
            const item: AutoReply = {
              id: raw.id,
              keyword: cleanTextNoEmoji(raw.keyword),
              match_type: ["EXACT", "CONTAINS", "REGEX"].includes(raw.match_type)
                ? raw.match_type
                : "CONTAINS",
              reply_text: cleanTextNoEmoji(raw.reply_text || ""),
              is_active: raw.is_active !== false,
              created_by: raw.created_by || null,
              created_at: raw.created_at || new Date().toISOString(),
              updated_at: raw.updated_at || new Date().toISOString(),
            };
            this.items.set(item.id, item);
          }
        }
        return;
      }
    } catch {
      // Berkas belum ada, buat template bawaan
    }

    // 3. Inisialisasi template bawaan jika belum ada data
    const now = new Date().toISOString();
    for (const def of DEFAULT_TEMPLATES) {
      const item: AutoReply = {
        id: randomUUID(),
        keyword: cleanTextNoEmoji(def.keyword),
        match_type: def.match_type,
        reply_text: cleanTextNoEmoji(def.reply_text),
        is_active: def.is_active,
        created_by: def.created_by,
        created_at: now,
        updated_at: now,
      };
      this.items.set(item.id, item);

      if (pool) {
        try {
          await pool.query(
            `INSERT INTO wa_auto_replies (id, keyword, match_type, reply_text, is_active, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [item.id, item.keyword, item.match_type, item.reply_text, item.is_active, item.created_by, item.created_at, item.updated_at],
          );
        } catch {
          // Abaikan error insert postgres pada inisialisasi awal
        }
      }
    }

    await this.saveToFile();
  }

  private async saveToFile(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const array = Array.from(this.items.values());
      await fs.writeFile(this.filePath, JSON.stringify(array, null, 2), "utf-8");
    } catch (err: any) {
      logger.warn({ error: err.message }, "Gagal menulis berkas auto-replies.json");
    }
  }

  public getAll(): AutoReply[] {
    return Array.from(this.items.values());
  }

  public get(id: string): AutoReply | null {
    return this.items.get(id) || null;
  }

  public async create(payload: {
    keyword: string;
    match_type: AutoReplyMatchType;
    reply_text: string;
    is_active?: boolean;
    created_by?: string;
  }): Promise<AutoReply> {
    await this.init();
    const now = new Date().toISOString();
    const item: AutoReply = {
      id: randomUUID(),
      keyword: cleanTextNoEmoji(payload.keyword.trim()),
      match_type: payload.match_type,
      reply_text: cleanTextNoEmoji(payload.reply_text.trim()),
      is_active: payload.is_active !== false,
      created_by: payload.created_by ? cleanTextNoEmoji(payload.created_by) : null,
      created_at: now,
      updated_at: now,
    };

    this.items.set(item.id, item);
    await this.saveToFile();

    const pool = getPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO wa_auto_replies (id, keyword, match_type, reply_text, is_active, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [item.id, item.keyword, item.match_type, item.reply_text, item.is_active, item.created_by, item.created_at, item.updated_at],
        );
      } catch (err: any) {
        logger.warn({ error: err.message }, "Gagal menyimpan auto-reply ke PostgreSQL");
      }
    }

    return item;
  }

  public async update(
    id: string,
    payload: Partial<{
      keyword: string;
      match_type: AutoReplyMatchType;
      reply_text: string;
      is_active: boolean;
    }>,
  ): Promise<AutoReply | null> {
    await this.init();
    const existing = this.items.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: AutoReply = {
      ...existing,
      keyword: payload.keyword !== undefined ? cleanTextNoEmoji(payload.keyword.trim()) : existing.keyword,
      match_type: payload.match_type !== undefined ? payload.match_type : existing.match_type,
      reply_text: payload.reply_text !== undefined ? cleanTextNoEmoji(payload.reply_text.trim()) : existing.reply_text,
      is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : existing.is_active,
      updated_at: now,
    };

    this.items.set(id, updated);
    await this.saveToFile();

    const pool = getPool();
    if (pool) {
      try {
        await pool.query(
          `UPDATE wa_auto_replies
           SET keyword = $1, match_type = $2, reply_text = $3, is_active = $4, updated_at = $5
           WHERE id = $6`,
          [updated.keyword, updated.match_type, updated.reply_text, updated.is_active, updated.updated_at, id],
        );
      } catch (err: any) {
        logger.warn({ error: err.message }, "Gagal memperbarui auto-reply di PostgreSQL");
      }
    }

    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    await this.init();
    if (!this.items.has(id)) return false;

    this.items.delete(id);
    await this.saveToFile();

    const pool = getPool();
    if (pool) {
      try {
        await pool.query("DELETE FROM wa_auto_replies WHERE id = $1", [id]);
      } catch (err: any) {
        logger.warn({ error: err.message }, "Gagal menghapus auto-reply di PostgreSQL");
      }
    }

    return true;
  }

  public findMatchingReply(
    incomingText: string,
    senderInfo?: { name?: string; phone?: string },
  ): string | null {
    const trimmed = cleanTextNoEmoji(incomingText.trim());
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();

    for (const item of this.items.values()) {
      if (!item.is_active || item.keyword.startsWith("__")) continue;

      let matched = false;
      const kw = item.keyword.trim().toLowerCase();
      if (!kw) continue;

      if (item.match_type === "EXACT") {
        if (lower === kw) {
          matched = true;
        }
      } else if (item.match_type === "CONTAINS") {
        if (lower.includes(kw)) {
          matched = true;
        }
      } else if (item.match_type === "REGEX") {
        try {
          const rx = new RegExp(item.keyword, "i");
          if (rx.test(trimmed)) {
            matched = true;
          }
        } catch {
          // Pola regex tidak valid diabaikan dengan aman
        }
      }

      if (matched) {
        return this.renderReplyText(item.reply_text, senderInfo);
      }
    }

    return null;
  }

  private renderReplyText(
    template: string,
    senderInfo?: { name?: string; phone?: string },
  ): string {
    const residentName = senderInfo?.name ? cleanTextNoEmoji(senderInfo.name.trim()) : "Warga";
    const phone = senderInfo?.phone ? cleanTextNoEmoji(senderInfo.phone.trim()) : "";
    const today = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const nowTime = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let rendered = template
      .replace(/\{nama\}/gi, residentName)
      .replace(/\{name\}/gi, residentName)
      .replace(/\{nomor\}/gi, phone)
      .replace(/\{telepon\}/gi, phone)
      .replace(/\{phone\}/gi, phone)
      .replace(/\{tanggal\}/gi, today)
      .replace(/\{date\}/gi, today)
      .replace(/\{jam\}/gi, nowTime)
      .replace(/\{waktu\}/gi, nowTime)
      .replace(/\{time\}/gi, nowTime);

    return cleanTextNoEmoji(rendered);
  }
}

let defaultStore: AutoReplyStore | null = null;

export function getAutoReplyStore(): AutoReplyStore {
  if (!defaultStore) {
    defaultStore = new AutoReplyStore();
  }
  return defaultStore;
}
