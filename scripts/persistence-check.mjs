import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base = process.env.SIKEPEL_TEST_URL || "http://127.0.0.1:3000";
const prior = JSON.parse(
  await fs.readFile("reference/verification/browser-results.json", "utf8"),
);
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(
  /Kata sandi semua akun contoh: (.+)/,
)[1];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.screenshot({
    path: "reference/verification/production-dashboard.png",
    fullPage: true,
  });
  const detailResponse = await context.request.get(
    base + `/api/letters/${prior.letter_id}`,
  );
  assert.equal(detailResponse.status(), 200);
  const detail = await detailResponse.json();
  assert.equal(detail.number, prior.number);
  assert.equal(detail.status, "ISSUED");
  const response = await context.request.get(
    base + `/api/letters/${prior.letter_id}/pdf`,
  );
  assert.equal(response.status(), 200);
  const bytes = await response.body();
  assert.ok(
    bytes.equals(await fs.readFile("reference/verification/surat-contoh.pdf")),
    "Archived PDF must survive restart byte-for-byte",
  );
  await page.goto(base + `/app/arsip/${prior.letter_id}`);
  await page.waitForFunction(() => {
    const c = document.querySelector(".pdf-pages canvas");
    return c && c.width > 100 && c.style.visibility === "visible";
  });
  const beforeZoom = await page
    .locator(".pdf-pages canvas")
    .evaluate((c) => c.width);
  await page.getByRole("button", { name: "Perbesar PDF", exact: true }).click();
  await page.waitForFunction((w) => {
    const c = document.querySelector(".pdf-pages canvas");
    return c && c.width > w && c.style.visibility === "visible";
  }, beforeZoom);
  await page.evaluate(() => {
    window.__printResult = null;
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (
            n instanceof HTMLIFrameElement &&
            n.title === "Dokumen untuk dicetak"
          ) {
            n.contentWindow.print = () => {
              const imgs = [...n.contentDocument.images];
              window.__printResult = {
                count: imgs.length,
                ready: imgs.every(
                  (img) => img.complete && img.naturalWidth > 500,
                ),
              };
            };
          }
        }
    }).observe(document.body, { childList: true });
  });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(
    () => window.__printResult?.ready,
    {},
    { timeout: 30000 },
  );
  assert.equal((await page.evaluate(() => window.__printResult)).count, 1);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "reference/verification/persistence-results.json",
    JSON.stringify(
      {
        passed: true,
        tested_at: new Date().toISOString(),
        number: detail.number,
        checks: [
          "production login",
          "persisted archive after restart",
          "identical stored PDF",
          "PDF canvas render",
          "PDF zoom",
          "all print pages prepared",
          "no browser runtime errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS production login, persisted archive, identical PDF, zoom, print preparation, no runtime errors",
  );
} finally {
  await browser.close();
}
