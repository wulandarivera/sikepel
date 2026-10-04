import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(/Kata sandi semua akun contoh: (.+)/)[1];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app/dashboard");
  await page.goto(base + "/app/pelayanan/baru/jenis-surat");
  await page.locator("article").filter({ hasText: "Pengantar Nikah" }).getByRole("button", { name: "Buat Surat", exact: true }).click();
  await page.getByRole("textbox", { name: "Cari NIK atau nama penduduk…" }).fill("Ahmad");
  await page.getByRole("button", { name: "Pilih Penduduk", exact: true }).first().click();
  await page.getByLabel("Kewarganegaraan pemohon").fill("Indonesia");
  await page.getByLabel("Status perkawinan untuk N1").selectOption("Jejaka");
  const values = {
    nama_bapak: "Hasan Abdullah", nik_bapak: "0000000000000002", tempat_lahir_bapak: "Tangerang", tanggal_lahir_bapak: "1960-03-12", negara_bapak: "Indonesia", agama_bapak: "Islam", pekerjaan_bapak: "Wiraswasta", alamat_bapak: "Jl. Melati No. 12, RT 003 RW 001",
    nama_ibu: "Siti Aminah", nik_ibu: "0000000000000003", tempat_lahir_ibu: "Tangerang", tanggal_lahir_ibu: "1963-06-20", negara_ibu: "Indonesia", agama_ibu: "Islam", pekerjaan_ibu: "Ibu rumah tangga", alamat_ibu: "Jl. Melati No. 12, RT 003 RW 001",
  };
  for (const [key, value] of Object.entries(values)) await page.locator("#" + key).fill(value);
  await page.getByRole("button", { name: "Preview Surat", exact: true }).click();
  await page.waitForURL("**/preview?letter=*", { timeout: 120000 });
  await page.waitForFunction(() => document.querySelectorAll(".pdf-pages canvas").length >= 1);
  const id = new URL(page.url()).searchParams.get("letter");
  const detail = await (await context.request.get(base + "/api/letters/" + id)).json();
  assert.equal(detail.form_data.nama_bapak, "Hasan Abdullah");
  assert.equal(detail.form_data.nama_ibu, "Siti Aminah");
  const pdf = await context.request.get(base + `/api/letters/${id}/pdf?preview=1`);
  assert.equal(pdf.status(), 200);
  await fs.writeFile(".data/template-n1/application-preview.pdf", await pdf.body());
  assert.deepEqual(errors, []);
  console.log("PASS N1 form, parent identities, preview PDF, and no browser errors.");
} finally { await browser.close(); }
