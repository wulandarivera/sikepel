import { safeWaNotice } from "../lib/wa-notice";
import { type DB, one } from "./db";

export interface PermohonanNotificationPayload {
  request_id?: string;
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
): Promise<{ ok: boolean; error?: string; disabled?: boolean; receipt?: {requestId:string;stage:string;messageRef:string|null;deduped:boolean} }> {
  const requestId=payload.request_id;
  if (requestId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) return {ok:false,error:"Invalid request ID"};
  const trace=(stage:string)=>{if(requestId) console.info({requestId,stage,at:Date.now()});};
  trace("notifier_requested");
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
    if(requestId) headers["X-Request-ID"]=requestId;
    if (secret) {
      headers["Authorization"] = `Bearer ${secret}`;
    }

    const res = await fetch(`${gatewayUrl}/notify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(requestId ? {request_id:requestId} : {}),
        to: payload.to,
        ticket: payload.ticket,
        status: payload.status,
        type_name: "Permohonan surat",
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      trace("notifier_http_failed");
      console.warn("WA gateway HTTP failure; details suppressed");
      return {ok:false,error:`HTTP ${res.status}`};
    }

    if(requestId){
      const body:any=await res.json().catch(()=>null);
      if(body?.ok===true && body?.disabled===true){trace("notifier_disabled");return {ok:true,disabled:true};}
      const r=body?.receipt;
      const stages=["socket_resolved","deduped"];
      if(!r || r.requestId!==requestId || !stages.includes(r.stage) || typeof r.deduped!=="boolean" || (r.stage==="deduped")!==r.deduped || (r.messageRef!==null && (typeof r.messageRef!=="string" || !/^[a-f0-9]{64}$/.test(r.messageRef)))) {
        trace("notifier_receipt_invalid");return {ok:false,error:"Invalid gateway receipt"};
      }
      const receipt={requestId,stage:r.stage,messageRef:r.messageRef as string|null,deduped:r.deduped};
      console.info({...receipt,at:Date.now()});
      trace("notifier_http_accepted");return {ok:true,receipt};
    }
    trace("notifier_http_accepted");
    return { ok: true };
  } catch (err: any) {
    // Gateway offline atau timeout tidak boleh memblokir operasi backend
    trace("notifier_transport_failed");
    console.warn("WA gateway transport failure; details suppressed");
    return { ok: false, error: "Gateway transport failure" };
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
