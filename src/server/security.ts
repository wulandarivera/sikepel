import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { getDB, one, type DB } from "./db";
import type { User, Role, Row } from "@/lib/types";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const check = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return expected.length === check.length && timingSafeEqual(expected, check);
}
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function sessionUser(token?: string): Promise<User | null> {
  if (!token) return null;
  const db = await getDB();
  const user = await one<User>(
    db,
    `SELECT u.id,u.name,u.username,u.role,u.village_id,s.scope_id FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN villages v ON v.id=u.village_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND (u.role='SUPER_ADMIN' OR v.active)`,
    [hashToken(token)],
  );
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") user.village_id = user.scope_id;
  return user;
}
export function requireRoles(user: User, ...roles: Role[]) {
  if (!roles.includes(user.role))
    throw new AppError(403, "Anda tidak memiliki akses ke tindakan ini.");
}
export function requireVillage(user: User) {
  if (!user.village_id)
    throw new AppError(400, "Pilih lingkup kelurahan terlebih dahulu.");
  return user.village_id;
}
export function authorizeRow(user: User, row?: Row) {
  if (!row) throw new AppError(404, "Data tidak ditemukan.");
  if (row.village_id && row.village_id !== user.village_id)
    throw new AppError(403, "Anda tidak memiliki akses ke data ini.");
  return row;
}
export async function audit(
  db: DB,
  user: User,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: object = {},
) {
  await db.query(
    "INSERT INTO audit_logs(id,village_id,user_id,actor,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      randomUUID(),
      user.village_id,
      user.id,
      user.name,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
    ],
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") {
    throw new AppError(403, "Permintaan tidak diizinkan. Muat ulang halaman.");
  }
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      if (["127.0.0.1", "[::1]"].includes(url.hostname))
        url.hostname = "localhost";
      return url.origin;
    } catch {
      return value;
    }
  };

  const normalizedOrigin = normalize(origin);
  if (normalizedOrigin === normalize(request.url)) {
    return;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto") || "http";
    const forwardedOrigin = normalize(`${forwardedProto}://${forwardedHost}`);
    if (normalizedOrigin === forwardedOrigin) {
      return;
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === forwardedHost) {
        return;
      }
    } catch {}
  }

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => normalize(s.trim()))
    : [];
  if (allowedOrigins.includes(normalizedOrigin)) {
    return;
  }

  throw new AppError(403, "Permintaan tidak diizinkan. Muat ulang halaman.");
}
