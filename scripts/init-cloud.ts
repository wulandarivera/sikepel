import { loadEnvConfig } from "@next/env";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { cloudConfigErrors } from "../src/server/cloud-config";
import { cloudTemplates } from "./cloud-templates";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.VERCEL === "1") throw new Error("Jalankan cloud:init pada komputer tepercaya, bukan saat Vercel build/runtime.");
  const errors = cloudConfigErrors();
  for (const key of ["SIKEPEL_ADMIN_NAME", "SIKEPEL_ADMIN_USERNAME", "SIKEPEL_ADMIN_PASSWORD", "SIKEPEL_DISTRICT", "SIKEPEL_CITY"])
    if (!process.env[key]?.trim()) errors.push(`${key} wajib diisi`);
  if ((process.env.SIKEPEL_ADMIN_PASSWORD || "").length < 12) errors.push("Password admin minimal 12 karakter");
  if (errors.length) throw new Error(errors.join("\n"));
  const { getDB, one } = await import("../src/server/db");
  const { hashPassword } = await import("../src/server/security");
  const { validateTemplate } = await import("../src/server/documents");
  const { storage } = await import("../src/server/storage");
  const bucket = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(process.env.SUPABASE_BUCKET!)}`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! }, signal: AbortSignal.timeout(15000),
  });
  if (!bucket.ok || (await bucket.json()).public !== false) throw new Error("Buat bucket privat terlebih dahulu; inisialisasi dibatalkan.");
  const prepared = await Promise.all(cloudTemplates.map(async ([slug, name, code, category]) => {
    const fields = JSON.parse(await fs.readFile(`templates/${slug}.fields.json`, "utf8"));
    const bytes = await fs.readFile(`templates/${slug}.docx`);
    const validation = validateTemplate(bytes, fields, slug);
    if (validation.errors.length) throw new Error(`Template ${slug} belum valid`);
    return { slug, name, code, category, fields, bytes, validation };
  }));
  const db = await getDB();
  try {
    await db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(81403206)");
      await tx.exec(await fs.readFile("migrations/001_core.sql", "utf8"));
      if (await one(tx, "SELECT id FROM users LIMIT 1")) throw new Error("Database sudah berisi akun. Tidak ada data yang ditimpa; gunakan migrasi terpisah.");
      await tx.exec(await fs.readFile("migrations/002_cloud_access.sql", "utf8"));
      const admin = randomUUID();
      await tx.query("INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,'SUPER_ADMIN')", [admin, process.env.SIKEPEL_ADMIN_NAME!.trim(), process.env.SIKEPEL_ADMIN_USERNAME!.trim().toLowerCase(), hashPassword(process.env.SIKEPEL_ADMIN_PASSWORD!)]);
      for (const t of prepared) {
        const id = randomUUID(), templateId = randomUUID();
        const key = `templates/${id}/${templateId}.docx`;
        await storage.put(key, t.bytes);
        await tx.query("INSERT INTO letter_types(id,name,code,slug,category,description,fields) VALUES($1,$2,$3,$4,$5,$6,$7)", [id,t.name,t.code,t.slug,t.category,"Template yang disiapkan untuk layanan kelurahan.",JSON.stringify(t.fields)]);
        await tx.query("INSERT INTO templates(id,type_id,version,storage_path,file_name,placeholders,errors,active,created_by) VALUES($1,$2,1,$3,$4,$5,'[]',true,$6)", [templateId,id,key,`${t.slug}.docx`,JSON.stringify(t.validation.placeholders),admin]);
      }
      await tx.query("INSERT INTO settings(id,data) VALUES('global',$1)", [JSON.stringify({ district:process.env.SIKEPEL_DISTRICT, city:process.env.SIKEPEL_CITY, timezone:"Asia/Jakarta" })]);
    });
    console.log("Inisialisasi selesai: satu super admin dan sembilan jenis surat. Login lalu isi kelurahan, pejabat, dan akun petugas. Tidak ada data penduduk contoh yang dibuat.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Inisialisasi gagal"); process.exitCode = 1; });
