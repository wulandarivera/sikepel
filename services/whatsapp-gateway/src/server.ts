import http from "node:http";
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
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error("Ukuran request terlalu besar"));
      }
    });
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

    // Cek otorisasi untuk endpoint pengiriman
    if (config.secret) {
      const authHeader = req.headers["authorization"] || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token !== config.secret) {
        return sendJsonResponse(res, 401, {
          ok: false,
          error: "Otorisasi tidak valid",
        });
      }
    }

    // 3. POST /send - Kirim pesan teks mentah
    if (url.pathname === "/send" && method === "POST") {
      try {
        const body = await parseJsonBody(req);
        const { to, text } = body;

        if (!to || !text) {
          return sendJsonResponse(res, 400, {
            ok: false,
            error: "Parameter 'to' dan 'text' wajib disertakan",
          });
        }

        const sock = sessionManager.getSocket();
        const status = sessionManager.getStatus();
        if (!sock || !status.connected) {
          logger.warn({ to }, "Gagal mengirim: WhatsApp belum terhubung");
          return sendJsonResponse(res, 503, {
            ok: false,
            error: "WhatsApp gateway belum terhubung ke sesi aktif",
          });
        }

        const jid = normalizePhoneToJid(to);
        await sock.sendMessage(jid, { text });

        logger.info({ to: jid }, "Pesan WhatsApp berhasil dikirim");
        return sendJsonResponse(res, 200, { ok: true, recipient: jid });
      } catch (err: any) {
        logger.error({ error: err.message }, "Kesalahan pada POST /send");
        return sendJsonResponse(res, 500, { ok: false, error: err.message });
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
          logger.warn(
            { to, ticket, status },
            "Gateway belum terhubung saat mencoba mendispatch notifikasi",
          );
          return sendJsonResponse(res, 503, {
            ok: false,
            error: "WhatsApp gateway belum terhubung",
            queued: false,
          });
        }

        const jid = normalizePhoneToJid(to);
        await sock.sendMessage(jid, { text: messageText });

        logger.info(
          { to: jid, ticket, status },
          "Notifikasi status permohonan berhasil dikirim ke pemohon",
        );
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
