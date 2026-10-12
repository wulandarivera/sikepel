import assert from "node:assert/strict";
import http from "node:http";
import { config } from "../src/config.js";
import {
  normalizePhoneToJid,
  createHttpServer,
} from "../src/server.js";
import {
  formatNotificationMessage,
  type StatusNotificationPayload,
} from "../src/formatters.js";

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

function assertNoEmoji(text: string, context: string) {
  assert.ok(
    !EMOJI_REGEX.test(text),
    `Terdeteksi emoji pada ${context}: "${text}"`,
  );
}

async function runTests() {
  console.log("Menjalankan pengujian mock dispatcher notifikasi...");

  // 1. Normalisasi nomor telepon ke WhatsApp JID
  assert.equal(
    normalizePhoneToJid("081234567890"),
    "6281234567890@s.whatsapp.net",
  );
  assert.equal(
    normalizePhoneToJid("6281234567890"),
    "6281234567890@s.whatsapp.net",
  );
  assert.equal(
    normalizePhoneToJid("+62 812-3456-7890"),
    "6281234567890@s.whatsapp.net",
  );
  assert.equal(
    normalizePhoneToJid("81234567890"),
    "6281234567890@s.whatsapp.net",
  );

  // 2. Format pesan notifikasi status: APPROVED, COMPLETED/SIAP_DIAMBIL, NEEDS_REVISION, REJECTED
  const payloads: StatusNotificationPayload[] = [
    {
      to: "081234567890",
      ticket: "TIK-202610-11223344",
      status: "APPROVED",
      type_name: "Surat Pengantar Nikah",
      resident_name: "Siti Aminah",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-11223344",
      status: "COMPLETED",
      type_name: "Surat Pengantar Nikah",
      resident_name: "Siti Aminah",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-11223344",
      status: "SIAP_DIAMBIL",
      type_name: "Surat Pengantar Nikah",
      resident_name: "Siti Aminah",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-11223344",
      status: "NEEDS_REVISION",
      type_name: "Surat Keterangan Belum Menikah",
      resident_name: "Budi Santoso",
      note: "Lampiran pengantar RT belum ditandatangani",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-11223344",
      status: "REJECTED",
      type_name: "Surat Keterangan Domisili Usaha",
      resident_name: "Joko Widodo",
      note: "Alamat usaha tidak berada dalam wilayah Kelurahan Cibodas",
    },
  ];

  for (const p of payloads) {
    const msg = formatNotificationMessage(p);
    assertNoEmoji(msg, `formatNotificationMessage untuk status ${p.status}`);
    assert.ok(msg.includes(p.ticket), "Harus memuat nomor tiket");
    assert.ok(!msg.includes(p.type_name), "Jenis surat privat tidak dikirim");
    if (p.resident_name) {
      assert.ok(!msg.includes(p.resident_name), "Nama privat tidak dikirim");
    }

    if (p.status === "APPROVED" || p.status === "COMPLETED" || p.status === "SIAP_DIAMBIL") {
      assert.ok(
        msg.includes("portal"),
        `Pemberitahuan status ${p.status} wajib menegaskan surat fisik diambil langsung di loket`,
      );
      assert.ok(
        !msg.includes("JANGAN PERNAH"),
        `Pemberitahuan status ${p.status} tidak boleh memuat kata JANGAN PERNAH`,
      );
    }
  }

  // 3. Uji endpoint internal HTTP server dengan mock session manager
  let sentMessagePayload: any = null;
  const mockSessionManager: any = {
    getStatus: () => ({ connected: true, hasQr: false, user: "628999999999@s.whatsapp.net" }),
    getQR: () => null,
    getSocket: () => ({
      sendMessage: async (jid: string, content: any) => {
        sentMessagePayload = { jid, content };
        return { key: { id: "MOCK_MSG_ID" } };
      },
    }),
  };

  const previousSessionDir = config.sessionDir;
  const fs = await import("node:fs/promises");
  const fixtureSessionDir = await fs.mkdtemp("/tmp/wa-dispatch-fixture-");
  // Ledger captures sessionDir at server construction; isolate before creation.
  config.sessionDir = fixtureSessionDir;
  const testServer = createHttpServer(mockSessionManager);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", () => resolve()));
  const address = testServer.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const previousSecret = config.secret;
  config.secret = "test-only";

  const headers = { "Content-Type": "application/json", Authorization: "Bearer test-only" };
  try {
    // Check GET /health
    const healthRes = await fetch(`${baseUrl}/health`, { headers });
    assert.equal(healthRes.status, 200);
    const healthJson: any = await healthRes.json();
    assert.equal(healthJson.connected, true);
    assert.equal(healthJson.service, "sikepel-whatsapp-gateway");

    // Check POST /notify
    const notifyPayload = {
      to: "081234567890",
      ticket: "TIK-202610-88776655",
      status: "APPROVED",
      type_name: "Surat Keterangan Kematian",
      resident_name: "Dewi Lestari",
    };
    const notifyRes = await fetch(`${baseUrl}/notify`, {
      method: "POST",
      headers,
      body: JSON.stringify(notifyPayload),
    });
    assert.equal(notifyRes.status, 200);
    const notifyJson: any = await notifyRes.json();
    assert.equal(notifyJson.ok, true);
    assert.equal(notifyJson.recipient, "6281234567890@s.whatsapp.net");

    // Verify what mock socket received
    assert.ok(sentMessagePayload);
    assert.equal(sentMessagePayload.jid, "6281234567890@s.whatsapp.net");
    assert.ok(sentMessagePayload.content.text.includes("TIK-202610-88776655"));
    assert.ok(
      sentMessagePayload.content.text.includes("portal"),
    );
    assert.ok(
      !sentMessagePayload.content.text.includes("JANGAN PERNAH"),
    );

    // Check POST /send
    const sendRes = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({ to: "08987654321", text: "Halo warga Cibodas" }),
    });
    assert.equal(sendRes.status, 200);
    assert.equal(sentMessagePayload.jid, "628987654321@s.whatsapp.net");
    assert.equal(sentMessagePayload.content.text, "Halo warga Cibodas");
  } finally {
    config.secret = previousSecret;
    await new Promise<void>((resolve, reject) => testServer.close(err => err ? reject(err) : resolve()));
    config.sessionDir = previousSessionDir;
    await fs.rm(fixtureSessionDir, { recursive: true, force: true });
  }

  console.log("Semua pengujian mock dispatcher notifikasi berhasil 100%.");
}

runTests().catch((err) => {
  console.error("Gagal pengujian mock dispatcher:", err);
  process.exit(1);
});
