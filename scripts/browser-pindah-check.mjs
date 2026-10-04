import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";

const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(
  /Kata sandi semua akun contoh: (.+)/,
)[1];
const installed = JSON.parse(
  await fs.readFile(".data/template-pindah/installed.json", "utf8"),
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
    .filter({ hasText: "Surat Pindah" })
    .getByRole("button", { name: "Buat Surat", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Cari NIK atau nama penduduk…" })
    .fill("Ahmad");
  await page
    .getByRole("button", { name: "Pilih Penduduk", exact: true })
    .first()
    .click();
  const destination = {
    alamat_pindah: "Jl. Anggrek No. 25", rt_pindah: "005", rw_pindah: "002",
    kel_pindah: "Cibodas Baru", kec_pindah: "Cibodas", kota_pindah: "Kota Tangerang",
    provinsi_pindah: "Banten", pos_pindah: "15138",
  };
  for (const [key, value] of Object.entries(destination)) await page.locator("#" + key).fill(value);
  for (const key of ["no_klasifikasi_pindah", "no_alasan_pindah", "no_jenis_pindah", "no_anggota_pindah", "no_keluarga_pindah"])
    await page.locator("#" + key).selectOption({ index: 2 });
  await page.locator('[id="anggota_pindah.0.shdk"]').fill("Kepala Keluarga");
  await page.getByRole("button", { name: "Tambah anggota keluarga", exact: true }).click();
  await page.locator('[id="anggota_pindah.1.nik"]').fill("0000000000000002");
  await page.locator('[id="anggota_pindah.1.nama"]').fill("Siti Aminah");
  await page.locator('[id="anggota_pindah.1.shdk"]').fill("Istri");
  await page.getByRole("button", { name: "Tambah anggota keluarga", exact: true }).click();
  await page.getByRole("button", { name: "Hapus anggota 3", exact: true }).click();
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await page.waitForURL("**/app/pelayanan/draft/*");
  await page.reload();
  await page.locator('[id="anggota_pindah.1.nama"]').waitFor();
  assert.equal(await page.locator('[id="anggota_pindah.1.nama"]').inputValue(), "Siti Aminah");
  assert.equal(await page.locator('[id="anggota_pindah.1.shdk"]').inputValue(), "Istri");
  assert.equal(await page.locator('#alamat_pindah').inputValue(), destination.alamat_pindah);
  await page.screenshot({
    path: ".data/template-pindah/form.png",
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
  assert.equal(detail.snapshot.form_data.anggota_pindah.length, 2);
  assert.equal(detail.snapshot.form_data.anggota_pindah[1].nama, "Siti Aminah");
  for (const [key, value] of Object.entries(destination)) assert.equal(detail.snapshot.form_data[key], value);
  const pdf = await context.request.get(
    base + `/api/letters/${id}/pdf?preview=1`,
  );
  assert.equal(pdf.status(), 200);
  await fs.writeFile(
    ".data/template-pindah/application-preview.pdf",
    await pdf.body(),
  );
  await page.screenshot({
    path: ".data/template-pindah/application-preview.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    ".data/template-pindah/browser-result.json",
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

