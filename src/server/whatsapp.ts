import { safeWaNotice } from "../lib/wa-notice";
import { type DB, one } from "./db";

export interface PermohonanNotificationPayload {
  to: string;
  ticket: string;
  status:
    | "SUBMITTED"
    | "TIKET_BARU"
    | "TIKET BARU"
    | "PENDING_VERIFICATION"
    | "APPROVED"
    | "COMPLETED"
    | "SIAP_DIAMBIL"
    | "REJECTED"
    | "NEEDS_REVISION";
  type_name: string;
  resident_name?: string;
  note?: string;
}

export function formatWhatsAppMessage(payload: PermohonanNotificationPayload): string {
  return safeWaNotice(payload);
}

export async function dispatchWhatsAppNotification(
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
      body: JSON.stringify({
        to: payload.to,
        ticket: payload.ticket,
        status: payload.status,
        type_name: "Permohonan surat",
      }),
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

export const notifyPermohonanStatus = dispatchWhatsAppNotification;

export async function getTicketStatusForBot(db: DB, ticketCode: string, senderPhone = "", villageId = "") {
  const normalized = ticketCode.trim().toUpperCase();
  const digits = senderPhone.replace(/^\+/, "");
  const phone = digits.startsWith("08") ? `62${digits.slice(1)}` : digits;
  if (!/^TIK-\d{6}-[A-Z0-9]{4,16}$/.test(normalized) || !/^628\d{7,12}$/.test(phone) || !/^[a-f0-9-]{36}$/i.test(villageId)) return null;
  const row = await one(db, `
    SELECT ticket_code, status FROM online_requests
    WHERE UPPER(ticket_code) = $1 AND village_id = $3::uuid
      AND CASE WHEN contact_phone LIKE '08%'
        THEN '62' || SUBSTRING(contact_phone FROM 2)
        ELSE REGEXP_REPLACE(contact_phone, '^\\+', '') END = $2
    LIMIT 1`, [normalized, phone, villageId]);
  return row ? { ticket_code: row.ticket_code, status: row.status } : null;
}
