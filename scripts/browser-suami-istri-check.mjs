import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const emptyReference = process.argv.includes("--empty-reference");
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(
  /Kata sandi semua akun contoh: (.+)/,
)[1];
const installed = JSON.parse(
  await fs.readFile(".data/template-suami-istri/installed.json", "utf8"),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app/dashboard");
  await page.goto(base + "/app/pelayanan/baru/jenis-surat");
  await page
    .locator("article")
    .filter({ hasText: "Surat Keterangan Suami Istri" })
    .getByRole("button", { name: "Buat Surat", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Cari NIK atau nama penduduk…" })
    .fill("Ahmad");
  await page
    .getByRole("button", { name: "Pilih Penduduk", exact: true })
    .first()
    .click();
  assert.equal(await page.locator("#nama_suami").inputValue(), "Ahmad Maulana");
  assert.equal(await page.locator("#nama_istri").inputValue(), "");
  for (const title of ["Data suami", "Data istri", "Keterangan pernikahan"]) assert.equal(await page.getByRole("heading", { name: title, exact: true }).count(), 1);
  const sample = JSON.parse(await fs.readFile(".data/template-suami-istri/sample-data.json", "utf8"));
  for (const [key, value] of Object.entries(sample.form_data)) {
    await page.locator('[name="' + key + '"]').fill(key === "nomor_pengantar_rt" && emptyReference ? "" : value);
  }
  await page.screenshot({
    path: ".data/template-suami-istri/form.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Preview Surat", exact: true })
    .click();
  await page.waitForURL("**/preview?letter=*", { timeout: 120000 });
  await page.waitForFunction(
    () => {
      const c = document.querySelector(".pdf-pages canvas");
      return c && c.width > 100 && c.style.visibility === "visible";
    },
    {},
    { timeout: 30000 },
  );
  const id = new URL(page.url()).searchParams.get("letter");
  const detail = await (
    await context.request.get(base + "/api/letters/" + id)
  ).json();
  assert.equal(detail.number, null);
  assert.equal(detail.snapshot.template.id, installed.template_id);
  assert.equal(detail.snapshot.form_data.nama_suami, "Ahmad Maulana");
  assert.equal(detail.snapshot.form_data.nama_istri, "Siti Aminah");
  assert.equal(detail.snapshot.form_data.nomor_pengantar_rt, emptyReference ? "" : "015/RT.003/IX/2026");
  const pdf = await context.request.get(
    base + `/api/letters/${id}/pdf?preview=1`,
  );
  assert.equal(pdf.status(), 200);
  await fs.writeFile(
    ".data/template-suami-istri/application-preview.pdf",
    await pdf.body(),
  );
  await page.screenshot({
    path: ".data/template-suami-istri/application-preview.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    ".data/template-suami-istri/browser-result.json",
    JSON.stringify(
      {
        passed: true,
        letter_id: id,
        template_version: installed.version,
        url: page.url(),
        tested_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS formulir baru, pratinjau PDF aktual, template versi " +
      installed.version +
      ", nomor belum dialokasikan, tanpa error browser.",
  );
} finally {
  await browser.close();
}



