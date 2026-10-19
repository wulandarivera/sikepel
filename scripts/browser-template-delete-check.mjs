import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(
  /Kata sandi semua akun contoh: (.+)/,
)[1];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app/dashboard");
  await page.goto(base + "/app/template");
  const before = await (
    await context.request.get(base + "/api/templates")
  ).json();
  const current = before.items.find(
    (t) => t.type_name === "Surat Keterangan Belum Memiliki Rumah" && t.active,
  );
  assert.ok(current);
  await page
    .getByLabel("Filter jenis surat template")
    .selectOption(current.type_id);
  const filename = "uji-hapus-template-" + Date.now() + ".docx";
  await page
    .getByRole("button", { name: "Upload Versi Baru", exact: true })
    .click();
  await page
    .getByLabel("File template DOCX")
    .setInputFiles({
      name: filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: await fs.readFile("templates/belum-memiliki-rumah.docx"),
    });
  await page
    .getByRole("button", { name: "Upload & Validasi", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Hasil Validasi Template", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Tutup dialog", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: filename });
  await row.getByRole("button", { name: /^Hapus / }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Batal", exact: true })
    .click();
  await row.waitFor();
  const uploaded = (
    await (await context.request.get(base + "/api/templates")).json()
  ).items.find((t) => t.file_name === filename);
  assert.ok(uploaded);
  await row.getByRole("button", { name: /^Hapus / }).click();
  let injectFailure = true;
  await page.route("**/api/templates/" + uploaded.id, async (route) => {
    if (route.request().method() === "DELETE" && injectFailure) {
      injectFailure = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Kegagalan uji sementara" }),
      });
    } else await route.continue();
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hapus Template", exact: true })
    .click();
  await page.getByText("Kegagalan uji sementara", { exact: true }).waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hapus Template", exact: true })
    .click();
  await row.waitFor({ state: "detached" });
  await page.reload();
  await page
    .getByRole("heading", { name: "Template Global", exact: true })
    .waitFor();
  const after = (
    await (await context.request.get(base + "/api/templates")).json()
  ).items;
  assert.ok(!after.some((t) => t.id === uploaded.id));
  assert.ok(after.some((t) => t.id === current.id && t.active));
  assert.equal(
    (
      await context.request.get(
        base + "/api/templates/" + uploaded.id + "/download",
      )
    ).status(),
    404,
  );
  await page
    .getByLabel("Filter jenis surat template")
    .selectOption(current.type_id);
  const activeRow = page
    .getByRole("row")
    .filter({ hasText: "v" + current.version })
    .filter({ hasText: "Belum Memiliki Rumah.docx" });
  await activeRow.getByRole("button", { name: /^Hapus / }).click();
  await page
    .getByText("Template ini sedang aktif.", { exact: false })
    .waitFor();
  await fs.mkdir("reference/verification", { recursive: true });
  await page.screenshot({
    path: "reference/verification/template-delete-confirm.png",
    fullPage: true,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Batal", exact: true })
    .click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS UI upload fixture, cancel, failed deletion/retry, removal persists, active-template warning, original templates retained, no runtime errors.",
  );
} finally {
  await browser.close();
}
