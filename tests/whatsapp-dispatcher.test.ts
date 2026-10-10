import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  formatWhatsAppMessage,
  notifyPermohonanStatus,
  type PermohonanNotificationPayload,
} from "../src/server/whatsapp";

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

function assertNoEmoji(text: string, context: string) {
  assert.ok(
    !EMOJI_REGEX.test(text),
    `Terdeteksi emoji pada ${context}: "${text}"`,
  );
}

test("WhatsApp Dispatcher: format notifikasi bebas emoji dan mematuhi penegasan surat fisik tanpa PDF", () => {
  const payloads: PermohonanNotificationPayload[] = [
    {
      to: "081234567890",
      ticket: "TIK-202610-A1B2C3D4",
      status: "APPROVED",
      type_name: "Surat Keterangan Usaha",
      resident_name: "Budi Santoso",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-A1B2C3D4",
      status: "COMPLETED",
      type_name: "Surat Keterangan Domisili",
      resident_name: "Siti Rahma",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-A1B2C3D4",
      status: "SIAP_DIAMBIL",
      type_name: "Surat Keterangan Belum Menikah",
      resident_name: "Ahmad Faisal",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-A1B2C3D4",
      status: "NEEDS_REVISION",
      type_name: "Surat Pengantar Nikah",
      resident_name: "Dewi Kartika",
      note: "Lampiran KK tidak terbaca",
    },
    {
      to: "081234567890",
      ticket: "TIK-202610-A1B2C3D4",
      status: "REJECTED",
      type_name: "Surat Keterangan Kematian",
      resident_name: "Hendra Wijaya",
      note: "Berkas tidak lengkap",
    },
  ];

  for (const p of payloads) {
    const msg = formatWhatsAppMessage(p);
    assertNoEmoji(msg, `formatWhatsAppMessage status ${p.status}`);
    assert.ok(msg.includes(p.ticket), `Harus memuat nomor tiket ${p.ticket}`);
    assert.ok(msg.includes(p.type_name), `Harus memuat jenis surat ${p.type_name}`);

    // Penegasan surat fisik diambil langsung di loket pelayanan Kantor Kelurahan Cibodas
    if (["APPROVED", "COMPLETED", "SIAP_DIAMBIL"].includes(p.status)) {
      assert.ok(
        msg.includes("Pemberitahuan: Surat fisik diambil langsung di loket pelayanan Kantor Kelurahan Cibodas"),
        `Status ${p.status} wajib memuat kalimat penegasan surat fisik`,
      );
      assert.ok(
        !msg.includes("JANGAN PERNAH"),
        `Status ${p.status} tidak boleh memuat kata JANGAN PERNAH`,
      );
    }
  }
});

test("WhatsApp Dispatcher: pengiriman ke endpoint gateway lokal berhasil", async () => {
  let receivedBody: any = null;
  let receivedAuth: string | undefined = undefined;

  const mockGateway = http.createServer((req, res) => {
    receivedAuth = req.headers["authorization"];
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      receivedBody = JSON.parse(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, recipient: "6281234567890@s.whatsapp.net" }));
    });
  });

  await new Promise<void>((resolve) => mockGateway.listen(0, "127.0.0.1", () => resolve()));
  const port = (mockGateway.address() as any).port;

  const originalUrl = process.env.WA_GATEWAY_URL;
  const originalSecret = process.env.WA_GATEWAY_SECRET;

  process.env.WA_GATEWAY_URL = `http://127.0.0.1:${port}`;
  process.env.WA_GATEWAY_SECRET = "test-secret-token";

  try {
    const result = await notifyPermohonanStatus({
      to: "081234567890",
      ticket: "TIK-202610-88889999",
      status: "APPROVED",
      type_name: "Surat Keterangan Usaha",
      resident_name: "Budi Santoso",
    });

    assert.equal(result.ok, true);
    assert.ok(receivedBody);
    assert.equal(receivedBody.ticket, "TIK-202610-88889999");
    assert.equal(receivedBody.status, "APPROVED");
    assert.equal(receivedAuth, "Bearer test-secret-token");
  } finally {
    mockGateway.close();
    process.env.WA_GATEWAY_URL = originalUrl;
    process.env.WA_GATEWAY_SECRET = originalSecret;
  }
});

test("WhatsApp Dispatcher: gateway offline tidak melempar eksepsi (graceful non-blocking)", async () => {
  const originalUrl = process.env.WA_GATEWAY_URL;
  process.env.WA_GATEWAY_URL = "http://127.0.0.1:49999"; // port non-existent

  try {
    const result = await notifyPermohonanStatus({
      to: "081234567890",
      ticket: "TIK-202610-77777777",
      status: "APPROVED",
      type_name: "Surat Keterangan Usaha",
    });

    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    process.env.WA_GATEWAY_URL = originalUrl;
  }
});
