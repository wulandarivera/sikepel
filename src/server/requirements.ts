import { one, type DB } from "./db";
import { AppError } from "./security";
import type { Requirement } from "@/lib/requirements";
export async function getRequirements(db: DB, village: string, type: string): Promise<Requirement[]> {
  const row = await one(db, "SELECT data FROM settings WHERE id=$1", [`requirements:${village}:${type}`]);
  return row?.data?.requirements || [];
}
export function validateRequirements(value: unknown): Requirement[] {
  if (!Array.isArray(value) || value.length > 50) throw new AppError(400, "Maksimal 50 persyaratan.");
  const ids = new Set<string>();
  return value.map((r) => {
    if (!r || typeof r.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(r.id) || ids.has(r.id) || typeof r.label !== "string" || !r.label.trim() || r.label.length > 200 || typeof r.mandatory !== "boolean") throw new AppError(400, "ID unik, label persyaratan dan status wajib harus valid.");
    ids.add(r.id);
    return { id: r.id, label: r.label.trim(), mandatory: r.mandatory };
  });
}
