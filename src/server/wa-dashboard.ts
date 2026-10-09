import { z } from "zod";
import type { User } from "../lib/types";
import { AppError, audit, sessionUser, sameOrigin } from "./security";
import { getDB } from "./db";

type Config = { village: string; url: string; secret: string };
type Dependencies = {
  session: (token?: string) => Promise<User | null>;
  config: () => Config;
  audit: (user: User, action: string) => Promise<void>;
  fetch: typeof fetch;
};
const sendSchema = z.object({
  to: z.string().regex(/^(?:\+?62|0|8)[0-9]{8,13}$/),
  text: z.string().trim().min(1).max(2000).refine((s) => !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/u.test(s)),
}).strict();
const statusSchema = z.object({
  connected: z.boolean(), hasQr: z.boolean(),
  qrDataUrl: z.string().max(200000).regex(/^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/).nullable(),
  profile: z.object({ phone: z.string().max(30).nullable(), name: z.string().max(100).nullable(), startedAt: z.string().datetime().nullable() }),
  logs: z.array(z.object({ id: z.string().max(100), at: z.string().datetime(), direction: z.enum(["in", "out"]), recipient: z.string().max(40), summary: z.string().max(100), status: z.string().max(40) })).max(100),
});
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function createWaDashboard(deps: Dependencies) {
  const limits = new Map<string, { count: number; expires: number }>();
  return async (req: Request, action: string): Promise<Response> => {
    try {
      const cookie = req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith("sikepel_session="));
      const user = await deps.session(cookie?.slice("sikepel_session=".length));
      if (!user) throw new AppError(401, "Sesi tidak valid.");
      if (!["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role)) throw new AppError(403, "Akses ditolak.");
      const cfg = deps.config();
      if (!cfg.village || !cfg.secret || !cfg.url) throw new AppError(503, "Gateway belum dikonfigurasi.");
      if (!user.village_id || user.village_id !== cfg.village) throw new AppError(403, "Gateway di luar lingkup kelurahan.");
      const mutating = action === "send" || action === "logout";
      if (!(action === "status" && req.method === "GET") && !(mutating && req.method === "POST")) throw new AppError(405, "Metode tidak diizinkan.");
      let body: unknown;
      if (mutating) {
        sameOrigin(req);
        // Reject cross-origin even when globally allowlisted for other APIs.
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
        const proto = req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.slice(0, -1);
        if (origin !== new URL(req.url).origin && origin !== `${proto}://${host}`) throw new AppError(403, "Permintaan tidak diizinkan.");
        if (!req.headers.get("content-type")?.startsWith("application/json")) throw new AppError(400, "JSON wajib.");
        const reader = req.body?.getReader();
        if (!reader) throw new AppError(400, "Body wajib.");
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > 8192) { await reader.cancel(); throw new AppError(413, "Ukuran permintaan terlalu besar."); }
          chunks.push(part.value);
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AppError(400, "JSON tidak valid."); }
        const parsed = (action === "send" ? sendSchema : z.object({ confirm: z.literal(true) }).strict()).safeParse(body);
        if (!parsed.success) throw new AppError(400, "Parameter tidak valid.");
        body = parsed.data;
      }
      const now = Date.now();
      for (const [key, value] of limits) if (value.expires <= now) limits.delete(key);
      const key = `${user.id}:${mutating ? "write" : "read"}`;
      const limit = limits.get(key) || { count: 0, expires: now + 60000 };
      if (limit.count >= (mutating ? 10 : 120) || (!limits.has(key) && limits.size >= 10000)) throw new AppError(429, "Terlalu banyak permintaan.");
      limit.count++; limits.set(key, limit);
      await deps.audit(user, mutating ? `WA_${action.toUpperCase()}_REQUESTED` : "WA_STATUS_READ");
      let response: Response;
      try {
        response = await deps.fetch(new URL(`/${action}`, cfg.url), {
          method: req.method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${cfg.secret}`, "X-WA-Village-ID": cfg.village, "Content-Type": "application/json" },
          body: mutating ? JSON.stringify(body) : undefined,
        });
      } catch {
        if (mutating) await deps.audit(user, `WA_${action.toUpperCase()}_FAILED`);
        throw new AppError(503, "Gateway tidak tersedia.");
      }
      if (!response.ok) {
        if (mutating) await deps.audit(user, `WA_${action.toUpperCase()}_FAILED`);
        throw new AppError(503, "Gateway tidak tersedia.");
      }
      if (mutating) {
        await deps.audit(user, `WA_${action.toUpperCase()}_COMPLETED`);
        return json({ ok: true });
      }
      const parsed = statusSchema.safeParse(await response.json());
      if (!parsed.success) throw new AppError(503, "Status gateway tidak valid.");
      return json(parsed.data);
    } catch (err) {
      return json({ error: err instanceof AppError ? err.message : "Gateway tidak tersedia." }, err instanceof AppError ? err.status : 503);
    }
  };
}
export const waDashboard = createWaDashboard({
  session: sessionUser,
  config: () => ({ village: process.env.WA_GATEWAY_VILLAGE_ID || "", url: process.env.WA_GATEWAY_URL || "http://127.0.0.1:3001", secret: process.env.WA_GATEWAY_SECRET || "" }),
  audit: async (user, action) => audit(await getDB(), user, action, "whatsapp_gateway", user.village_id),
  fetch: (...args) => fetch(...args),
});
