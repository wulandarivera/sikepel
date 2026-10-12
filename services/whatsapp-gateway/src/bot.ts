import type { WASocket, proto } from "@whiskeysockets/baileys";
import { logger } from "./logger.js";
import {
  formatBotMenu,
  formatTicketStatusReply,
  formatTicketNotFoundReply,
} from "./formatters.js";
import { getAutoReplyStore } from "./auto-replies.js";

const greeted = new Set<string>();
const seen = new Set<string>();

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
  senderInfo?: { name?: string; phone?: string },
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const ticket = trimmed.match(TICKET_REGEX)?.[1]?.toUpperCase();
  if (ticket) return `Lacak permohonan melalui https://mandiri.sikepel.biz.id/lacak?tiket=${encodeURIComponent(ticket)}. Gunakan tanggal lahir pemohon. Detail pribadi hanya tersedia di portal.`;
  const store = getAutoReplyStore();
  await store.init();
  const greetingSetting = store.getAll().find(item => item.keyword === "__greeting__");
  const isGreeting = /^(halo|hai|hi|hello|ass?alamualaikum|selamat (pagi|siang|sore|malam))[!. ]*$/i.test(trimmed);
  if (isGreeting) return greetingSetting ? (greetingSetting.is_active ? greetingSetting.reply_text : null) : formatBotMenu();
  const lower = trimmed.toLowerCase();
  if (/status|lacak|tiket/.test(lower)) return "Lacak permohonan: https://mandiri.sikepel.biz.id/lacak. Siapkan nomor tiket dan tanggal lahir pemohon.";
  if (/ajukan|bikin surat|buat surat|daftar surat|link|tautan/.test(lower)) return "Ajukan surat: https://mandiri.sikepel.biz.id. Pilih jenis surat, ikuti persyaratan pada portal, lalu simpan tiket. Surat fisik diambil di loket setelah dinyatakan siap; tidak ada PDF lewat WhatsApp.";
  if (/syarat|persyaratan/.test(lower)) return "Persyaratan mengikuti jenis surat pada portal: https://mandiri.sikepel.biz.id. Pilih layanan untuk melihat daftar dokumen terbaru.";
  if (/jam|lokasi|alamat|bantuan|petugas/.test(lower)) return "Untuk jam layanan, lokasi, atau bantuan petugas, hubungi loket pelayanan Kelurahan Cibodas. Pengajuan dan pelacakan: https://mandiri.sikepel.biz.id.";
  const custom = store.findMatchingReply(trimmed, senderInfo);
  if (custom) return custom;
  if (/^(halo|hai|hi|hello|ass?alamualaikum|menu|selamat (pagi|siang|sore|malam)|info layanan)[!. ]*$/i.test(trimmed)) return formatBotMenu();
  return "Pesan belum dikenali. Ketik ajukan, status, persyaratan, atau bantuan. Portal: https://mandiri.sikepel.biz.id.";

}

export async function handleIncomingMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  onSentMessage?: (id: string, message: proto.IMessage) => void,
): Promise<void> {
  try {
    if (!msg.key || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid || !jid.endsWith("@s.whatsapp.net")) return;
    const receipt = `${jid}:${msg.key.id || ""}`;
    if (!msg.key.id || seen.has(receipt)) return;
    seen.add(receipt);
    if (seen.size > 10000) seen.delete(seen.values().next().value!);

    // Abaikan status update atau pesan siaran publik
    if (jid.endsWith("@broadcast") || jid.includes("status@broadcast")) {
      return;
    }

    const text = extractMessageText(msg);
    if (!text) return;

    const senderName = msg.pushName || "";
    const senderPhone = jid ? jid.replace(/@.*$/, "") : "";
    const greeting = /^(halo|hai|hi|hello|ass?alamualaikum|selamat (pagi|siang|sore|malam))[!. ]*$/i.test(text.trim());
    if (greeting && greeted.has(jid)) return;
    const reply = await processMessageText(text, { name: senderName, phone: senderPhone });
    if (!reply) return;

    if (greeting) greeted.add(jid);
    const sent = await sock.sendMessage(jid, { text: reply });
    if (sent?.key?.id && sent?.message && onSentMessage) {
      onSentMessage(sent.key.id, sent.message);
    }
    logger.info({ to: jid }, "Berhasil mengirim balasan otomatis hotline warga");
  } catch (err: any) {
    logger.error(
      { error: err.message, jid: msg.key?.remoteJid },
      "Gagal memproses pesan masuk hotline bot",
    );
  }
}
