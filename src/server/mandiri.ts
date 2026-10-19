import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { type DB, one, dataRoot } from "./db";
import { AppError, hashToken, sameOrigin } from "./security";
import { getRequirements } from "./requirements";
import { isNationalityField, defaultNationalityValue } from "../lib/letter-form";
import { dispatchWhatsAppNotification } from "./whatsapp";

const publicField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "number", "date", "select", "checkbox"]),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});
const publicRequirement = z.object({
  id: z.string(),
  label: z.string(),
  mandatory: z.boolean(),
});

const uuid = z.uuid();
const date = z.iso.date();
const identity = z.object({
  nik: z.string().regex(/^\d{16}$/, "NIK harus 16 digit"),
  birth_date: date,
}).strict();
const text = z.string().trim().max(500);

export const mandiriResidentSchema = z.object({
  nik: identity.shape.nik,
  name: text.min(1, "Nama lengkap wajib diisi"),
  birth_date: date,
  birth_place: text.min(1, "Tempat lahir wajib diisi"),
  gender: text.min(1, "Jenis kelamin wajib diisi"),
  religion: text.min(1, "Agama wajib diisi"),
  marital_status: text.optional(),
  occupation: text.min(1, "Pekerjaan wajib diisi"),
  address: text.min(1, "Alamat wajib diisi"),
  rt: text.min(1, "RT wajib diisi"),
  rw: text.min(1, "RW wajib diisi"),
}).strict();

export const mandiriSubmissionSchema = z.object({
  type_id: uuid,
  resident: mandiriResidentSchema,
  contact_phone: z.string().regex(/^\+?[0-9]{8,15}$/, "Nomor telepon tidak valid"),
  form_data: z.record(z.string().max(100), z.string().max(2000)).default({}),
}).strict();

const submission = mandiriSubmissionSchema;

const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

async function limited(db: DB, key: string, max: number) {
  await db.query("DELETE FROM mandiri_attempts WHERE reset_at < now()");
  const row = await one(
    db,
    `INSERT INTO mandiri_attempts(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN mandiri_attempts.reset_at<now() THEN 1 ELSE mandiri_attempts.attempts+1 END,reset_at=CASE WHEN mandiri_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE mandiri_attempts.reset_at END RETURNING attempts`,
    [hashToken(key)],
  );
  if (row.attempts > max)
    throw new AppError(429, "Terlalu banyak permintaan. Coba lagi dalam 15 menit.");
}

async function body(req: Request) {
  if (!req.body) throw new AppError(400, "Data permintaan diperlukan.");
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new AppError(413, "Ukuran permintaan terlalu besar.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function reuploadAttachment(file: File) {
  if (file.size === 0)
    throw new AppError(400, "Berkas kosong tidak dapat diunggah.");
  if (file.size > 5 * 1024 * 1024)
    throw new AppError(400, "Ukuran berkas melebihi batas maksimal 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    file.type === "application/pdf" &&
    bytes.subarray(0, 4).toString() === "%PDF" &&
    bytes.subarray(-1024).toString().includes("%%EOF")
  ) {
    return { bytes, extension: "pdf", media_type: "application/pdf" };
  }
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((isPng && file.type === "image/png") || (isJpg && (file.type === "image/jpeg" || file.type === "image/jpg"))) {
    try {
      const clean = await sharp(bytes, { limitInputPixels: 16000000 })
        .rotate()
        .png()
        .toBuffer();
      if (clean.length > 5 * 1024 * 1024) throw new Error();
      return { bytes: clean, extension: "png", media_type: "image/png" };
    } catch {
      throw new AppError(400, "Lampiran gambar tidak valid.");
    }
  }
  throw new AppError(400, "Format berkas tidak didukung. Gunakan format PDF, JPG, atau PNG.");
}

async function attachment(file: File) {
  if (file.size === 0 || file.size > 2 * 1024 * 1024)
    throw new AppError(400, "Lampiran maksimal 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    file.type === "application/pdf" &&
    bytes.subarray(0, 8).toString().startsWith("%PDF-1.") &&
    bytes.subarray(-1024).toString().includes("%%EOF")
  ) {
    return { bytes, extension: "pdf", media_type: "application/pdf" };
  }
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((png && file.type === "image/png") || (jpeg && file.type === "image/jpeg")) {
    try {
      const clean = await sharp(bytes, { limitInputPixels: 16000000 })
        .rotate()
        .png()
        .toBuffer();
      if (clean.length > 2 * 1024 * 1024) throw new Error();
      return { bytes: clean, extension: "png", media_type: "image/png" };
    } catch {
      throw new AppError(400, "Lampiran gambar tidak valid.");
    }
  }
  throw new AppError(400, "Lampiran harus PDF, PNG, atau JPEG yang valid.");
}

export async function createPermohonanMandiri(
  db: DB,
  village: string,
  raw: unknown,
  files: File[] = [],
  savedTracker: string[] = [],
) {
  const input = submission.parse(raw);
  await limited(db, "request:" + village + ":" + input.resident.nik, 5);
  const letterType = await one(
    db,
    "SELECT id, name FROM letter_types WHERE id=$1 AND active",
    [input.type_id],
  );
  if (!letterType) throw new AppError(400, "Jenis surat tidak tersedia.");

  const checked = await Promise.all(files.map(attachment));
  const directory = path.join(dataRoot(), "attachments");
  if (checked.length) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = [];
  for (const file of checked) {
    const name = randomUUID() + "." + file.extension,
      target = path.join(directory, name);
    await fs.writeFile(target, file.bytes, { flag: "wx", mode: 0o600 });
    savedTracker.push(target);
    metadata.push({ id: name, media_type: file.media_type, size: file.bytes.length });
  }

  const token = randomBytes(32).toString("hex");
  const ticket =
    "TIK-" +
    new Date().toISOString().slice(0, 7).replace("-", "") +
    "-" +
    randomBytes(4).toString("hex").toUpperCase();

  const row = await one(
    db,
    `INSERT INTO online_requests(id,ticket_code,type_id,village_id,form_data,contact_phone,attachments,tracking_token_hash,tracking_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '30 days') RETURNING created_at,tracking_expires_at,status`,
    [
      randomUUID(),
      ticket,
      input.type_id,
      village,
      JSON.stringify({ resident: input.resident, fields: input.form_data }),
      input.contact_phone,
      JSON.stringify(metadata),
      hashToken(token),
    ],
  );

  // Trigger WhatsApp notification ke nomor telepon pemohon (SUBMITTED / TIKET BARU)
  await dispatchWhatsAppNotification({
    to: input.contact_phone,
    ticket,
    status: "SUBMITTED",
    type_name: letterType.name || "Surat Keterangan",
    resident_name: input.resident.name,
  });

  let cleanPhone = input.contact_phone.replace(/[^0-9]/g, "");
  if (cleanPhone.startsWith("0")) cleanPhone = "62" + cleanPhone.slice(1);
  const trackingUrl = `https://mandiri.sikepel.biz.id/lacak?tiket=${ticket}`;
  const waMsg = `Permohonan Surat Kelurahan Cibodas\nNomor Tiket: ${ticket}\n\nUntuk melacak status permohonan, gunakan Tanggal Lahir pemohon yang didaftarkan saat pengajuan.\n\nTautan langsung menuju tracking berdasarkan nomor tiket:\n${trackingUrl}`;
  const wa_url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}` : "";

  return {
    ticket,
    status: row.status,
    created_at: row.created_at,
    tracking_token: token,
    tracking_expires_at: row.tracking_expires_at,
    tracking_url: trackingUrl,
    wa_url: wa_url || undefined,
    whatsapp_url: wa_url || undefined,
    whatsapp_message: waMsg,
  };
}

export async function mandiriResponse(
  req: Request,
  route: string,
  db: DB,
): Promise<Response> {
  const saved: string[] = [];
  try {
    const configured = uuid.safeParse(process.env.MANDIRI_VILLAGE_ID);
    if (
      !configured.success ||
      !(await one(db, "SELECT id FROM villages WHERE id=$1 AND active", [
        configured.data,
      ]))
    )
      throw new AppError(503, "Portal belum tersedia.");
    const village = configured.data;
    await limited(db, "portal:" + village, 300);
    if (req.method === "POST") sameOrigin(req);

    if (route === "types" && req.method === "GET") {
      // Letter types are global; only the configured village's requirements are public.
      const rows = await db.query(
        "SELECT id,name,code,slug,category,description,fields FROM letter_types WHERE active ORDER BY name,id",
      );
      const types = await Promise.all(
        rows.rows.map(async (row) => {
          const fields = z.array(publicField).parse(row.fields);
          const requirements = z
            .array(publicRequirement)
            .parse(await getRequirements(db, village, row.id));
          const defaults = Object.fromEntries(
            fields
              .filter(isNationalityField)
              .map((field) => [field.key, defaultNationalityValue(field)]),
          );
          return { ...row, fields, defaults, requirements };
        }),
      );
      return response({ types });
    }

    if (route === "check-nik" && req.method === "POST") {
      const input = identity.parse(JSON.parse((await body(req)).toString()));
      await limited(db, "identity:" + village + ":" + input.nik, 10);
      // Identity knowledge alone never authorizes disclosure of existing resident data.
      return response({ manual_entry: true });
    }
    if (route === "reupload" && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.startsWith("multipart/form-data"))
        throw new AppError(400, "Data permintaan harus berupa multipart form data.");

      const bytes = await body(req);
      const form = await new Response(bytes, {
        headers: { "content-type": contentType },
      }).formData();

      const ticketRaw = form.get("ticket") || form.get("tracking_id");
      if (typeof ticketRaw !== "string" || !/^TIK-\d{6}-[A-F0-9]{8}$/.test(ticketRaw.trim()))
        throw new AppError(400, "Nomor tiket permohonan tidak valid.");
      const ticket = ticketRaw.trim();

      // Rate limiting on tracking ticket / village
      await limited(db, "reupload:" + village + ":" + ticket, 10);

      const birthDate = date.parse(form.get("birth_date"));

      // File entries verification
      const fileEntries: { field: string; file: File }[] = [];
      for (const key of ["ktp", "kk", "surat_pendukung", "file", "attachments"]) {
        const items = form.getAll(key);
        for (const item of items) {
          if (item instanceof File && item.size > 0) {
            fileEntries.push({ field: key, file: item });
          } else if (typeof item === "string" && item.trim() !== "") {
            throw new AppError(400, "Format data berkas tidak valid.");
          }
        }
      }

      if (fileEntries.length === 0)
        throw new AppError(400, "Pilih minimal satu berkas perbaikan untuk diunggah.");
      if (fileEntries.length > 5)
        throw new AppError(400, "Maksimal lima berkas perbaikan dapat diunggah sekaligus.");

      // Check request in database
      const row = await one(
        db,
        `SELECT id, ticket_code, status, attachments, village_id FROM online_requests WHERE village_id=$1 AND ticket_code=$2 AND form_data->'resident'->>'birth_date'=$3`,
        [village, ticket, birthDate],
      );

      if (!row)
        throw new AppError(404, "Permohonan tidak ditemukan atau data identifikasi tidak sesuai.");

      const allowedStatuses = ["NEEDS_REVISION", "REVISION_REQUIRED", "PERLU_REVISI"];
      if (!allowedStatuses.includes(row.status))
        throw new AppError(409, "Permohonan tidak dalam status yang membutuhkan perbaikan dokumen.");

      // Validate all files
      const checkedFiles = await Promise.all(
        fileEntries.map(async (entry) => {
          const validated = await reuploadAttachment(entry.file);
          return { ...validated, originalName: entry.file.name, field: entry.field };
        }),
      );

      const directory = path.join(dataRoot(), "attachments");
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });

      const newAttachmentMeta: Array<{
        id: string;
        media_type: string;
        size: number;
        original_name: string;
        field: string;
        uploaded_at: string;
      }> = [];

      for (const item of checkedFiles) {
        const safeId = randomUUID() + "." + item.extension;
        const targetPath = path.join(directory, safeId);
        await fs.writeFile(targetPath, item.bytes, { flag: "wx", mode: 0o600 });
        saved.push(targetPath);
        newAttachmentMeta.push({
          id: safeId,
          media_type: item.media_type,
          size: item.bytes.length,
          original_name: item.originalName.slice(0, 100),
          field: item.field,
          uploaded_at: new Date().toISOString(),
        });
      }

      await db.transaction(async (tx) => {
        const currentReq = await one(
          tx,
          "SELECT id, attachments, status FROM online_requests WHERE id=$1 AND village_id=$2 AND ticket_code=$3 AND form_data->'resident'->>'birth_date'=$4 FOR UPDATE",
          [row.id, village, ticket, birthDate],
        );
        if (!currentReq) throw new AppError(404, "Permohonan tidak ditemukan.");
        if (!allowedStatuses.includes(currentReq.status)) throw new AppError(409, "Permohonan tidak dalam status revisi.");
        const existingList = Array.isArray(currentReq.attachments) ? currentReq.attachments : [];
        const mergedList = [...existingList, ...newAttachmentMeta];

        await tx.query(
          "UPDATE online_requests SET attachments=$1, updated_at=now() WHERE id=$2",
          [JSON.stringify(mergedList), row.id],
        );

        await tx.query(
          "INSERT INTO audit_logs(id,village_id,actor,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            village,
            "Warga (Permohonan Mandiri)",
            "ONLINE_REQUEST_REUPLOAD",
            "online_requests",
            row.id,
            JSON.stringify({
              ticket: row.ticket_code,
              files_count: newAttachmentMeta.length,
              files: newAttachmentMeta.map((f) => ({ id: f.id, field: f.field, size: f.size })),
            }),
          ],
        );
      });

      saved.length = 0;
      return response({
        success: true,
        message: "Dokumen perbaikan berhasil diunggah.",
        ticket: row.ticket_code,
        attachments: newAttachmentMeta,
      });
    }

    if (route === "request" && req.method === "POST") {
      const bytes = await body(req);
      let raw: unknown,
        files: File[] = [];
      if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
        const form = await new Response(bytes, {
          headers: { "content-type": req.headers.get("content-type")! },
        }).formData();
        if (
          [...form.keys()].some((key) => key !== "data" && key !== "attachments") ||
          form.getAll("data").length !== 1
        )
          throw new AppError(400, "Data permintaan tidak valid.");
        raw = JSON.parse(String(form.get("data")));
        const entries = form.getAll("attachments");
        if (entries.some((item) => typeof item === "string") || entries.length > 3)
          throw new AppError(400, "Maksimal tiga lampiran.");
        files = entries as File[];
      } else raw = JSON.parse(bytes.toString());

      const result = await createPermohonanMandiri(db, village, raw, files, saved);
      saved.length = 0;
      return response(result, 201);
    }

    if (route.startsWith("track/") && (req.method === "GET" || req.method === "POST")) {
      const ticket = route.slice(6).split("?")[0];
      if (!/^TIK-\d{6}-[A-F0-9]{8}$/.test(ticket))
        throw new AppError(404, "Nomor tiket atau tanggal lahir tidak sesuai.");

      const parsedUrl = new URL(req.url, "http://localhost");
      let birthDate =
        parsedUrl.searchParams.get("birth_date") ||
        parsedUrl.searchParams.get("birthDate") ||
        req.headers.get("x-birth-date") ||
        "";
      const legacyToken =
        req.headers.get("authorization")?.match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1] || "";
      const bearerMatch = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!birthDate && bearerMatch && /^\d{4}-\d{2}-\d{2}$/.test(bearerMatch)) {
        birthDate = bearerMatch;
      }
      if (req.method === "POST" && req.body) {
        try {
          const rawBytes = await body(req);
          if (rawBytes.length > 0) {
            const parsed = JSON.parse(rawBytes.toString());
            if (parsed && typeof parsed.birth_date === "string") {
              birthDate = parsed.birth_date;
            }
          }
        } catch {
          // ignore invalid body
        }
      }
      birthDate = birthDate.trim();
      await limited(
        db,
        "track:" + village + ":" + ticket + ":" + hashToken(birthDate || legacyToken || "anon"),
        60,
      );
      if (!birthDate && !legacyToken)
        throw new AppError(404, "Nomor tiket atau tanggal lahir tidak sesuai.");

      const row = await one(
        db,
        `SELECT r.ticket_code AS ticket,t.name AS type_name,r.status,r.created_at,r.revision_note FROM online_requests r JOIN letter_types t ON t.id=r.type_id WHERE r.village_id=$1 AND r.ticket_code=$2 AND (($3 <> '' AND r.form_data->'resident'->>'birth_date'=$3) OR ($4 <> '' AND r.tracking_token_hash=$4)) AND r.tracking_expires_at>now()`,
        [village, ticket, birthDate, legacyToken ? hashToken(legacyToken) : ""],
      );
      if (!row) throw new AppError(404, "Nomor tiket atau tanggal lahir tidak sesuai.");
      if (row.revision_note === null) delete row.revision_note;
      return response(row);
    }

    return response({ error: "Rute tidak ditemukan." }, 404);
  } catch (error) {
    await Promise.all(saved.map((file) => fs.unlink(file).catch(() => {})));
    if (error instanceof AppError)
      return response({ error: error.message }, error.status);
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof TypeError
    )
      return response({ error: "Data permintaan tidak valid." }, 400);
    return response({ error: "Permintaan tidak dapat diproses." }, 500);
  }
}
