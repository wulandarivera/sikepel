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
  return safeWaNotice({ticket:data.ticket_code,status:data.status});
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
