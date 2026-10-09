import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import {
  formatNotificationMessage,
  type StatusNotificationPayload,
} from "./formatters.js";
import type { WhatsAppSessionManager } from "./session.js";

export function normalizePhoneToJid(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    req.on("data", (chunk) => {
      if (oversized) return;
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 64) {
        oversized = true; body = "";
        reject(new Error("Ukuran request terlalu besar"));
      }
    });
    req.on("aborted", () => reject(new Error("Request dibatalkan")));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Format JSON tidak valid"));
      }
    });
    req.on("error", reject);
  });
}

function sendJsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  data: any,
) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

export function createHttpServer(
  sessionManager: WhatsAppSessionManager,
): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const method = req.method || "GET";

    // Every endpoint fails closed, including QR and status.
    const auth = req.headers.authorization || "";
    const expected = Buffer.from(`Bearer ${config.secret}`);
    const supplied = Buffer.from(auth);
    if (!config.secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return sendJsonResponse(res, 401, { ok: false, error: "Otorisasi tidak valid" });
    }
    if ((["/status", "/logout"].includes(url.pathname) || req.headers["x-wa-village-id"] !== undefined) &&
        (!process.env.WA_GATEWAY_VILLAGE_ID || req.headers["x-wa-village-id"] !== process.env.WA_GATEWAY_VILLAGE_ID)) {
      return sendJsonResponse(res, 403, { ok: false, error: "Lingkup tidak valid" });
    }
    if (url.pathname === "/status" && method === "GET") {
      return sendJsonResponse(res, 200, sessionManager.getDashboardStatus());
    }
    if (url.pathname === "/logout" && method === "POST") {
      try {
        const body = await parseJsonBody(req);
        if (body?.confirm !== true || Object.keys(body).length !== 1) return sendJsonResponse(res, 400, { ok: false });
        await sessionManager.logout();
        return sendJsonResponse(res, 200, { ok: true });
      } catch { return sendJsonResponse(res, 503, { ok: false, error: "Penggantian sesi gagal" }); }
    }

    // 1. Health check
    if (url.pathname === "/health" && method === "GET") {
      const status = sessionManager.getStatus();
      return sendJsonResponse(res, 200, {
        ok: true,
        service: "sikepel-whatsapp-gateway",
        ...status,
      });
    }

    // 2. QR code status
    if (url.pathname === "/qr" && method === "GET") {
      const qr = sessionManager.getQR();
      const status = sessionManager.getStatus();
      return sendJsonResponse(res, 200, {
        ok: true,
        hasQr: !!qr,
        qr: qr || null,
        connected: status.connected,
      });
    }


    // 3. POST /send - Kirim pesan teks mentah
    if (url.pathname === "/send" && method === "POST") {
      try {
        const body = await parseJsonBody(req);
        const { to, text } = body;

        if (typeof to !== "string" || !/^(?:\+?62|0|8)[0-9]{8,13}$/.test(to) || typeof text !== "string" || !text.trim() || text.length > 2000 || /[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/u.test(text)) {
          return sendJsonResponse(res, 400, {
            ok: false,
            error: "Parameter 'to' dan 'text' wajib disertakan",
          });
        }

        const sock = sessionManager.getSocket();
        const status = sessionManager.getStatus();
        if (!sock || !status.connected) {
          logger.warn("Gagal mengirim: WhatsApp belum terhubung");
          return sendJsonResponse(res, 503, {
            ok: false,
            error: "WhatsApp gateway belum terhubung ke sesi aktif",
          });
        }

        const jid = normalizePhoneToJid(to);
        await sock.sendMessage(jid, { text });
        sessionManager.logs?.add("out", "sent");

        logger.info("Pesan WhatsApp berhasil dikirim");
        return sendJsonResponse(res, 200, { ok: true, recipient: jid });
      } catch (err: any) {
        sessionManager.logs?.add("out", "failed");
        logger.error("Kesalahan pada POST /send");
        return sendJsonResponse(res, 500, { ok: false, error: "Pengiriman gagal" });
      }
    }

    // 4. POST /notify - Kirim notifikasi perubahan status permohonan mandiri
    if (url.pathname === "/notify" && method === "POST") {
      try {
        const body = (await parseJsonBody(req)) as StatusNotificationPayload;
        const { to, ticket, status, type_name } = body;

        if (!to || !ticket || !status || !type_name) {
          return sendJsonResponse(res, 400, {
            ok: false,
            error:
              "Parameter 'to', 'ticket', 'status', dan 'type_name' wajib disertakan",
          });
        }

        const messageText = formatNotificationMessage(body);
        const sock = sessionManager.getSocket();
        const sockStatus = sessionManager.getStatus();

        if (!sock || !sockStatus.connected) {
          logger.warn("Gateway belum terhubung saat mencoba mendispatch notifikasi");
          sessionManager.logs?.add("out", "failed");
          return sendJsonResponse(res, 503, {
            ok: false,
            error: "WhatsApp gateway belum terhubung",
            queued: false,
          });
        }

        const jid = normalizePhoneToJid(to);
        await sock.sendMessage(jid, { text: messageText });

        sessionManager.logs?.add("out", "sent");
        logger.info("Notifikasi status permohonan berhasil dikirim ke pemohon");
        return sendJsonResponse(res, 200, {
          ok: true,
          recipient: jid,
          ticket,
          status,
        });
      } catch (err: any) {
        logger.error({ error: err.message }, "Kesalahan pada POST /notify");
        return sendJsonResponse(res, 500, { ok: false, error: err.message });
      }
    }

    return sendJsonResponse(res, 404, {
      ok: false,
      error: "Endpoint tidak ditemukan",
    });
  });

  return server;
}
