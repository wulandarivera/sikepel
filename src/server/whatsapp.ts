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
