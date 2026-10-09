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
    "LAYANAN HOTLINE WARGA KELURAHAN CIBODAS (SIKEPEL)",
    "",
    "Selamat datang di layanan pesan otomatis Kelurahan Cibodas.",
    "",
    "Pilihan Layanan Warga:",
    "1. Pengajuan Surat Mandiri",
    "   Akses portal resmi warga: https://mandiri.sikepel.biz.id/ajukan",
    "",
    "2. Cek Status Permohonan",
    "   Kirimkan nomor tiket permohonan Anda dengan format:",
    "   TIK-YYYYMM-XXXXXXXX",
    "   (Contoh: TIK-202610-A1B2C3D4)",
    "",
    "3. Informasi Jam Layanan Kantor",
    "   Kantor Kelurahan Cibodas melayani loket pada hari kerja:",
    "   Senin - Jumat: Pukul 08.00 - 15.00 WIB",
    "",
    "Pemberitahuan Wajib:",
    "Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).",
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
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF). Anda akan menerima pemberitahuan ketika dokumen siap diambil.";
      break;

    case "COMPLETED":
    case "SIAP_DIAMBIL":
      statusLabel = "SIAP DIAMBIL / SELESAI (SIAP_DIAMBIL)";
      keterangan =
        "Surat fisik Anda sudah selesai dicetak dan siap diambil di loket pelayanan Kantor Kelurahan Cibodas.\n" +
        "Harap membawa KTP elektronik asli dan dokumen persyaratan asli untuk verifikasi langsung di loket.\n\n" +
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).";
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
    "2. Jika baru saja mengajukan, pastikan pengajuan telah berhasil disubmit pada portal: https://mandiri.sikepel.biz.id/ajukan",
    "3. Hubungi loket pelayanan Kantor Kelurahan Cibodas jika membutuhkan bantuan teknis.",
  ].join("\n");
}

export interface StatusNotificationPayload {
  to: string;
  ticket: string;
  status: "APPROVED" | "COMPLETED" | "SIAP_DIAMBIL" | "REJECTED" | "NEEDS_REVISION";
  type_name: string;
  resident_name?: string;
  note?: string;
}

export function formatNotificationMessage(payload: StatusNotificationPayload): string {
  const nama = payload.resident_name ? `Yth. Sdr/i ${payload.resident_name},\n\n` : "";
  const code = payload.ticket;
  const jenis = payload.type_name || "Surat Keterangan";

  switch (payload.status) {
    case "APPROVED":
      return [
        "PEMBERITAHUAN SIKEPEL KELURAHAN CIBODAS",
        "",
        `${nama}Permohonan surat ${jenis} Anda dengan nomor tiket ${code} telah DISETUJUI oleh operator.`,
        "",
        "Draf surat dinas sedang diproses untuk penandatanganan resmi.",
        "",
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF). Anda akan diberitahu kembali setelah surat siap diambil.",
      ].join("\n");

    case "COMPLETED":
    case "SIAP_DIAMBIL":
      return [
        "PEMBERITAHUAN SIKEPEL KELURAHAN CIBODAS",
        "",
        `${nama}Permohonan surat ${jenis} Anda dengan nomor tiket ${code} saat ini SIAP DIAMBIL di loket pelayanan Kantor Kelurahan Cibodas.`,
        "",
        "Persyaratan Pengambilan:",
        "1. Membawa KTP elektronik asli pemohon.",
        "2. Membawa dokumen persyaratan asli untuk verifikasi akhir di loket.",
        "",
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).",
      ].join("\n");

    case "NEEDS_REVISION":
      return [
        "PEMBERITAHUAN SIKEPEL KELURAHAN CIBODAS",
        "",
        `${nama}Permohonan surat ${jenis} Anda dengan nomor tiket ${code} MEMERLUKAN PERBAIKAN BERKAS.`,
        "",
        "Catatan dari Petugas:",
        `"${payload.note || "Silakan periksa kembali kelengkapan data dan berkas persyaratan."}"`,
        "",
        "Tautan Perbaikan Mandiri:",
        `https://mandiri.sikepel.biz.id/lacak?tiket=${encodeURIComponent(code)}`,
      ].join("\n");

    case "REJECTED":
      return [
        "PEMBERITAHUAN SIKEPEL KELURAHAN CIBODAS",
        "",
        `${nama}Permohonan surat ${jenis} Anda dengan nomor tiket ${code} DITOLAK oleh operator.`,
        "",
        "Alasan Penolakan:",
        `"${payload.note || "Persyaratan atau verifikasi data tidak terpenuhi."}"`,
        "",
        "Silakan hubungi loket pelayanan Kantor Kelurahan Cibodas untuk penjelasan lebih lanjut.",
      ].join("\n");

    default:
      return [
        "PEMBERITAHUAN SIKEPEL KELURAHAN CIBODAS",
        "",
        `${nama}Status permohonan surat ${jenis} Anda dengan nomor tiket ${code} telah diperbarui menjadi: ${payload.status}.`,
        "",
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).",
      ].join("\n");
  }
}
