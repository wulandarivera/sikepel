import { loadEnvConfig } from "@next/env";
import fs from "node:fs/promises";
import { cloudConfigErrors } from "../src/server/cloud-config";
import { cloudTemplates } from "./cloud-templates";
loadEnvConfig(process.cwd());
async function main() {
  const filesOnly = process.argv.includes("--files-only");
  if (!filesOnly) {
    const errors = cloudConfigErrors();
    if (errors.length) throw new Error(errors.join("\n"));
  }
  const { validateTemplate } = await import("../src/server/documents");
  for (const [slug] of cloudTemplates) {
    const fields = JSON.parse(await fs.readFile(`templates/${slug}.fields.json`, "utf8"));
    const bytes = await fs.readFile(`templates/${slug}.docx`);
    const result = validateTemplate(bytes, fields, slug);
    if (result.errors.length) throw new Error(`${slug}: ${result.errors.join("; ")}`);
    if (bytes.length > 4 * 1024 * 1024) throw new Error(`${slug}: template melebihi 4 MB`);
  }
  await fs.access("templates/pernyataan-belum-menikah.docx");
  await fs.access("public/pdf.worker.min.mjs");
  console.log(`PASS ${cloudTemplates.length} template layanan, pendamping N1, dan worker PDF tersedia.`);
  if (!filesOnly) console.log("PASS konfigurasi cloud lengkap (nilai rahasia tidak dicetak).");
  if (process.argv.includes("--services")) {
    if (filesOnly) throw new Error("--services memerlukan konfigurasi cloud");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
    try { await pool.query("SELECT 1"); } finally { await pool.end(); }
    const bucket = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(process.env.SUPABASE_BUCKET!)}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! }, signal: AbortSignal.timeout(15000),
    });
    if (!bucket.ok || (await bucket.json()).public !== false) throw new Error("Bucket tidak ditemukan/tidak privat atau akses ditolak");
    if (process.env.PDF_CONVERTER_PROVIDER === "convertapi" || /convertapi\.com/i.test(process.env.PDF_CONVERTER_URL!)) {
      console.log("PASS koneksi PostgreSQL dan bucket privat; ConvertAPI token tersimpan untuk konversi nyata.");
    } else {
      const authorization = process.env.PDF_CONVERTER_TOKEN ? `Bearer ${process.env.PDF_CONVERTER_TOKEN}` : `Basic ${Buffer.from(`${process.env.PDF_CONVERTER_USERNAME}:${process.env.PDF_CONVERTER_PASSWORD}`).toString("base64")}`;
      const converter = await fetch(`${process.env.PDF_CONVERTER_URL!.replace(/\/$/, "")}/health`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(15000) });
      if (!converter.ok) throw new Error("Health check converter gagal");
      console.log("PASS koneksi PostgreSQL, bucket privat, dan health converter; konversi nyata perlu uji pratinjau setelah deployment.");
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Pemeriksaan gagal"); process.exitCode = 1; });
