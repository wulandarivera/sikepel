import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(
  /Kata sandi semua akun contoh: (.+)/,
)[1];
const installed = JSON.parse(
  await fs.readFile(".data/template-ktp/installed.json", "utf8"),
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
    .filter({ hasText: "Formulir KTP" })
    .getByRole("button", { name: "Buat Surat", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Cari NIK atau nama penduduk…" })
    .fill("Ahmad");
  await page
    .getByRole("button", { name: "Pilih Penduduk", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Jenis permohonan KTP-el")
    .selectOption("Penggantian hilang");
  await page.getByLabel("Nomor handphone / WA (opsional)").fill("080000000001");
  await page.getByLabel("Alamat email (opsional)").fill("pemohon@example.com");
  assert.equal(
    await page.getByLabel("Nama petugas").inputValue(),
    "",
  );
  await page.getByLabel("Nama petugas").fill("Budi Santoso");
  await page.getByLabel("KK lama / KK rusak", { exact: true }).check();
  await page
    .getByLabel("Surat keterangan hilang dari kepolisian", { exact: true })
    .check();
  await page
    .getByLabel("Pernyataan penyebab hilang atau rusak", { exact: true })
    .check();
  await page.screenshot({
    path: ".data/template-ktp/form.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Preview Surat", exact: true })
    .click();
  await page.waitForURL("**/preview?letter=*", { timeout: 120000 });
  const id = new URL(page.url()).searchParams.get("letter");
  await page.waitForFunction(() => {
    const c = document.querySelector(".pdf-pages canvas");
    return c && c.width > 100 && c.style.visibility === "visible";
  });
  await page.screenshot({
    path: ".data/template-ktp/preview.png",
    fullPage: true,
  });
  const detail = await (
    await context.request.get(base + "/api/letters/" + id)
  ).json();
  assert.equal(detail.number, null);
  assert.equal(detail.snapshot.template.id, installed.template_id);
  assert.equal(detail.form_data.lampiran_kk, "Ya");
  assert.ok(!detail.form_data.lampiran_ktp);
  await page
    .getByRole("button", { name: "Terbitkan Surat", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Terbitkan Surat", exact: true })
    .click();
  await page.waitForURL("**/arsip/*?success=1", { timeout: 120000 });
  await page.waitForFunction(() => {
    const c = document.querySelector(".pdf-pages canvas");
    return c && c.width > 100 && c.style.visibility === "visible";
  });
  const pdf = await context.request.get(base + `/api/letters/${id}/pdf`);
  assert.equal(pdf.status(), 200);
  await fs.writeFile(".data/template-ktp/application.pdf", await pdf.body());
  await page.evaluate(() => {
    window.__printResult = null;
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (
            n instanceof HTMLIFrameElement &&
            n.title === "Dokumen untuk dicetak"
          )
            n.contentWindow.print = () => {
              window.__printResult = {
                count: n.contentDocument.images.length,
                styles: n.contentDocument.head.textContent,
                width: n.contentDocument.images[0].style.width,
                height: n.contentDocument.images[0].style.height,
              };
            };
        }
    }).observe(document.body, { childList: true });
  });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__printResult !== null);
  const printing = await page.evaluate(() => window.__printResult);
  assert.equal(printing.count, 1);
  assert.equal(printing.width, "612pt");
  assert.equal(printing.height, "1008pt");
  assert.match(printing.styles, /size:612pt 1008pt/);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    ".data/template-ktp/browser-result.json",
    JSON.stringify(
      {
        passed: true,
        letter_id: id,
        version: installed.version,
        printing,
        tested_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS F-102 form, checkboxes, preview, issuance, archived PDF and Legal-sized print.",
  );
} finally {
  await browser.close();
}
