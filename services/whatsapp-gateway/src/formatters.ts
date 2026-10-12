import { safeWaNotice } from "./wa-notice.js";
export interface TicketRecord {
  ticket_code: string;
  type_name: string;
  status: string;
  resident_name?: string;
  created_at?: string | Date;
  verified_at?: string | Date;
  revision_note?: string | null;
}

export function formatBotMenu(): string {
  return [
    "Selamat datang di SIKEPEL Kelurahan Cibodas.",
    "Pengajuan surat: https://mandiri.sikepel.biz.id",
    "Lacak permohonan: https://mandiri.sikepel.biz.id/lacak (gunakan tiket dan tanggal lahir pemohon).",
    "Surat fisik diambil di loket setelah dinyatakan siap. WhatsApp tidak mengirim PDF surat.",
    "Ketik ajukan, status, persyaratan, atau bantuan.",
  ].join("\n");
}

export function formatTicketStatusReply(data: TicketRecord): string {
  const code = data.ticket_code;
  const jenis = data.type_name || "Surat Keterangan";
  const nama = data.resident_name ? `Pemohon: ${data.resident_name}\n` : "";

  let statusLabel = "";
  let keterangan = "";

  switch (data.status) {
    case "PENDING_VERIFICATION":
      statusLabel = "MENUNGGU VERIFIKASI (MENUNGGU_VERIFIKASI)";
      keterangan =
        "Permohonan Anda telah diterima sistem dan sedang dalam antrean pemeriksaan berkas oleh operator Kelurahan Cibodas.";
      break;

    case "NEEDS_REVISION":
      statusLabel = "PERLU PERBAIKAN (PERLU_PERBAIKAN)";
      keterangan =
        `Operator meminta perbaikan berkas dengan catatan:\n"${data.revision_note || "Lengkapi data atau berkas persyaratan."}"\n\n` +
        `Silakan perbarui permohonan Anda melalui tautan resmi:\nhttps://mandiri.sikepel.biz.id/lacak?tiket=${encodeURIComponent(code)}`;
      break;

    case "APPROVED":
      statusLabel = "DISETUJUI (DISETUJUI)";
      keterangan =
        "Permohonan telah disetujui oleh operator. Draf surat dinas sedang diproses untuk penandatanganan.\n\n" +
        "Pemberitahuan: Surat fisik diambil langsung di loket pelayanan Kantor Kelurahan Cibodas. Anda akan menerima pemberitahuan ketika dokumen siap diambil.";
      break;

    case "COMPLETED":
    case "SIAP_DIAMBIL":
      statusLabel = "SIAP DIAMBIL / SELESAI (SIAP_DIAMBIL)";
      keterangan =
        "Surat fisik Anda sudah selesai dicetak dan siap diambil di loket pelayanan Kantor Kelurahan Cibodas.\n" +
        "Harap membawa KTP elektronik asli dan dokumen persyaratan asli untuk verifikasi langsung di loket.\n\n" +
        "Pemberitahuan: Surat fisik diambil langsung di loket pelayanan Kantor Kelurahan Cibodas.";
      break;

    case "REJECTED":
      statusLabel = "DITOLAK (DITOLAK)";
      keterangan =
        `Permohonan belum dapat disetujui dengan alasan:\n"${data.revision_note || "Persyaratan tidak terpenuhi."}"\n\n` +
        "Untuk informasi lebih lanjut, silakan datang langsung ke loket pelayanan Kantor Kelurahan Cibodas.";
      break;

    default:
      statusLabel = data.status;
      keterangan =
        "Status permohonan sedang diproses dalam sistem SIKEPEL.";
      break;
  }

  return [
    "HASIL PENGECEKAN STATUS PERMOHONAN SIKEPEL",
    "",
    `Nomor Tiket: ${code}`,
    `Jenis Surat: ${jenis}`,
    nama.trim(),
    `Status Saat Ini: ${statusLabel}`,
    "",
    keterangan,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTicketNotFoundReply(ticketCode: string): string {
  return [
    "NOMOR TIKET TIDAK DITEMUKAN",
    "",
    `Nomor tiket "${ticketCode}" tidak ditemukan dalam pangkalan data permohonan mandiri SIKEPEL Kelurahan Cibodas.`,
    "",
    "Petunjuk:",
    "1. Pastikan penulisan nomor tiket sesuai dengan tanda bukti pengajuan Anda (contoh: TIK-202610-A1B2C3D4).",
    "2. Jika baru saja mengajukan, pastikan pengajuan telah berhasil disubmit pada portal: https://mandiri.sikepel.biz.id",
    "3. Hubungi loket pelayanan Kantor Kelurahan Cibodas jika membutuhkan bantuan teknis.",
  ].join("\n");
}

export interface StatusNotificationPayload {
  to: string;
  ticket: string;
  status: "SUBMITTED" | "TIKET_BARU" | "TIKET BARU" | "PENDING_VERIFICATION" | "APPROVED" | "COMPLETED" | "SIAP_DIAMBIL" | "REJECTED" | "NEEDS_REVISION";
  type_name: string;
  resident_name?: string;
  note?: string;
}

export function formatNotificationMessage(payload: StatusNotificationPayload): string {
  return safeWaNotice(payload);
}
