import { randomUUID } from "node:crypto";
import { reserveDraftTicket, DRAFT_LIFETIME_MS, migrateDraftTickets } from "./draft-tickets";
import { getRequirements } from "./requirements";
import { requirementsComplete } from "@/lib/requirements";
import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { getDB, one, type DB } from "./db";
import {
  authorizeRow,
  requireRoles,
  requireVillage,
  AppError,
  audit,
} from "./security";
import { validateFields, validateN1, validatePindah } from "./validation";
import { storage } from "./storage";
import {
  converter,
  mergeDOCX,
  snapshotValues,
  companionValues,
  type PdfConverter,
} from "./documents";
import { dayID, type User, type Row } from "@/lib/types";
export const flatten = (r: Row) => ({ ...r, ...r.data, data: undefined });
export async function letterById(db: DB, user: User, id: string, lock = false) {
  const row = authorizeRow(user, await one(db,
    `SELECT * FROM letters WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`, [id]));
  if (["DRAFT", "PREVIEW"].includes(row.status) && row.draft_expires_at && new Date(row.draft_expires_at).getTime() <= Date.now())
    throw new AppError(410, "Draft kedaluwarsa. Buat draft baru.");
  return row;
}
async function makeSnapshot(db: DB, user: User, l: Row) {
  const resident = authorizeRow(
    user,
    await one(db, "SELECT * FROM residents WHERE id=$1", [l.resident_id]),
  );
  const village = await one(
    db,
    "SELECT * FROM villages WHERE id=$1 AND active",
    [l.village_id],
  );
  const official = authorizeRow(
    user,
    await one(db, "SELECT * FROM officials WHERE id=$1", [l.official_id]),
  );
  const type = await one(
    db,
    "SELECT * FROM letter_types WHERE id=$1 AND active",
    [l.type_id],
  );
  const template = await one(
    db,
    "SELECT * FROM templates WHERE type_id=$1 AND active",
    [l.type_id],
  );
  const date = dayID();
  if (!village || !type || !template || template.errors.length)
    throw new AppError(
      400,
      "Kelurahan, jenis surat, atau template belum siap. Hubungi admin.",
    );
  if (
    !official.active ||
    official.data.start_date > date ||
    (official.data.end_date && official.data.end_date < date)
  )
    throw new AppError(
      400,
      "Penandatangan tidak aktif pada tanggal penerbitan.",
    );
  validateFields(type.fields, l.form_data, { allowEmptyRequired: true });
  if (type.slug === "pindah" && type.fields.some((field: { key: string }) => field.key === "no_klasifikasi_pindah"))
    validatePindah(l.form_data);
  if (type.slug === "nikah" && type.fields.some((field: { key: string }) => field.key === "status_n1"))
    validateN1(l.form_data, resident.data.gender);
  const requirements = await getRequirements(db, l.village_id, l.type_id);
  return {
    draft_ticket: l.draft_ticket,
    draft_type_name: l.draft_type_name,
    draft_expires_at: l.draft_expires_at,
    resident: flatten(resident),
    village: flatten(village),
    official: flatten(official),
    type,
    template,
    form_data: l.form_data,
    ...(requirements.length ? { requirements } : {}),
    date: new Date().toISOString(),
  };
}
export async function saveDraft(user: User, input: any, id?: string) {
  requireRoles(user, "OPERATOR", "ADMIN", "SUPER_ADMIN");
  const village = requireVillage(user);
  const db = await getDB();
  const schema = await db.query("SELECT to_regclass('draft_ticket_registry') AS name");
  if (!schema.rows[0]?.name) await migrateDraftTickets(db);
  if (!input.resident_id || !input.type_id)
    throw new AppError(400, "Pilih jenis surat dan penduduk terlebih dahulu.");
  const form = input.form_data || {};
  if (
    typeof form !== "object" ||
    Array.isArray(form) ||
    JSON.stringify(form).length > 40000
  )
    throw new AppError(400, "Data surat terlalu besar.");
  if (form.requirement_checks !== undefined && (!form.requirement_checks || typeof form.requirement_checks !== "object" || Array.isArray(form.requirement_checks) || Object.values(form.requirement_checks).some(value => typeof value !== "boolean")))
    throw new AppError(400, "Checklist persyaratan harus berisi nilai benar atau salah.");
  if (form.reporter_phone !== undefined && (typeof form.reporter_phone !== "string" || form.reporter_phone.length > 40))
    throw new AppError(400, "Nomor pelapor maksimal 40 karakter.");
  return db.transaction(async (tx) => {
    authorizeRow(
      user,
      await one(tx, "SELECT * FROM residents WHERE id=$1", [input.resident_id]),
    );
    if (input.official_id)
      authorizeRow(
        user,
        await one(tx, "SELECT * FROM officials WHERE id=$1", [
          input.official_id,
        ]),
      );
    if (
      !(await one(tx, "SELECT id FROM letter_types WHERE id=$1 AND active", [
        input.type_id,
      ]))
    )
      throw new AppError(400, "Jenis surat tidak aktif.");
    const letterId = id || randomUUID();
    if (id) {
      const old = await letterById(tx, user, id, true);
      if (old.type_id !== input.type_id)
        throw new AppError(409, "Tiket terikat jenis surat. Buat draft baru untuk jenis surat berbeda.");
      if (!["DRAFT", "PREVIEW"].includes(old.status))
        throw new AppError(
          409,
          "Surat yang telah mendapatkan nomor tidak dapat diedit.",
        );
      await tx.query(
        "UPDATE letters SET resident_id=$2,type_id=$3,official_id=$4,form_data=$5,status='DRAFT',preview_path=NULL,updated_at=now() WHERE id=$1",
        [
          id,
          input.resident_id,
          input.type_id,
          input.official_id || null,
          JSON.stringify(form),
        ],
      );
    } else {
      const type = await one(tx,"SELECT id,slug,name FROM letter_types WHERE id=$1",[input.type_id]);
      const created = new Date();
      const expires = new Date(created.getTime()+DRAFT_LIFETIME_MS);
      const ticket = await reserveDraftTicket(tx,letterId,type,expires);
      await tx.query(
        "INSERT INTO letters(id,village_id,resident_id,type_id,official_id,form_data,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          letterId,
          village,
          input.resident_id,
          input.type_id,
          input.official_id || null,
          JSON.stringify(form),
          user.id,
        ],
      );
      await tx.query("UPDATE letters SET draft_ticket=$2,draft_type_name=$3,draft_expires_at=$4,created_at=$5 WHERE id=$1",[letterId,ticket,type.name,expires,created]);
    }
    await audit(
      tx,
      user,
      id ? "DRAFT_UPDATE" : "DRAFT_CREATE",
      "letters",
      letterId,
    );
    return one(tx, "SELECT * FROM letters WHERE id=$1", [letterId]);
  });
}
export async function previewLetter(user: User, id: string) {
  requireRoles(user, "OPERATOR", "ADMIN", "SUPER_ADMIN");
  const db = await getDB();
  const l = await letterById(db, user, id);
  if (!["DRAFT", "PREVIEW"].includes(l.status))
    throw new AppError(409, "Surat sudah diterbitkan atau sedang diproses.");
  const snapshot = await makeSnapshot(db, user, l);
  const template = await storage.get(snapshot.template.storage_path);
  let pdf: Buffer;
  try {
    pdf = await converter.convert(
      mergeDOCX(template, snapshotValues(snapshot, "— / BELUM TERBIT")),
    );
  } catch {
    throw new AppError(
      503,
      "Pratinjau PDF belum berhasil dibuat. Periksa layanan konversi lalu coba lagi.",
    );
  }
  const key = `previews/${l.village_id}/${id}/${randomUUID()}.pdf`;
  await storage.put(key, pdf);
  const r = await db.query(
    "UPDATE letters SET preview_path=$2,status='PREVIEW',snapshot=$4,updated_at=now() WHERE id=$1 AND updated_at=$3 AND status IN ('DRAFT','PREVIEW') AND draft_expires_at > now() RETURNING *",
    [id, key, l.updated_at, JSON.stringify(snapshot)],
  );
  if (!r.rows.length)
    throw new AppError(
      409,
      "Data surat berubah selama pratinjau. Buat pratinjau kembali.",
    );
  await audit(db, user, "LETTER_PREVIEW", "letters", id);
  return { ...r.rows[0], snapshot };
}
export async function allocateLetter(user: User, id: string) {
  requireRoles(user, "OPERATOR", "ADMIN", "SUPER_ADMIN");
  const db = await getDB();
  return db.transaction(async (tx) => {
    const l = await letterById(tx, user, id, true);
    if (["ISSUE_PENDING", "ISSUED"].includes(l.status)) return l;
    if (l.status !== "PREVIEW")
      throw new AppError(
        409,
        "Buat dan periksa pratinjau sebelum menerbitkan.",
      );
    await tx.query("SELECT id FROM letter_types WHERE id=$1 FOR UPDATE", [l.type_id]);
    const s = await makeSnapshot(tx, user, l);
    if (!requirementsComplete(s.requirements, l.form_data.requirement_checks))
      throw new AppError(400, "Persyaratan wajib belum lengkap. Lengkapi checklist Catatan Untuk Petugas.");
    const normalized = (snapshot: any) =>
      snapshot
        ? JSON.parse(
            JSON.stringify({
              ...snapshot,
              date: dayID(new Date(snapshot.date)),
            }),
          )
        : null;
    if (!isDeepStrictEqual(normalized(s), normalized(l.snapshot)))
      throw new AppError(
        409,
        "Data penduduk, pejabat, atau template berubah sejak pratinjau. Buat pratinjau kembali sebelum menerbitkan.",
      );
    const now = dayID(),
      year = Number(now.slice(0, 4)),
      month = Number(now.slice(5, 7));
    if (new Date(l.draft_expires_at).getTime() <= Date.now())
      throw new AppError(410, "Draft kedaluwarsa. Buat draft baru.");
    const counter = await one(
      tx,
      "INSERT INTO counters(village_id,type_id,year,last_sequence) VALUES($1,$2,$3,1) ON CONFLICT(village_id,type_id,year) DO UPDATE SET last_sequence=counters.last_sequence+1 RETURNING last_sequence",
      [l.village_id, l.type_id, year],
    );
    const sequence = counter.last_sequence,
      roman = [
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
      ][month - 1];
    const number = `B/${String(sequence).padStart(3, "0")}/${s.type.code}/${roman}/${year}`;
    const result = await one(
      tx,
      "UPDATE letters SET number=$2,sequence=$3,issue_year=$4,snapshot=$5,template_id=$6,status='ISSUE_PENDING',issued_by=$7,updated_at=now(),error=NULL WHERE id=$1 RETURNING *",
      [id, number, sequence, year, JSON.stringify(s), s.template.id, user.id],
    );
    await audit(tx, user, "LETTER_NUMBER_ALLOCATED", "letters", id, { number });
    return result;
  });
}
export async function generateLetter(
  user: User,
  id: string,
  pdfConverter: PdfConverter = converter,
) {
  requireRoles(user, "OPERATOR", "ADMIN", "SUPER_ADMIN");
  const db = await getDB();
  const l = await letterById(db, user, id);
  if (l.status === "ISSUED") return l;
  if (l.status !== "ISSUE_PENDING")
    throw new AppError(409, "Surat tidak sedang menunggu penerbitan.");
  const token = randomUUID();
  const locked = await one(
    db,
    "UPDATE letters SET generation_token=$2,generation_started=now(),error=NULL WHERE id=$1 AND status='ISSUE_PENDING' AND (generation_token IS NULL OR generation_started < now()-interval '3 minutes') RETURNING *",
    [id, token],
  );
  if (!locked) return { ...l, busy: true };
  try {
    const template = await storage.get(l.snapshot.template.storage_path);
    const pdf = await pdfConverter.convert(
      mergeDOCX(template, snapshotValues(l.snapshot, l.number)),
    );
    const key = `generated/${l.village_id}/${l.issue_year}/${id}/${token}.pdf`;
    await storage.put(key, pdf);
    let companionKey: string | null = null;
    if (l.snapshot?.type?.slug === "nikah") {
      const companionTemplate = await fs.readFile(
        path.resolve("templates/pernyataan-belum-menikah.docx"),
      );
      const companionPdf = await pdfConverter.convert(
        mergeDOCX(companionTemplate, companionValues(l.snapshot, l.number)),
      );
      companionKey = `generated/${l.village_id}/${l.issue_year}/${id}/${token}-pernyataan-belum-menikah.pdf`;
      await storage.put(companionKey, companionPdf);
    }
    return await db.transaction(async (tx) => {
      const result = await one(
        tx,
        "UPDATE letters SET status='ISSUED',pdf_path=$3,companion_pdf_path=$4,issued_at=now(),updated_at=now(),generation_token=NULL,error=NULL WHERE id=$1 AND generation_token=$2 AND status='ISSUE_PENDING' RETURNING *",
        [id, token, key, companionKey],
      );
      if (!result) throw new AppError(409, "Status surat sudah berubah.");
      await audit(tx, user, "LETTER_ISSUED", "letters", id, {
        number: l.number,
      });
      return result;
    });
  } catch (e) {
    if (e instanceof AppError && e.status === 409) throw e;
    const message =
      "PDF belum berhasil dibuat. Nomor surat tetap tersimpan. Coba Lagi.";
    await db.query(
      "UPDATE letters SET error=$3,generation_token=NULL,updated_at=now() WHERE id=$1 AND generation_token=$2",
      [id, token, message],
    );
    await audit(db, user, "LETTER_GENERATION_FAILED", "letters", id, {
      reference: id,
    });
    return { ...l, error: message, generation_token: null };
  }
}
export async function cancelLetter(user: User, id: string, reason: string) {
  requireRoles(user, "ADMIN", "SUPER_ADMIN");
  if (!reason?.trim() || reason.length > 1000)
    throw new AppError(
      400,
      "Alasan pembatalan wajib diisi (maksimal 1.000 karakter).",
    );
  const db = await getDB();
  return db.transaction(async (tx) => {
    const l = await letterById(tx, user, id, true);
    if (!["ISSUED", "ISSUE_PENDING"].includes(l.status))
      throw new AppError(409, "Surat ini tidak dapat dibatalkan.");
    await tx.query(
      "UPDATE letters SET status='CANCELLED',cancel_reason=$2,updated_at=now(),generation_token=NULL WHERE id=$1",
      [id, reason.trim()],
    );
    await audit(tx, user, "LETTER_CANCELLED", "letters", id, {
      reason: reason.trim(),
      number: l.number,
    });
    return one(tx, "SELECT * FROM letters WHERE id=$1", [id]);
  });
}
