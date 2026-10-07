import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const root = path.resolve(".data/test-operator-mandiri-" + Date.now());
const port = 3109;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: String(port),
  SIKEPEL_DATA_DIR: root,
  SIKEPEL_TEST_FIXTURES: "1",
  DATABASE_URL: "",
  SUPABASE_URL: "",
};

// 1. Seed fixtures
execFileSync(process.execPath, ["--import", "tsx", "tests/seed-fixtures.ts"], {
  env,
  stdio: "pipe",
});

const access = await fs.readFile(path.join(root, "AKSES-LOKAL.txt"), "utf8");
const password = access.match(/Kata sandi semua akun contoh: (.+)/)[1];

// 2. Insert test online_requests into the database
const seedScript = `
import { getDB, one } from './src/server/db.ts';
import { initializeSetup } from './src/server/setup.ts';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const db = await getDB();
await initializeSetup(db, 'isolated-fixture-only');
const opUser = await one(db, "SELECT village_id FROM users WHERE username='operator'");
const villageId = opUser.village_id;
const type = await one(db, "SELECT id, name FROM letter_types LIMIT 1");

// Create dummy attachment
const attDir = path.join('${root}', 'attachments');
await fs.mkdir(attDir, { recursive: true });
const dummyAttId = randomUUID();
await fs.writeFile(path.join(attDir, dummyAttId), Buffer.from('FAKE-IMAGE-DATA'));

const formData = {
  resident: {
    nik: '3201010101010001',
    name: 'Budi Santoso',
    birth_place: 'Bogor',
    birth_date: '1990-01-01',
    gender: 'L',
    religion: 'Islam',
    occupation: 'Wiraswasta',
    address: 'Jl. Melati No. 12',
    rt: '01',
    rw: '02',
    nationality: 'Indonesia'
  },
  keperluan: 'pendaftaran sekolah anak',
  keterangan: 'Surat keterangan pengantar RT/RW terlampir'
};

const attachments = [
  {
    id: dummyAttId,
    media_type: 'image/png',
    size: 15420
  }
];

// Insert 1 PENDING_VERIFICATION request
await db.query(
  \`INSERT INTO online_requests (
    id, ticket_code, type_id, village_id, status, form_data, attachments, contact_phone, tracking_token_hash, tracking_expires_at, created_at, updated_at
  ) VALUES (
    $1, 'TIK-TEST-001', $2, $3, 'PENDING_VERIFICATION', $4, $5, '08123456789', 'dummy_hash', now() + interval '30 days', now(), now()
  )\`,
  [randomUUID(), type.id, villageId, JSON.stringify(formData), JSON.stringify(attachments)]
);

await db.close();
`;

execFileSync(
  process.execPath,
  ["--import", "tsx", "--input-type=module", "-e", seedScript],
  { env, stdio: "pipe" },
);

// 3. Start Next.js server on port 3105
const server = spawn(
  process.execPath,
  ["node_modules/.bin/next", "start", "-p", String(port)],
  {
    env,
    stdio: "inherit",
  },
);

const cleanup = async () => {
  server.kill("SIGTERM");
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
};

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(1);
});
process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(1);
});

// Wait for server readiness
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(base + "/login");
    if (res.ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

// 4. Run Playwright browser tests
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.type(), msg.text()));
  page.on("requestfailed", (req) => console.log("REQ FAILED:", req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("HTTP ERROR:", res.status(), res.url());
  });

  // Step A: Login as operator
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app/dashboard");
  await page.waitForLoadState("networkidle");

  console.log("PASS 1: Operator login success");

  // Debug: print current page content and links
  const links = await page.evaluate(() => Array.from(document.querySelectorAll("a")).map(a => ({ text: a.innerText, href: a.getAttribute("href") })));
  console.log("DEBUG LINKS:", JSON.stringify(links));
  console.log("DEBUG URL:", page.url());
  console.log("DEBUG COOKIES:", JSON.stringify(await context.cookies()));
  console.log("DEBUG BODY:", await page.evaluate(() => document.body.innerHTML));
  console.log("PAGE ERRORS:", JSON.stringify(pageErrors));

  // Step B: Check Sidebar Menu & Badge Counter
  const mandiriLink = page.getByRole("link", {
    name: /Permohonan Mandiri/i,
  });
  await mandiriLink.waitFor();

  // Check badge counter is visible and contains 1
  const badgeLocator = mandiriLink.locator(".nav-badge");
  await badgeLocator.waitFor({ timeout: 5000 });
  const badgeText = await badgeLocator.textContent();
  assert.equal(badgeText?.trim(), "1", "Badge counter should show 1 pending request");
  console.log("PASS 2: Sidebar menu 'Permohonan Mandiri' with badge counter '1' verified");

  // Step C: Navigate to List Page (/app/permohonan-mandiri or /admin/permohonan-mandiri)
  await mandiriLink.click();
  await page.waitForURL("**/app/permohonan-mandiri");
  await page
    .getByRole("heading", { name: "Permohonan Mandiri", exact: true })
    .waitFor();

  // Verify Table Headers & Content
  const table = page.locator("table");
  await table.waitFor();
  assert.ok(await table.getByText("TIK-TEST-001").isVisible());
  assert.ok(await table.getByText("Budi Santoso").isVisible());
  assert.ok(await table.getByText("Menunggu Verifikasi").isVisible());
  console.log("PASS 3: Responsive table list displays ticket, applicant name, and status");

  // Verify Filter Tabs
  const tabRevisi = page.getByRole("button", { name: "Perlu Perbaikan" });
  await tabRevisi.click();
  // Should show empty for NEEDS_REVISION
  await page.getByText("Tidak ada permohonan mandiri").waitFor();

  const tabSemua = page.getByRole("button", { name: "Semua" });
  await tabSemua.click();
  await table.getByText("TIK-TEST-001").waitFor();
  console.log("PASS 4: Filter tabs work correctly");

  // Step D: Open Detail Page
  await page.getByRole("link", { name: "Periksa" }).click();
  await page.waitForURL("**/app/permohonan-mandiri/*");

  // Verify 3-card layout
  await page.getByText("Data Pemohon & Kontak").waitFor();
  await page.getByText("Lampiran Berkas Warga").waitFor();
  await page.getByText("Formulir Surat").waitFor();

  const mainArea = page.getByRole("main");
  assert.ok(await mainArea.getByText("Budi Santoso").isVisible());
  assert.ok(await mainArea.getByText("3201010101010001").isVisible());
  assert.ok(await mainArea.getByText("08123456789").isVisible());
  assert.ok(await mainArea.getByRole("link", { name: /Hubungi via WhatsApp/i }).isVisible());
  console.log("PASS 5: Card 1 (Applicant data & WhatsApp action) verified");

  // Card 2: Attachment preview
  const imgPreview = page.locator("img[alt='Lampiran 1']");
  await imgPreview.waitFor();
  console.log("PASS 6: Card 2 (In-browser attachment preview) verified");

  // Card 3: Form data
  assert.ok(await page.getByText("pendaftaran sekolah anak").isVisible());
  console.log("PASS 7: Card 3 (Form data) verified");

  // Step E: Test Edit Redaksi Sesuai SOP
  const editBtn = page.getByRole("button", { name: "Edit Data / Sesuaikan Redaksi" });
  await editBtn.click();
  const editDialog = page.getByRole("dialog");
  await editDialog.waitFor();

  const keperluanInput = editDialog.locator("textarea");
  await keperluanInput.fill("Persyaratan pendaftaran sekolah putra");
  await editDialog.getByRole("button", { name: "Simpan Perubahan Redaksi" }).click();

  // Wait for dialog close and updated text
  await page.waitForFunction(() => {
    return document.body.innerText.includes("Persyaratan pendaftaran sekolah putra");
  });
  console.log("PASS 8: Edit redaksi keperluan updated and rendered");

  // Step F: Test Minta Perbaikan dialog
  const mintaRevisiBtn = page.getByRole("button", { name: "Minta Perbaikan" });
  await mintaRevisiBtn.click();
  const dialogRevisi = page.getByRole("dialog");
  await dialogRevisi.waitFor();
  await dialogRevisi.locator("textarea").fill("Mohon unggah surat pengantar RT yang berstempel basah");
  await dialogRevisi.getByRole("button", { name: "Kirim Permintaan Perbaikan" }).click();

  // Wait for status change to NEEDS_REVISION
  await page.waitForFunction(() => {
    return document.body.innerText.includes("Menunggu Perbaikan Pemohon");
  });
  console.log("PASS 9: Action 'Minta Perbaikan' transitions status and shows notice");

  // Step G: Test Setujui & Buat Surat Dinas
  // Permohonan can still be approved from NEEDS_REVISION or PENDING_VERIFICATION
  const setujuiBtn = page.getByRole("button", { name: "Setujui & Terbitkan / Buat Surat" });
  await setujuiBtn.click();
  const dialogSetujui = page.getByRole("dialog");
  await dialogSetujui.waitFor();
  await dialogSetujui.getByRole("button", { name: "Setujui & Buat Surat Dinas" }).click();

  // Should redirect to official letter draft page (/app/pelayanan/[letter_id])
  await page.waitForURL("**/app/pelayanan/*", { timeout: 30000 });
  console.log("PASS 10: Action 'Setujui' generates official letter draft and redirects operator");

  // Step H: Check No Emoji in UI
  const bodyText = await page.evaluate(() => document.body.innerText);
  const emojiRegex =
    /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  // Ignore copyright symbol if any
  const matchedEmoji = (bodyText.match(emojiRegex) || []).filter(
    (e) => e !== "\u00a9" && e !== "\u00ae" && e !== "\u2014" && e !== "\u2013",
  );
  assert.equal(
    matchedEmoji.length,
    0,
    `Found prohibited emoji in UI: ${matchedEmoji.join(", ")}`,
  );
  console.log("PASS 11: Verified zero emoji in operator UI");

  assert.equal(pageErrors.length, 0, `Page errors encountered: ${pageErrors.join(", ")}`);
  console.log("ALL TESTS PASSED SUCCESSFULLY!");
} finally {
  if (browser) await browser.close();
  await cleanup();
}
