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

  return {
    ticket,
    status: row.status,
    created_at: row.created_at,
    tracking_token: token,
    tracking_expires_at: row.tracking_expires_at,
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

    if (route.startsWith("track/") && req.method === "GET") {
      const token = req.headers
        .get("authorization")
        ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      await limited(db, "track:" + village + ":" + hashToken(token || "anonymous"), 60);
      const ticket = route.slice(6);
      if (!token || !/^TIK-\d{6}-[A-F0-9]{8}$/.test(ticket))
        throw new AppError(404, "Tiket tidak ditemukan.");
      const row = await one(
        db,
        `SELECT r.ticket_code AS ticket,t.name AS type_name,r.status,r.created_at,r.revision_note FROM online_requests r JOIN letter_types t ON t.id=r.type_id WHERE r.village_id=$1 AND r.ticket_code=$2 AND r.tracking_token_hash=$3 AND r.tracking_expires_at>now()`,
        [village, ticket, hashToken(token)],
      );
      if (!row) throw new AppError(404, "Tiket tidak ditemukan.");
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
