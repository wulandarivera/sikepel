import { type DB, one } from "./db";

export interface PermohonanNotificationPayload {
  to: string;
  ticket: string;
  status: "APPROVED" | "COMPLETED" | "SIAP_DIAMBIL" | "REJECTED" | "NEEDS_REVISION";
  type_name: string;
  resident_name?: string;
  note?: string;
}

export function formatWhatsAppMessage(payload: PermohonanNotificationPayload): string {
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
        "2. Membawa berkas persyaratan asli untuk verifikasi akhir di loket.",
        "",
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).",
      ].join("\n");

    case "NEEDS_REVISION":
      return [
        "PEMBERITAHUAN SIKEPEL KELURAHAN CIBODAS",
        "",
        `${nama}Permohonan surat ${jenis} Anda dengan nomor tiket ${code} MEMERLUKAN PERBAIKAN BERKAS.`,
        "",
        "Catatan Petugas:",
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
        `${nama}Status permohonan surat ${jenis} Anda dengan nomor tiket ${code} telah diperbarui: ${payload.status}.`,
        "",
        "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).",
      ].join("\n");
  }
}

export async function notifyPermohonanStatus(
  payload: PermohonanNotificationPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!payload.to || !payload.ticket) {
    return { ok: false, error: "Nomor telepon atau nomor tiket tidak tersedia." };
  }

  const gatewayUrl =
    process.env.WA_GATEWAY_URL || "http://127.0.0.1:3001";
  const secret = process.env.WA_GATEWAY_SECRET || "";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers["Authorization"] = `Bearer ${secret}`;
    }

    const res = await fetch(`${gatewayUrl}/notify`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      const errBody: any = await res.json().catch(() => ({}));
      const errMsg = errBody.error || `HTTP ${res.status}`;
      console.warn(`[WA-DISPATCHER] Gateway merespons dengan kesalahan: ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    return { ok: true };
  } catch (err: any) {
    // Gateway offline atau timeout tidak boleh memblokir operasi backend
    console.warn(`[WA-DISPATCHER] Layanan WhatsApp Gateway lokal tidak dapat dihubungi: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function getTicketStatusForBot(db: DB, ticketCode: string) {
  const normalized = ticketCode.trim().toUpperCase();
  const row = await one(
    db,
    `
    SELECT
      r.ticket_code,
      r.status,
      r.revision_note,
      r.contact_phone,
      r.created_at,
      r.verified_at,
      t.name AS type_name,
      r.form_data->'resident'->>'name' AS resident_name
    FROM online_requests r
    JOIN letter_types t ON t.id = r.type_id
    WHERE UPPER(r.ticket_code) = $1
    LIMIT 1
  `,
    [normalized],
  );

  return row || null;
}
