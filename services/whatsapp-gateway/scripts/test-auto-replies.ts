import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AutoReplyStore, cleanTextNoEmoji } from "../src/auto-replies.js";
import { createHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { WhatsAppSessionManager } from "../src/session.js";

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

function assertNoEmoji(text: string, context: string) {
  assert.ok(!EMOJI_REGEX.test(text), `Terdeteksi emoji pada ${context}: "${text}"`);
}

test("AutoReplyStore: inisialisasi berkas terisolasi, CRUD dan template bawaan", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-replies-test-"));
  const tmpFile = path.join(tmpDir, "auto-replies.json");

  try {
    const store = new AutoReplyStore(tmpFile);
    await store.init();

    // 1. Template bawaan harus terisi
    const initialItems = store.getAll();
    assert.ok(initialItems.length >= 3, "Harus memuat minimal 3 template bawaan");
    for (const item of initialItems) {
      assertNoEmoji(item.keyword, "keyword bawaan");
      assertNoEmoji(item.reply_text, "reply_text bawaan");
    }

    // 2. Tambah template baru (CREATE)
    const created = await store.create({
      keyword: "biaya surat",
      match_type: "EXACT",
      reply_text: "Pelayanan seluruh surat keterangan di Kelurahan Cibodas adalah GRATIS tanpa pungutan biaya.",
      is_active: true,
      created_by: "Operator",
    });
    assert.ok(created.id, "ID harus terisi");
    assert.equal(created.keyword, "biaya surat");
    assert.equal(created.match_type, "EXACT");
    assert.equal(created.is_active, true);

    // 3. Baca satu template (GET)
    const fetched = store.get(created.id);
    assert.ok(fetched, "Item harus ditemukan");
    assert.equal(fetched.keyword, "biaya surat");

    // 4. Perbarui template (UPDATE)
    const updated = await store.update(created.id, {
      reply_text: "Pelayanan surat di loket resmi adalah 100% GRATIS.",
      is_active: false,
    });
    assert.ok(updated, "Item berhasil diperbarui");
    assert.equal(updated.reply_text, "Pelayanan surat di loket resmi adalah 100% GRATIS.");
    assert.equal(updated.is_active, false);

    // 5. Hapus template (DELETE)
    const deleted = await store.delete(created.id);
    assert.equal(deleted, true);
    assert.equal(store.get(created.id), null);

    // 6. Cek persistensi berkas JSON
    const fileContent = JSON.parse(await fs.readFile(tmpFile, "utf-8"));
    assert.ok(Array.isArray(fileContent));
    assert.ok(fileContent.length >= 3);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("AutoReplyStore: logika pencocokan EXACT, CONTAINS, REGEX dan variabel dinamis", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-match-test-"));
  const tmpFile = path.join(tmpDir, "auto-replies.json");

  try {
    const store = new AutoReplyStore(tmpFile);
    await store.init();

    await store.create({
      keyword: "jadwal",
      match_type: "EXACT",
      reply_text: "Halo {nama}, jadwal pelayanan buka setiap hari kerja.",
      is_active: true,
    });

    await store.create({
      keyword: "syarat sku",
      match_type: "CONTAINS",
      reply_text: "Yth. {nama}, persyaratan Surat Keterangan Usaha: KTP, KK, dan foto lokasi usaha.",
      is_active: true,
    });

    await store.create({
      keyword: "\\b(jam|waktu)\\s+buka\\b",
      match_type: "REGEX",
      reply_text: "Sdr/i {nama}, loket dibuka pukul 08.00 WIB.",
      is_active: true,
    });

    await store.create({
      keyword: "nonaktif",
      match_type: "CONTAINS",
      reply_text: "Pesan ini tidak boleh terkirim.",
      is_active: false,
    });

    const sender = { name: "Ahmad Dahlan", phone: "081234567890" };

    // Uji EXACT
    const exactMatch = store.findMatchingReply("jadwal", sender);
    assert.ok(exactMatch?.includes("Ahmad Dahlan"), "Variabel {nama} harus terisi Ahmad Dahlan");
    assert.ok(exactMatch?.includes("jadwal pelayanan buka"), "Harus cocok EXACT");

    const exactFail = store.findMatchingReply("halo apa jadwal", sender);
    assert.notEqual(exactFail, "Halo Ahmad Dahlan, jadwal pelayanan buka setiap hari kerja.");

    // Uji CONTAINS
    const containsMatch = store.findMatchingReply("Permisi mau tanya syarat sku apa ya?", sender);
    assert.ok(containsMatch?.includes("Surat Keterangan Usaha"), "Harus cocok CONTAINS");
    assert.ok(containsMatch?.includes("Ahmad Dahlan"), "Harus mengganti nama");

    // Uji REGEX
    const regexMatch1 = store.findMatchingReply("Mohon info jam buka hari ini", sender);
    assert.ok(regexMatch1?.includes("pukul 08.00 WIB"), "Regex harus cocok");

    const regexMatch2 = store.findMatchingReply("waktu buka kantor kapan ya", sender);
    assert.ok(regexMatch2?.includes("pukul 08.00 WIB"), "Regex harus cocok variasi");

    // Uji template nonaktif
    const inactiveMatch = store.findMatchingReply("cek status nonaktif", sender);
    assert.equal(inactiveMatch, null, "Template nonaktif tidak boleh cocok");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("HTTP Server: Endpoint /auto-replies (GET, POST, PUT, DELETE) dengan otorisasi dan lingkup kelurahan", async () => {
  const manager = new WhatsAppSessionManager();
  const server = createHttpServer(manager);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const oldSecret = config.secret;
  const oldVillage = process.env.WA_GATEWAY_VILLAGE_ID;
  config.secret = "rahasia-test";
  process.env.WA_GATEWAY_VILLAGE_ID = "v-cibodas";

  const headers = {
    authorization: "Bearer rahasia-test",
    "x-wa-village-id": "v-cibodas",
    "content-type": "application/json",
  };

  try {
    // 1. Tanpa otorisasi -> 401
    const unauth = await fetch(`${baseUrl}/auto-replies`);
    assert.equal(unauth.status, 401);

    // 2. Lingkup kelurahan salah -> 403
    const wrongVillage = await fetch(`${baseUrl}/auto-replies`, {
      headers: { authorization: "Bearer rahasia-test", "x-wa-village-id": "v-lain" },
    });
    assert.equal(wrongVillage.status, 403);

    // 3. GET /auto-replies dengan token valid -> 200
    const listRes = await fetch(`${baseUrl}/auto-replies`, { headers });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.ok, true);
    assert.ok(Array.isArray(listData.data));

    // 4. POST /auto-replies dengan emoji -> 400 Bad Request
    const emojiPost = await fetch(`${baseUrl}/auto-replies`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        keyword: "kontak \u{1f600}",
        match_type: "EXACT",
        reply_text: "Hubungi kantor kelurahan",
      }),
    });
    assert.equal(emojiPost.status, 400);

    // 5. POST /auto-replies valid -> 201 Created
    const createRes = await fetch(`${baseUrl}/auto-replies`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        keyword: "kontak darurat",
        match_type: "CONTAINS",
        reply_text: "Nomor darurat kelurahan: 112 atau 021-1234567.",
        is_active: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdData = await createRes.json();
    assert.equal(createdData.ok, true);
    const newId = createdData.data.id;
    assert.ok(newId);

    // 6. PUT /auto-replies/:id valid -> 200 OK
    const updateRes = await fetch(`${baseUrl}/auto-replies/${newId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        reply_text: "Nomor darurat kelurahan diperbarui: 112.",
        is_active: false,
      }),
    });
    assert.equal(updateRes.status, 200);
    const updatedData = await updateRes.json();
    assert.equal(updatedData.data.reply_text, "Nomor darurat kelurahan diperbarui: 112.");
    assert.equal(updatedData.data.is_active, false);

    // 7. DELETE /auto-replies/:id -> 200 OK
    const deleteRes = await fetch(`${baseUrl}/auto-replies/${newId}`, {
      method: "DELETE",
      headers,
    });
    assert.equal(deleteRes.status, 200);

    // 8. DELETE lagi untuk id yang sama -> 404 Not Found
    const deleteAgain = await fetch(`${baseUrl}/auto-replies/${newId}`, {
      method: "DELETE",
      headers,
    });
    assert.equal(deleteAgain.status, 404);
  } finally {
    config.secret = oldSecret;
    if (oldVillage !== undefined) process.env.WA_GATEWAY_VILLAGE_ID = oldVillage;
    else delete process.env.WA_GATEWAY_VILLAGE_ID;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
