import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.SIKEPEL_TEST_URL || "http://127.0.0.1:3000";
const access = await fs.readFile(".data/AKSES-LOKAL.txt", "utf8");
const password = access.match(/Kata sandi semua akun contoh: (.+)/)[1];
await fs.mkdir("reference/verification", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const checkpoint = (name) =>
  page.screenshot({
    path: `reference/verification/${name}.png`,
    fullPage: true,
  });
try {
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Template Global", exact: true })
      .count(),
    0,
  );
  await checkpoint("dashboard");
  console.log("PASS login, dashboard, role-based navigation");
  await page
    .getByRole("link", { name: "Buat Pelayanan", exact: true })
    .first()
    .click();
  await page
    .locator("article")
    .filter({ hasText: "Surat Keterangan Domisili" })
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
    .getByLabel("Keperluan surat")
    .fill("Pengurusan administrasi perbankan");
  await page.getByLabel("Berlaku sampai").fill("2026-12-31");
  assert.equal(
    await page.getByLabel("Berlaku sampai").inputValue(),
    "2026-12-31",
  );
  await checkpoint("form");
  await page
    .getByRole("button", { name: "Preview Surat", exact: true })
    .click();
  await page.waitForURL("**/preview?letter=*", { timeout: 120000 });
  await page
    .getByRole("heading", { name: "Preview Surat", exact: true })
    .waitFor();
  const previewURL = new URL(page.url());
  const id = previewURL.searchParams.get("letter");
  const pdf = await context.request.get(
    base + `/api/letters/${id}/pdf?preview=1`,
  );
  assert.equal(pdf.status(), 200);
  assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-");
  await page.waitForFunction(
    () => {
      const c = document.querySelector(".pdf-pages canvas");
      return c && c.width > 100 && c.style.visibility === "visible";
    },
    {},
    { timeout: 30000 },
  );
  await checkpoint("preview");
  console.log("PASS resident search, form, actual PDF preview");
  await page
    .getByRole("button", { name: "Terbitkan Surat", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Terbitkan Surat", exact: true })
    .click();
  await page.waitForURL("**/arsip/*?success=1", { timeout: 120000 });
  await page
    .getByRole("heading", { name: "Pelayanan selesai.", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => {
      const c = document.querySelector(".pdf-pages canvas");
      const img = document.querySelector(".success-image");
      return (
        c && c.width > 100 && c.style.visibility === "visible" && img?.complete
      );
    },
    {},
    { timeout: 30000 },
  );
  await checkpoint("success");
  const issued = await context.request.get(base + `/api/letters/${id}`);
  const detail = await issued.json();
  assert.equal(detail.status, "ISSUED");
  const finalPdf = await context.request.get(base + `/api/letters/${id}/pdf`);
  assert.equal(finalPdf.status(), 200);
  await fs.writeFile(
    "reference/verification/surat-contoh.pdf",
    await finalPdf.body(),
  );
  console.log("PASS confirmation, issuance, archived PDF:", detail.number);
  await page.getByRole("link", { name: "Arsip Surat", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cari nomor surat, NIK, atau nama…" })
    .fill(detail.number);
  await page.getByText(detail.number, { exact: true }).waitFor();
  await checkpoint("archive");
  await page.getByRole("link", { name: "Data Penduduk", exact: true }).click();
  await page
    .getByRole("heading", { name: "Data Penduduk", exact: true })
    .waitFor();
  await page.getByText("Ahmad Maulana", { exact: true }).waitFor();
  await checkpoint("residents");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await checkpoint("mobile-dashboard");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile must not overflow horizontally",
  );
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Data Penduduk", exact: true }).click();
  await page
    .getByRole("heading", { name: "Data Penduduk", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Resident table must scroll inside its container",
  );
  await checkpoint("mobile-residents");
  console.log(
    "PASS archive search, resident list, mobile navigation and overflow",
  );
  await context.close();
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (e) => errors.push(e.message));
  await adminPage.goto(base + "/login");
  await adminPage.getByLabel("Username", { exact: true }).fill("admin");
  await adminPage.getByLabel("Kata sandi", { exact: true }).fill(password);
  await adminPage.getByRole("button", { name: "Masuk", exact: true }).click();
  await adminPage.waitForURL("**/app/dashboard");
  for (const [route, title] of [
    ["template", "Template Global"],
    ["kelurahan", "Kelurahan"],
    ["pengguna", "Pengguna"],
    ["jenis-surat", "Jenis Surat"],
    ["audit", "Audit Log"],
    ["laporan", "Laporan Pelayanan"],
    ["pengaturan", "Pengaturan Global"],
  ]) {
    await adminPage.goto(base + "/app/" + route);
    await adminPage
      .getByRole("heading", { name: title, exact: true })
      .waitFor();
    await adminPage.screenshot({
      path: `reference/verification/admin-${route}.png`,
      fullPage: true,
    });
  }
  await adminPage.goto(base + "/app/kelurahan");
  await adminPage
    .getByRole("button", { name: "Edit", exact: true })
    .first()
    .click();
  await adminPage.getByRole("dialog").waitFor();
  assert.ok(await adminPage.getByLabel("Nama kelurahan").inputValue());
  await adminPage
    .getByRole("button", { name: "Tutup dialog", exact: true })
    .click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS administrative pages, edit dialog, no browser runtime errors",
  );
  await fs.writeFile(
    "reference/verification/browser-results.json",
    JSON.stringify(
      {
        passed: true,
        letter_id: id,
        number: detail.number,
        checks: [
          "login",
          "role navigation",
          "resident search",
          "form",
          "PDF preview",
          "confirmation",
          "issuance",
          "archive search",
          "mobile navigation",
          "admin pages",
          "dialog",
          "no page errors",
        ],
        tested_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await adminContext.close();
} finally {
  await browser.close();
}
