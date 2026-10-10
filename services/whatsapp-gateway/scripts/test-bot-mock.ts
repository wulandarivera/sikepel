import assert from "node:assert/strict";
import {
  processMessageText,
  extractMessageText,
} from "../src/bot.js";
import {
  formatBotMenu,
  formatTicketStatusReply,
  formatTicketNotFoundReply,
  type TicketRecord,
} from "../src/formatters.js";

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

function assertNoEmoji(text: string, context: string) {
  assert.ok(
    !EMOJI_REGEX.test(text),
    `Terdeteksi emoji pada ${context}: "${text}"`,
  );
}

async function runTests() {
  console.log("Menjalankan pengujian mock hotline bot Baileys...");

  // 1. Uji Menu Utama & Sapaan
  const menuText = formatBotMenu();
  assertNoEmoji(menuText, "formatBotMenu");
  assert.ok(
    menuText.includes("https://mandiri.sikepel.biz.id/ajukan"),
    "Menu harus memuat link portal resmi",
  );
  assert.ok(
    menuText.includes("TIK-YYYYMM-XXXXXXXX"),
    "Menu harus memuat contoh format tiket",
  );
  assert.ok(
    menuText.includes("Surat fisik diambil langsung di loket pelayanan kantor kelurahan."),
    "Menu wajib memuat penegasan surat fisik diambil di loket pelayanan",
  );
  assert.ok(
    !menuText.includes("JANGAN PERNAH"),
    "Menu tidak boleh memuat peringatan internal JANGAN PERNAH",
  );

  // 2. Uji respon sapaan via processMessageText
  const greetings = ["halo", "assalamualaikum", "menu", "selamat pagi", "info layanan"];
  for (const g of greetings) {
    const res = await processMessageText(g);
    assert.ok(res !== null, `Harus merespon sapaan ${g}`);
    assertNoEmoji(res, `processMessageText greeting ${g}`);
    assert.ok(res.includes("LAYANAN HOTLINE WARGA"), "Respon harus berupa menu hotline");
  }

  // 3. Uji respon pengajuan surat langsung
  const ajukanReqs = ["mau ajukan surat", "minta link buat surat", "bagaimana cara bikin surat"];
  for (const q of ajukanReqs) {
    const res = await processMessageText(q);
    assert.ok(res !== null, `Harus merespon pertanyaan ${q}`);
    assertNoEmoji(res, `processMessageText ajukan ${q}`);
    assert.ok(res.includes("https://mandiri.sikepel.biz.id/ajukan"), "Harus menyertakan link ajukan");
    assert.ok(res.includes("Surat fisik diambil langsung di loket pelayanan kantor kelurahan."), "Wajib memuat klausul fisik di loket");
    assert.ok(!res.includes("JANGAN PERNAH"), "Tidak boleh memuat frasa JANGAN PERNAH");
  }

  // 4. Uji format status permohonan untuk seluruh kemungkinan status
  const statuses = [
    {
      status: "PENDING_VERIFICATION",
      expectedStatus: "MENUNGGU_VERIFIKASI",
      note: null,
    },
    {
      status: "NEEDS_REVISION",
      expectedStatus: "PERLU_PERBAIKAN",
      note: "Mohon lampirkan ulang foto KTP yang lebih jelas",
    },
    {
      status: "APPROVED",
      expectedStatus: "DISETUJUI",
      note: null,
    },
    {
      status: "COMPLETED",
      expectedStatus: "SIAP_DIAMBIL",
      note: null,
    },
    {
      status: "REJECTED",
      expectedStatus: "DITOLAK",
      note: "Pemohon bukan warga Kelurahan Cibodas",
    },
  ];

  for (const item of statuses) {
    const record: TicketRecord = {
      ticket_code: "TIK-202610-A1B2C3D4",
      type_name: "Surat Keterangan Usaha",
      status: item.status,
      resident_name: "Ahmad Dahlan",
      revision_note: item.note,
    };

    const reply = formatTicketStatusReply(record);
    assertNoEmoji(reply, `formatTicketStatusReply untuk status ${item.status}`);
    assert.ok(reply.includes(record.ticket_code), "Harus memuat nomor tiket");
    assert.ok(reply.includes(record.type_name), "Harus memuat nama jenis surat");
    assert.ok(reply.includes(item.expectedStatus), `Harus memuat teks status ${item.expectedStatus}`);

    if (item.status === "APPROVED" || item.status === "COMPLETED") {
      assert.ok(
        reply.includes("Surat fisik diambil langsung di loket pelayanan kantor kelurahan."),
        `Status ${item.status} wajib menegaskan surat fisik diambil di loket`,
      );
      assert.ok(
        !reply.includes("JANGAN PERNAH"),
        `Status ${item.status} tidak boleh memuat frasa internal JANGAN PERNAH`,
      );
    }
  }

  // 5. Uji format tiket tidak ditemukan
  const notFoundReply = formatTicketNotFoundReply("TIK-202610-99999999");
  assertNoEmoji(notFoundReply, "formatTicketNotFoundReply");
  assert.ok(notFoundReply.includes("TIK-202610-99999999"));
  assert.ok(notFoundReply.includes("tidak ditemukan"));

  // 6. Uji ekstraksi teks pesan Baileys
  assert.equal(
    extractMessageText({
      key: { remoteJid: "123@s.whatsapp.net" },
      message: { conversation: "halo admin" },
    } as any),
    "halo admin",
  );
  assert.equal(
    extractMessageText({
      key: { remoteJid: "123@s.whatsapp.net" },
      message: { extendedTextMessage: { text: "cek TIK-202610-A1B2C3D4" } },
    } as any),
    "cek TIK-202610-A1B2C3D4",
  );

  console.log("Semua pengujian mock hotline bot berhasil 100%.");
}

runTests().catch((err) => {
  console.error("Gagal pengujian mock hotline bot:", err);
  process.exit(1);
});
