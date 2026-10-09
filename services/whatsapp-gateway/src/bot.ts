import type { WASocket, proto } from "@whiskeysockets/baileys";
import { logger } from "./logger.js";
import { findTicketByCode } from "./db.js";
import {
  formatBotMenu,
  formatTicketStatusReply,
  formatTicketNotFoundReply,
} from "./formatters.js";

const TICKET_REGEX = /\b(TIK-\d{6}-[A-Za-z0-9]{4,16})\b/i;

export function extractMessageText(msg: proto.IWebMessageInfo): string {
  if (!msg.message) return "";

  const content = msg.message;
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  if (content.imageMessage?.caption) return content.imageMessage.caption;
  if (content.videoMessage?.caption) return content.videoMessage.caption;
  if (content.documentMessage?.caption) return content.documentMessage.caption;

  return "";
}

export async function processMessageText(
  text: string,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Deteksi apakah input berisi nomor tiket
  const ticketMatch = trimmed.match(TICKET_REGEX);
  if (ticketMatch && ticketMatch[1]) {
    const ticketCode = ticketMatch[1].toUpperCase();
    logger.info({ ticket: ticketCode }, "Memproses pengecekan status tiket dari pesan warga");

    const record = await findTicketByCode(ticketCode);
    if (record) {
      return formatTicketStatusReply(record);
    }
    return formatTicketNotFoundReply(ticketCode);
  }

  const lower = trimmed.toLowerCase();

  // 2. Opsi pengajuan surat langsung
  if (
    lower.includes("ajukan") ||
    lower.includes("bikin surat") ||
    lower.includes("buat surat") ||
    lower.includes("daftar surat") ||
    lower.includes("link") ||
    lower.includes("tautan")
  ) {
    return [
      "PENGAJUAN SURAT MANDIRI WARGA KELURAHAN CIBODAS",
      "",
      "Silakan akses portal resmi pengajuan surat online warga melalui tautan berikut:",
      "https://mandiri.sikepel.biz.id/ajukan",
      "",
      "Petunjuk Pengajuan:",
      "1. Siapkan NIK dan data pemohon sesuai KTP.",
      "2. Unggah foto atau scan dokumen persyaratan yang diminta.",
      "3. Simpan nomor tiket yang diterbitkan setelah pengajuan.",
      "",
      "Pemberitahuan Wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).",
    ].join("\n");
  }

  // 3. Menu utama / Sapaan
  return formatBotMenu();
}

export async function handleIncomingMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
): Promise<void> {
  try {
    if (!msg.key || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid) return;

    // Abaikan status update atau pesan siaran publik
    if (jid.endsWith("@broadcast") || jid.includes("status@broadcast")) {
      return;
    }

    const text = extractMessageText(msg);
    if (!text) return;

    const reply = await processMessageText(text);
    if (!reply) return;

    await sock.sendMessage(jid, { text: reply });
    logger.info({ to: jid }, "Berhasil mengirim balasan otomatis hotline warga");
  } catch (err: any) {
    logger.error(
      { error: err.message, jid: msg.key?.remoteJid },
      "Gagal memproses pesan masuk hotline bot",
    );
  }
}
