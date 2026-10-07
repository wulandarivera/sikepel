import { mandiriResponse } from "@/server/mandiri";
import { handleAdminPermohonanMandiri } from "@/server/permohonan-mandiri-admin";
import { optionalPasswordSchema } from "@/lib/password-policy";
import { NextRequest, NextResponse } from "next/server";
import { getRequirements, validateRequirements } from "@/server/requirements";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { z } from "zod";
import { getDB, one, dataRoot } from "@/server/db";
import { completeSetup, setupPending } from "@/server/setup";
import {
  AppError,
  sessionUser,
  hashToken,
  verifyPassword,
  hashPassword,
  requireRoles,
  requireVillage,
  authorizeRow,
  audit,
  sameOrigin,
} from "@/server/security";
import {
  residentSchema,
  villageSchema,
  officialSchema,
  typeSchema,
  parse,
} from "@/server/validation";
import {
  saveDraft,
  previewLetter,
  allocateLetter,
  generateLetter,
  cancelLetter,
  letterById,
  flatten,
} from "@/server/letters";
import { storage } from "@/server/storage";
import { validateTemplate, globalPlaceholders } from "@/server/documents";
import {
  parseDocxToEditorContent,
  buildDocxFromEditorContent,
  extractDocxLogo,
  type EditorParagraph,
} from "@/server/template-editor";
import type { User, Row } from "@/lib/types";
import { maxTemplateBytes } from "@/server/cloud-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const uuid = (value: string) => parse(z.uuid(), value);
const publicUser = (u: Row) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  village_id: u.village_id,
  active: u.active,
});
async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: p } = await context.params;
    const route = p.join("/"),
      method = req.method,
      db = await getDB();
    if (route.startsWith("mandiri/")) return mandiriResponse(req, route.slice(8), db);
    const token =
      req.cookies.get("sikepel_session")?.value ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (method !== "GET") {
      sameOrigin(req);
      const length = Number(req.headers.get("content-length") || 0);
      if (length > 11 * 1024 * 1024)
        throw new AppError(413, "Ukuran permintaan terlalu besar.");
    }
    if (route === "setup" && method === "GET") return json({ pending: await setupPending(db) });
    if (route === "setup" && method === "POST") {
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 16384) throw new AppError(413, "Ukuran permintaan terlalu besar.");
      const result = await completeSetup(db, JSON.parse(raw));
      await fs.unlink(path.join(dataRoot(), "SETUP-TOKEN.txt")).catch(() => {});
      return json(result);
    }
    if (route === "login" && method === "POST") {
      const input = parse(
        z.object({
          username: z.string().trim().min(1).max(100),
          password: z.string().min(1).max(256),
          remember: z.boolean().optional(),
        }),
        await req.json(),
      );
      const key = hashToken(input.username.toLowerCase());
      const limit = await one(
        db,
        "INSERT INTO login_attempts(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END, reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts",
        [key],
      );
      if (limit.attempts > 10)
        throw new AppError(
          429,
          "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
        );
      const u = await one(
        db,
        "SELECT u.* FROM users u LEFT JOIN villages v ON v.id=u.village_id WHERE lower(username)=$1 AND u.active AND (u.role='SUPER_ADMIN' OR v.active)",
        [input.username.toLowerCase()],
      );
      if (!u || !verifyPassword(input.password, u.password_hash)) {
        await db.query(
          "INSERT INTO audit_logs(id,actor,action,target_type,metadata) VALUES($1,'Tidak dikenal','LOGIN_FAILED','sessions',$2)",
          [
            randomUUID(),
            JSON.stringify({ account_reference: key.slice(0, 12) }),
          ],
        );
        throw new AppError(401, "Username atau kata sandi tidak sesuai.");
      }
      await db.query("DELETE FROM login_attempts WHERE key=$1", [key]);
      const session = randomBytes(32).toString("hex"),
        seconds = input.remember ? 604800 : 28800;
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at,scope_id) VALUES($1,$2,now()+($3 * interval '1 second'),$4)",
        [hashToken(session), u.id, seconds, u.village_id],
      );
      await audit(db, u, "LOGIN_SUCCESS", "users", u.id);
      const response = json({ user: publicUser(u) });
      response.cookies.set("sikepel_session", session, {
        httpOnly: true,
        sameSite: "strict",
        secure:
          req.nextUrl.protocol === "https:" ||
          req.headers.get("x-forwarded-proto") === "https",
        maxAge: seconds,
        path: "/",
      });
      return response;
    }
    const user = await sessionUser(token);
    if (!user) throw new AppError(401, "Sesi berakhir. Silakan masuk kembali.");
    if (
      (p[0] === "admin" && p[1] === "permohonan-mandiri") ||
      p[0] === "permohonan-mandiri"
    ) {
      const sub = p[0] === "admin" ? p.slice(2) : p.slice(1);
      return await handleAdminPermohonanMandiri(req, sub, user, db);
    }
    if (route === "logout" && method === "POST") {
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hashToken(token!),
      ]);
      const response = json({ ok: true });
      response.cookies.delete("sikepel_session");
      return response;
    }
    if (route === "scope" && method === "POST") {
      requireRoles(user, "SUPER_ADMIN");
      const { village_id } = await req.json();
      if (
        village_id &&
        !(await one(db, "SELECT id FROM villages WHERE id=$1", [
          uuid(village_id),
        ]))
      )
        throw new AppError(404, "Kelurahan tidak ditemukan.");
      await db.query("UPDATE sessions SET scope_id=$2 WHERE token_hash=$1", [
        hashToken(token!),
        village_id || null,
      ]);
      await audit(db, user, "SCOPE_CHANGE", "villages", village_id || null);
      return json({ ok: true });
    }
    if (p[0] === "types" && p[2] === "requirements" && p.length === 3) {
      requireRoles(user, "ADMIN", "SUPER_ADMIN");
      const scope = requireVillage(user), typeId = uuid(p[1]);
      if (!(await one(db, "SELECT id FROM letter_types WHERE id=$1", [typeId]))) throw new AppError(404, "Jenis surat tidak ditemukan.");
      if (method === "GET") return json({ requirements: await getRequirements(db, scope, typeId) });
      if (method === "PATCH") {
        const input = await req.json();
        if (input.village_id && input.village_id !== scope) throw new AppError(403, "Kelurahan tidak sesuai lingkup aktif.");
        const requirements = validateRequirements(input.requirements);
        await db.transaction(async (tx) => {
          await tx.query("SELECT id FROM letter_types WHERE id=$1 FOR UPDATE", [typeId]);
          await tx.query("INSERT INTO settings(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [`requirements:${scope}:${typeId}`, JSON.stringify({ requirements })]);
          await audit(tx, user, "REQUIREMENTS_UPDATE", "letter_types", typeId);
        });
        return json({ requirements });
      }
      throw new AppError(405, "Metode tidak didukung.");
    }
    if (route === "bootstrap" && method === "GET") {
      const [villages, types, officials, settings] = await Promise.all([
        db.query(
          user.role === "SUPER_ADMIN"
            ? "SELECT * FROM villages ORDER BY name"
            : "SELECT * FROM villages WHERE id=$1",
          user.role === "SUPER_ADMIN" ? [] : [user.village_id],
        ),
        db.query(
          "SELECT lt.*,t.id AS template_id,t.version AS template_version FROM letter_types lt LEFT JOIN templates t ON t.type_id=lt.id AND t.active ORDER BY CASE lt.slug WHEN 'domisili' THEN 1 WHEN 'tidak-mampu' THEN 2 WHEN 'penghasilan' THEN 3 WHEN 'belum-memiliki-rumah' THEN 4 WHEN 'pindah' THEN 5 WHEN 'ktp' THEN 6 WHEN 'nikah' THEN 7 ELSE 8 END,lt.name",
        ),
        user.village_id
          ? db.query(
              "SELECT * FROM officials WHERE village_id=$1 ORDER BY name",
              [user.village_id],
            )
          : Promise.resolve({ rows: [] }),
        one(db, "SELECT data FROM settings WHERE id='global'"),
      ]);
      return json({
        user: publicUser(user),
        villages: villages.rows.map(flatten),
        types: await Promise.all(types.rows.map(async (type: any) => ({ ...type, requirements: user.village_id ? await getRequirements(db, user.village_id, type.id) : [] }))),
        officials: officials.rows.map(flatten),
        local: !process.env.DATABASE_URL,
        settings: settings?.data,
      });
    }
    if (route === "dashboard" && method === "GET") {
      const village = user.village_id;
      const args = village ? [village] : [];
      const where = village ? "WHERE village_id=$1" : "";
      if (!village) requireRoles(user, "SUPER_ADMIN");

      const sp = req.nextUrl.searchParams;
      const periodParam = (sp.get("period") || "day").toLowerCase();
      const dateParam = sp.get("date") || "";
      const monthParam = sp.get("month") || "";
      const yearParam = sp.get("year") || "";

      let serviceDateCondition = "";
      const serviceArgs: any[] = [];
      if (village) {
        serviceArgs.push(village);
      }
      const villageJoin = village ? `AND l.village_id=$1` : "";

      let activePeriod: "day" | "month" | "year" = "day";
      let activeValue = "";

      if (periodParam === "year") {
        activePeriod = "year";
        const validYear = /^\d{4}$/.test(yearParam) ? yearParam : null;
        if (validYear) {
          serviceArgs.push(validYear);
          serviceDateCondition = `AND to_char(l.issued_at AT TIME ZONE 'Asia/Jakarta', 'YYYY') = $${serviceArgs.length}`;
          activeValue = validYear;
        } else {
          serviceDateCondition = `AND to_char(l.issued_at AT TIME ZONE 'Asia/Jakarta', 'YYYY') = to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY')`;
          activeValue = new Date().getFullYear().toString();
        }
      } else if (periodParam === "month") {
        activePeriod = "month";
        const validMonth = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;
        if (validMonth) {
          serviceArgs.push(validMonth);
          serviceDateCondition = `AND to_char(l.issued_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') = $${serviceArgs.length}`;
          activeValue = validMonth;
        } else {
          serviceDateCondition = `AND to_char(l.issued_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') = to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM')`;
          const now = new Date();
          activeValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        }
      } else {
        activePeriod = "day";
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
        if (validDate) {
          serviceArgs.push(validDate);
          serviceDateCondition = `AND (l.issued_at AT TIME ZONE 'Asia/Jakarta')::date = $${serviceArgs.length}::date`;
          activeValue = validDate;
        } else {
          serviceDateCondition = `AND (l.issued_at AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`;
          const now = new Date();
          activeValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        }
      }

      const [stats, months, popular, activity, villages, servicesQuery] = await Promise.all([
        one(
          db,
          `SELECT count(*)::int AS total,count(*) FILTER(WHERE status='ISSUED' AND (issued_at AT TIME ZONE 'Asia/Jakarta')::date=(now() AT TIME ZONE 'Asia/Jakarta')::date)::int AS today,count(*) FILTER(WHERE status='ISSUED' AND date_trunc('month',issued_at AT TIME ZONE 'Asia/Jakarta')=date_trunc('month',now() AT TIME ZONE 'Asia/Jakarta'))::int AS month,count(*) FILTER(WHERE status IN ('DRAFT','PREVIEW'))::int AS drafts,count(*) FILTER(WHERE status='ISSUE_PENDING')::int AS pending,count(*) FILTER(WHERE status='ISSUED')::int AS issued FROM letters ${where}`,
          args,
        ),
        db.query(
          `SELECT to_char(issued_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM') AS month,count(*)::int AS count FROM letters ${where ? where + " AND" : "WHERE"} status='ISSUED' AND issued_at>=date_trunc('month',now())-interval '5 months' GROUP BY 1 ORDER BY 1`,
          args,
        ),
        db.query(
          `SELECT t.name,t.category,count(*)::int AS count FROM letters l JOIN letter_types t ON t.id=l.type_id WHERE l.status='ISSUED' ${village ? "AND l.village_id=$1" : ""} GROUP BY t.name,t.category ORDER BY count DESC LIMIT 5`,
          args,
        ),
        db.query(
          `SELECT id,actor,action,created_at,target_type FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 5`,
          args,
        ),
        db.query(
          `SELECT v.id,v.name,v.active,count(l.id)::int AS total FROM villages v LEFT JOIN letters l ON l.village_id=v.id ${village ? "WHERE v.id=$1" : ""} GROUP BY v.id ORDER BY v.name`,
          args,
        ),
        db.query(
          `SELECT 
            t.id, 
            t.name, 
            t.code, 
            t.slug, 
            t.category,
            count(l.id) FILTER (WHERE l.status='ISSUED' ${serviceDateCondition})::int AS count
           FROM letter_types t
           LEFT JOIN letters l ON l.type_id=t.id ${villageJoin}
           WHERE t.active=true
           GROUP BY t.id, t.name, t.code, t.slug, t.category
           ORDER BY CASE t.slug 
             WHEN 'domisili' THEN 1 
             WHEN 'tidak-mampu' THEN 2 
             WHEN 'usaha' THEN 3 
             WHEN 'penghasilan' THEN 4 
             WHEN 'belum-memiliki-rumah' THEN 5 
             WHEN 'belum-menikah' THEN 6 
             WHEN 'suami-istri' THEN 7 
             WHEN 'pindah' THEN 8 
             WHEN 'ktp' THEN 9 
             WHEN 'nikah' THEN 10 
             ELSE 11 END, t.name`,
          serviceArgs,
        ),
      ]);
      const residents = await one(
        db,
        `SELECT count(*)::int AS count FROM residents ${where}`,
        args,
      );
      const services = servicesQuery.rows;
      const totalFiltered = services.reduce(
        (sum: number, s: any) => sum + (Number(s.count) || 0),
        0,
      );

      return json({
        stats: { ...stats, residents: residents.count },
        months: months.rows,
        popular: popular.rows,
        activity: activity.rows,
        villages: villages.rows,
        services,
        filter: {
          period: activePeriod,
          value: activeValue,
          total: totalFiltered,
        },
      });
    }
    if (p[0] === "residents") {
      requireRoles(user, "ADMIN", "OPERATOR", "SUPER_ADMIN");
      const village = requireVillage(user);
      if (method === "GET" && !p[1]) {
        const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100),
          page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1),
          size = 10;
        const r = await db.query(
          "SELECT *,count(*) OVER()::int AS total FROM residents WHERE village_id=$1 AND (name ILIKE $2 OR nik LIKE $2) ORDER BY (nik=$3) DESC,updated_at DESC LIMIT $4 OFFSET $5",
          [village, `%${q}%`, q, size, (page - 1) * size],
        );
        return json({
          items: r.rows.map(flatten),
          total: r.rows[0]?.total || 0,
          page,
        });
      }
      if (method === "GET" && p[1]) {
        const r = authorizeRow(
          user,
          await one(db, "SELECT * FROM residents WHERE id=$1", [uuid(p[1])]),
        );
        const history = await db.query(
          "SELECT l.id,l.number,l.status,l.created_at,t.name AS type_name FROM letters l JOIN letter_types t ON t.id=l.type_id WHERE l.resident_id=$1 AND l.village_id=$2 ORDER BY l.created_at DESC",
          [r.id, village],
        );
        return json({ ...flatten(r), history: history.rows });
      }
      if (method === "POST" || method === "PATCH") {
        const input = parse(residentSchema, await req.json());
        const { name, nik, ...data } = input;
        const id = p[1] ? uuid(p[1]) : randomUUID();
        return json(
          await db.transaction(async (tx) => {
            if (p[1])
              authorizeRow(
                user,
                await one(
                  tx,
                  "SELECT * FROM residents WHERE id=$1 FOR UPDATE",
                  [id],
                ),
              );
            if (
              await one(
                tx,
                "SELECT id FROM residents WHERE village_id=$1 AND nik=$2 AND id<>$3",
                [village, nik, id],
              )
            )
              throw new AppError(
                409,
                "NIK sudah tersimpan. Gunakan data penduduk yang tersedia.",
                { nik: "NIK sudah terdaftar di kelurahan ini" },
              );
            if (p[1])
              await tx.query(
                "UPDATE residents SET name=$2,nik=$3,data=$4,updated_at=now() WHERE id=$1",
                [id, name, nik, JSON.stringify(data)],
              );
            else
              await tx.query(
                "INSERT INTO residents(id,village_id,name,nik,data,created_by) VALUES($1,$2,$3,$4,$5,$6)",
                [id, village, name, nik, JSON.stringify(data), user.id],
              );
            await audit(
              tx,
              user,
              p[1] ? "RESIDENT_UPDATE" : "RESIDENT_CREATE",
              "residents",
              id,
              { fields: Object.keys(input) },
            );
            return flatten(
              (await one(tx, "SELECT * FROM residents WHERE id=$1", [id]))!,
            );
          }),
        );
      }
    }
    if (p[0] === "letters") {
      const village = requireVillage(user);
      if (method === "GET" && !p[1]) {
        const sp = req.nextUrl.searchParams,
          q = (sp.get("q") || "").slice(0, 100),
          page = Math.max(1, Number(sp.get("page")) || 1),
          args: any[] = [village, `%${q}%`];
        let filter =
          "l.village_id=$1 AND (l.status NOT IN ('DRAFT','PREVIEW') OR l.draft_expires_at > now()) AND (coalesce(l.draft_ticket,'') ILIKE $2 OR coalesce(l.number,'') ILIKE $2 OR coalesce(l.snapshot->'resident'->>'name',r.name) ILIKE $2 OR coalesce(l.snapshot->'resident'->>'nik',r.nik) LIKE $2)";
        for (const [key, col] of [
          ["status", "l.status"],
          ["type", "l.type_id"],
          ["from", "(l.created_at AT TIME ZONE 'Asia/Jakarta')::date"],
          ["to", "(l.created_at AT TIME ZONE 'Asia/Jakarta')::date"],
        ]) {
          const value = sp.get(key);
          if (value) {
            args.push(value);
            filter += ` AND ${col}${key === "from" ? ">=" : key === "to" ? "<=" : "="}$${args.length}`;
          }
        }
        args.push(10, (page - 1) * 10);
        const result = await db.query(
          `SELECT l.id,l.number,l.draft_ticket,l.draft_type_name,l.draft_expires_at,l.status,l.created_at,l.error,coalesce(l.snapshot->'resident'->>'name',r.name) AS resident_name,t.name AS type_name,u.name AS creator,count(*) OVER()::int AS total FROM letters l JOIN residents r ON r.id=l.resident_id JOIN letter_types t ON t.id=l.type_id JOIN users u ON u.id=l.created_by WHERE ${filter} ORDER BY l.created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
          args,
        );
        return json({
          items: result.rows,
          total: result.rows[0]?.total || 0,
          page,
        });
      }
      if (method === "POST" && !p[1])
        return json(await saveDraft(user, await req.json()));
      const id = uuid(p[1]);
      if (method === "PATCH" && !p[2])
        return json(await saveDraft(user, await req.json(), id));
      if (method === "POST" && p[2] === "preview")
        return json(await previewLetter(user, id));
      if (method === "POST" && p[2] === "issue")
        return json(await allocateLetter(user, id));
      if (method === "POST" && p[2] === "generate")
        return json(await generateLetter(user, id));
      if (method === "POST" && p[2] === "cancel")
        return json(await cancelLetter(user, id, (await req.json()).reason));
      const l = await letterById(db, user, id);
      if (method === "GET" && p[2] === "pdf") {
        const preview = req.nextUrl.searchParams.get("preview") === "1";
        const companion = req.nextUrl.searchParams.get("companion") === "1";
        const key = companion ? l.companion_pdf_path : preview ? l.preview_path : l.pdf_path;
        if (!key || (!preview && !["ISSUED", "CANCELLED"].includes(l.status)))
          throw new AppError(404, "PDF belum tersedia.");
        const bytes = await storage.get(key);
        await audit(
          db,
          user,
          req.nextUrl.searchParams.has("download")
            ? "PDF_DOWNLOAD"
            : "PDF_VIEW",
          "letters",
          id,
        );
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `${req.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="surat-${id}${companion ? "-pernyataan-belum-menikah" : ""}.pdf"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "GET" && !p[2]) {
        const resident = await one(
          db,
          "SELECT * FROM residents WHERE id=$1 AND village_id=$2",
          [l.resident_id, village],
        );
        const type = await one(db, "SELECT * FROM letter_types WHERE id=$1", [
          l.type_id,
        ]);
        const timeline = await db.query(
          "SELECT id,actor,action,created_at,metadata FROM audit_logs WHERE target_id=$1 AND village_id=$2 ORDER BY created_at DESC",
          [id, village],
        );
        return json({
          ...l,
          pdf_path: undefined,
          companion_pdf_path: undefined,
          preview_path: undefined,
          snapshot: l.snapshot
            ? {
                ...l.snapshot,
                template: {
                  id: l.snapshot.template.id,
                  version: l.snapshot.template.version,
                  file_name: l.snapshot.template.file_name,
                },
              }
            : null,
          has_pdf: !!l.pdf_path,
          has_companion_pdf: !!l.companion_pdf_path,
          has_preview: !!l.preview_path,
          resident: resident ? flatten(resident) : null,
          type: { ...type, requirements: await getRequirements(db, l.village_id, l.type_id) },
          timeline: timeline.rows,
        });
      }
    }
    if (p[0] === "templates") {
      requireRoles(user, "SUPER_ADMIN");
      if (method === "GET" && !p[1]) {
        const result = await db.query(
          "SELECT t.id,t.type_id,t.version,t.file_name,t.placeholders,t.errors,t.active,t.created_at,lt.name AS type_name,u.name AS uploader,(SELECT count(*)::int FROM letters l WHERE l.template_id=t.id OR l.snapshot->'template'->>'id'=t.id::text) AS usage_count FROM templates t JOIN letter_types lt ON lt.id=t.type_id LEFT JOIN users u ON u.id=t.created_by WHERE t.deleted_at IS NULL ORDER BY lt.name,t.version DESC",
        );
        return json({ items: result.rows, available: globalPlaceholders, max_template_bytes: maxTemplateBytes() });
      }
      if (method === "POST" && !p[1]) {
        const form = await req.formData();
        const file = form.get("file"),
          typeId = uuid(String(form.get("type_id")));
        if (
          !(file instanceof File) ||
          !file.name.toLowerCase().endsWith(".docx")
        )
          throw new AppError(400, "Pilih file DOCX.");
        if (file.size > maxTemplateBytes())
          throw new AppError(400, `Ukuran maksimal ${maxTemplateBytes() / 1024 / 1024} MB.`);
        const type = await one(db, "SELECT * FROM letter_types WHERE id=$1", [
          typeId,
        ]);
        if (!type) throw new AppError(404, "Jenis surat tidak ditemukan.");
        const bytes = Buffer.from(await file.arrayBuffer());
        const validation = validateTemplate(bytes, type.fields, type.slug),
          id = randomUUID(),
          key = `templates/${typeId}/${id}.docx`;
        await storage.put(key, bytes);
        return json(
          await db.transaction(async (tx) => {
            await tx.query(
              "SELECT id FROM letter_types WHERE id=$1 FOR UPDATE",
              [typeId],
            );
            const version = (
              await one(
                tx,
                "SELECT coalesce(max(version),0)+1 AS version FROM templates WHERE type_id=$1",
                [typeId],
              )
            ).version;
            await tx.query(
              "INSERT INTO templates(id,type_id,version,storage_path,file_name,placeholders,errors,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
              [
                id,
                typeId,
                version,
                key,
                file.name.slice(0, 200),
                JSON.stringify(validation.placeholders),
                JSON.stringify(validation.errors),
                user.id,
              ],
            );
            await audit(tx, user, "TEMPLATE_UPLOAD", "templates", id, {
              version,
            });
            return { id, version, ...validation };
          }),
        );
      }
      const id = uuid(p[1]);
      const t = await one(db, "SELECT * FROM templates WHERE id=$1", [id]);
      if (!t || t.deleted_at)
        throw new AppError(404, "Template tidak ditemukan.");
      if (method === "DELETE" && p.length === 2) {
        return json(
          await db.transaction(async (tx) => {
            // Match activation/upload lock order to serialize changes to this type.
            await tx.query(
              "SELECT id FROM letter_types WHERE id=$1 FOR UPDATE",
              [t.type_id],
            );
            const current = await one(
              tx,
              "SELECT * FROM templates WHERE id=$1 FOR UPDATE",
              [id],
            );
            if (!current || current.deleted_at)
              throw new AppError(404, "Template tidak ditemukan.");
            await tx.query(
              "UPDATE templates SET active=false,deleted_at=now() WHERE id=$1",
              [id],
            );
            await audit(tx, user, "TEMPLATE_DELETE", "templates", id, {
              type_id: current.type_id,
              version: current.version,
              file_name: current.file_name,
              was_active: current.active,
            });
            // Preserve the source for historical snapshots and pending PDF retries.
            return { ok: true };
          }),
        );
      }
      if (method === "GET" && p[2] === "editor-content") {
        const type = await one(db, "SELECT * FROM letter_types WHERE id=$1", [
          t.type_id,
        ]);
        if (!type) throw new AppError(404, "Jenis surat tidak ditemukan.");
        const buf = await storage.get(t.storage_path);
        const paragraphs = parseDocxToEditorContent(buf);
        return json({
          paragraphs,
          type: {
            id: type.id,
            name: type.name,
            slug: type.slug,
            code: type.code,
            fields: type.fields,
          },
          template: {
            id: t.id,
            version: t.version,
            file_name: t.file_name,
            active: t.active,
          },
          global_placeholders: globalPlaceholders,
          has_logo: true,
          logo_url: "/assets/kop-logo.png",
        });
      }
      if (method === "POST" && p[2] === "save-content") {
        const body = await req.json();
        const paragraphs = body.paragraphs as EditorParagraph[];
        const activate = Boolean(body.activate);
        const showLogo = body.show_logo !== false;
        if (!Array.isArray(paragraphs) || !paragraphs.length) {
          throw new AppError(400, "Konten template tidak boleh kosong.");
        }
        const type = await one(db, "SELECT * FROM letter_types WHERE id=$1", [
          t.type_id,
        ]);
        if (!type) throw new AppError(404, "Jenis surat tidak ditemukan.");
        const originalBuf = await storage.get(t.storage_path);
        const originalLogo = extractDocxLogo(originalBuf);
        const newBytes = await buildDocxFromEditorContent(paragraphs, type, {
          logoBytes: originalLogo,
          showLogo,
        });
        const validation = validateTemplate(newBytes, type.fields, type.slug);
        if (validation.errors.length && activate) {
          throw new AppError(400, validation.errors.join("; "));
        }
        const newId = randomUUID();
        const key = `templates/${t.type_id}/${newId}.docx`;
        await storage.put(key, newBytes);

        return json(
          await db.transaction(async (tx) => {
            await tx.query(
              "SELECT id FROM letter_types WHERE id=$1 FOR UPDATE",
              [t.type_id],
            );
            const nextVersion = (
              await one(
                tx,
                "SELECT coalesce(max(version),0)+1 AS version FROM templates WHERE type_id=$1",
                [t.type_id],
              )
            ).version;

            if (activate) {
              await tx.query(
                "UPDATE templates SET active=false WHERE type_id=$1",
                [t.type_id],
              );
            }

            await tx.query(
              "INSERT INTO templates(id,type_id,version,storage_path,file_name,placeholders,errors,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                newId,
                t.type_id,
                nextVersion,
                key,
                `template-${type.slug}-v${nextVersion}.docx`,
                JSON.stringify(validation.placeholders),
                JSON.stringify(validation.errors),
                activate,
                user.id,
              ],
            );

            await audit(tx, user, "TEMPLATE_EDIT_SAVE", "templates", newId, {
              source_template_id: t.id,
              version: nextVersion,
              active: activate,
            });

            return {
              ok: true,
              id: newId,
              version: nextVersion,
              active: activate,
              validation,
            };
          }),
        );
      }
      if (method === "POST" && p[2] === "open-libreoffice") {
        const type = await one(db, "SELECT * FROM letter_types WHERE id=$1", [
          t.type_id,
        ]);
        if (!type) throw new AppError(404, "Jenis surat tidak ditemukan.");

        const workDir = path.join(dataRoot(), "libreoffice-edits");
        await fs.mkdir(workDir, { recursive: true });
        const filePath = path.join(workDir, `${type.slug}-template-v${t.version}.docx`);
        const docxBytes = await storage.get(t.storage_path);
        await fs.writeFile(filePath, docxBytes);

        // Find LibreOffice or Office binary
        const candidates = [
          process.env.LIBREOFFICE_PATH,
          "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
          "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
          "C:\\Program Files\\Microsoft Office\\Root\\Office16\\WINWORD.EXE",
        ];
        let appBinary = "";
        for (const c of candidates) {
          if (c && fsSync.existsSync(/* turbopackIgnore: true */ c)) {
            appBinary = c;
            break;
          }
        }

        if (appBinary) {
          execFile(/* turbopackIgnore: true */ appBinary, [filePath], (err) => {
            if (err) console.error("Desktop office launch error:", err);
          });
          return json({
            ok: true,
            launched: true,
            app: appBinary.includes("soffice") ? "LibreOffice Writer" : "Microsoft Word",
            file_path: filePath,
          });
        } else {
          // Open using system default association
          execFile("cmd.exe", ["/c", "start", "", filePath], (err) => {
            if (err) console.error("System open error:", err);
          });
          return json({
            ok: true,
            launched: true,
            app: "Aplikasi Default Windows",
            file_path: filePath,
          });
        }
      }
      if (method === "POST" && p[2] === "save-libreoffice") {
        const type = await one(db, "SELECT * FROM letter_types WHERE id=$1", [
          t.type_id,
        ]);
        if (!type) throw new AppError(404, "Jenis surat tidak ditemukan.");
        const workDir = path.join(dataRoot(), "libreoffice-edits");
        const filePath = path.join(workDir, `${type.slug}-template-v${t.version}.docx`);
        if (!fsSync.existsSync(/* turbopackIgnore: true */ filePath)) {
          throw new AppError(400, "File editan LibreOffice belum ditemukan di folder lokal.");
        }
        const newBytes = await fs.readFile(filePath);
        const validation = validateTemplate(newBytes, type.fields, type.slug);
        const newId = randomUUID();
        const key = `templates/${t.type_id}/${newId}.docx`;
        await storage.put(key, newBytes);

        return json(
          await db.transaction(async (tx) => {
            await tx.query("SELECT id FROM letter_types WHERE id=$1 FOR UPDATE", [t.type_id]);
            const nextVersion = (
              await one(tx, "SELECT coalesce(max(version),0)+1 AS version FROM templates WHERE type_id=$1", [t.type_id])
            ).version;

            await tx.query("UPDATE templates SET active=false WHERE type_id=$1", [t.type_id]);
            await tx.query(
              "INSERT INTO templates(id,type_id,version,storage_path,file_name,placeholders,errors,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                newId,
                t.type_id,
                nextVersion,
                key,
                `template-${type.slug}-v${nextVersion}.docx`,
                JSON.stringify(validation.placeholders),
                JSON.stringify(validation.errors),
                true,
                user.id,
              ],
            );
            await audit(tx, user, "TEMPLATE_EDIT_LIBREOFFICE", "templates", newId, {
              source_template_id: t.id,
              version: nextVersion,
            });
            return { ok: true, id: newId, version: nextVersion, active: true, validation };
          }),
        );
      }
      if (method === "GET" && p[2] === "download") {
        return new NextResponse(
          new Uint8Array(await storage.get(t.storage_path)),
          {
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition": `attachment; filename="template-v${t.version}.docx"`,
              "Cache-Control": "no-store",
            },
          },
        );
      }
      if (method === "POST" && p[2] === "activate") {
        return json(
          await db.transaction(async (tx) => {
            const type = await one(
              tx,
              "SELECT * FROM letter_types WHERE id=$1 FOR UPDATE",
              [t.type_id],
            );
            const current = await one(
              tx,
              "SELECT id FROM templates WHERE id=$1 AND deleted_at IS NULL",
              [id],
            );
            if (!current) throw new AppError(404, "Template tidak ditemukan.");
            const validation = validateTemplate(
              await storage.get(t.storage_path),
              type.fields,
              type.slug,
            );
            if (validation.errors.length)
              throw new AppError(400, validation.errors.join("; "));
            await tx.query(
              "UPDATE templates SET active=false WHERE type_id=$1",
              [t.type_id],
            );
            await tx.query(
              "UPDATE templates SET active=true,errors=$2,placeholders=$3 WHERE id=$1",
              [
                id,
                JSON.stringify(validation.errors),
                JSON.stringify(validation.placeholders),
              ],
            );
            await audit(tx, user, "TEMPLATE_ACTIVATE", "templates", id, {
              version: t.version,
            });
            return { ok: true };
          }),
        );
      }
    }
    if (["villages", "officials", "types", "users"].includes(p[0])) {
      const table = {
        villages: "villages",
        officials: "officials",
        types: "letter_types",
        users: "users",
      }[p[0]]!;
      requireRoles(user, "SUPER_ADMIN", "ADMIN");
      if (p[0] === "types") requireRoles(user, "SUPER_ADMIN");
      if (method === "GET" && !p[1]) {
        let where = "",
          args: any[] = [];
        if (p[0] === "villages" && user.role !== "SUPER_ADMIN") {
          where = " WHERE id=$1";
          args = [requireVillage(user)];
        }
        if (
          ["officials", "users"].includes(p[0]) &&
          (user.role !== "SUPER_ADMIN" || user.village_id)
        ) {
          where = " WHERE village_id=$1";
          args = [requireVillage(user)];
        }
        const rows = (
          await db.query(
            `SELECT ${p[0] === "users" ? "id,name,username,role,active,village_id,created_at" : "*"} FROM ${table}${where} ORDER BY name`,
            args,
          )
        ).rows;
        return json({ items: rows.map(flatten) });
      }
      if (method === "POST" || method === "PATCH") {
        const input = await req.json(),
          id = p[1] ? uuid(p[1]) : randomUUID();
        return json(
          await db.transaction(async (tx) => {
            const old = p[1]
              ? await one(tx, `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [
                  id,
                ])
              : null;
            if (p[1] && !old) throw new AppError(404, "Data tidak ditemukan.");
            if (old && user.role !== "SUPER_ADMIN") {
              if (p[0] === "villages" && old.id !== user.village_id)
                throw new AppError(403, "Anda tidak memiliki akses.");
              if (old.village_id && old.village_id !== user.village_id)
                throw new AppError(403, "Anda tidak memiliki akses.");
              if (old.role === "SUPER_ADMIN")
                throw new AppError(403, "Anda tidak memiliki akses.");
            }
            if (p[0] === "villages") {
              if (!old) requireRoles(user, "SUPER_ADMIN");
              const v = parse(villageSchema, input);
              if (user.role !== "SUPER_ADMIN" && v.active !== old.active)
                throw new AppError(
                  403,
                  "Hanya Super Admin dapat mengubah status kelurahan.",
                );
              const { name, code, active, ...data } = v;
              if (old)
                await tx.query(
                  "UPDATE villages SET name=$2,code=$3,active=$4,data=$5 WHERE id=$1",
                  [id, name, code, active, JSON.stringify(data)],
                );
              else
                await tx.query(
                  "INSERT INTO villages(id,name,code,active,data) VALUES($1,$2,$3,$4,$5)",
                  [id, name, code, active, JSON.stringify(data)],
                );
            }
            if (p[0] === "officials") {
              const v = parse(officialSchema, input),
                { name, active, ...data } = v;
              const village = old?.village_id || requireVillage(user);
              if (old)
                await tx.query(
                  "UPDATE officials SET name=$2,active=$3,data=$4 WHERE id=$1",
                  [id, name, active, JSON.stringify(data)],
                );
              else
                await tx.query(
                  "INSERT INTO officials(id,village_id,name,active,data) VALUES($1,$2,$3,$4,$5)",
                  [id, village, name, active, JSON.stringify(data)],
                );
            }
            if (p[0] === "types") {
              const v = parse(typeSchema, input);
              const reserved = v.fields.filter((f) =>
                globalPlaceholders.includes(f.key),
              );
              if (reserved.length)
                throw new AppError(
                  400,
                  "Kunci field tidak boleh menggantikan placeholder penduduk, organisasi, atau penomoran.",
                );
              if (old)
                await tx.query(
                  "UPDATE letter_types SET name=$2,code=$3,slug=$4,category=$5,description=$6,active=$7,fields=$8 WHERE id=$1",
                  [
                    id,
                    v.name,
                    v.code,
                    v.slug,
                    v.category,
                    v.description,
                    v.active,
                    JSON.stringify(v.fields),
                  ],
                );
              else
                await tx.query(
                  "INSERT INTO letter_types(id,name,code,slug,category,description,active,fields) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                  [
                    id,
                    v.name,
                    v.code,
                    v.slug,
                    v.category,
                    v.description,
                    v.active,
                    JSON.stringify(v.fields),
                  ],
                );
              const templates = (
                await tx.query(
                  "SELECT * FROM templates WHERE type_id=$1 AND deleted_at IS NULL",
                  [id],
                )
              ).rows;
              for (const template of templates) {
                const val = validateTemplate(
                  await storage.get(template.storage_path),
                  v.fields,
                  v.slug,
                );
                await tx.query(
                  "UPDATE templates SET errors=$2,active=CASE WHEN $3 THEN false ELSE active END WHERE id=$1",
                  [
                    template.id,
                    JSON.stringify(val.errors),
                    val.errors.length > 0,
                  ],
                );
              }
            }
            if (p[0] === "users") {
              const v = parse(
                z.object({
                  name: z.string().trim().min(1).max(100),
                  username: z
                    .string()
                    .trim()
                    .regex(/^[a-z0-9.@_-]{3,100}$/),
                  role: z.enum([
                    "SUPER_ADMIN",
                    "ADMIN",
                    "OPERATOR",
                    "PIMPINAN",
                  ]),
                  active: z.boolean(),
                  password: optionalPasswordSchema,
                  village_id: z.string().nullable().optional(),
                }),
                input,
              );
              if (user.role !== "SUPER_ADMIN" && v.role === "SUPER_ADMIN")
                throw new AppError(
                  403,
                  "Admin Kelurahan tidak dapat membuat Super Admin.",
                );
              if (id === user.id && (v.role !== user.role || !v.active))
                throw new AppError(
                  400,
                  "Peran atau status akun sendiri tidak dapat diubah di sini.",
                );
              const village =
                user.role === "SUPER_ADMIN"
                  ? v.role === "SUPER_ADMIN"
                    ? null
                    : v.village_id || user.village_id
                  : requireVillage(user);
              if (v.role !== "SUPER_ADMIN" && !village)
                throw new AppError(400, "Pilih kelurahan untuk pengguna.");
              if (!old && (!v.password || !v.password.trim()))
                throw new AppError(400, "Kata sandi awal wajib diisi.");
              const hashed = v.password
                ? hashPassword(v.password)
                : old?.password_hash;
              if (old) {
                await tx.query(
                  "UPDATE users SET name=$2,username=$3,role=$4,active=$5,village_id=$6,password_hash=$7 WHERE id=$1",
                  [id, v.name, v.username, v.role, v.active, village, hashed],
                );
                if (
                  v.role !== old.role ||
                  v.active !== old.active ||
                  village !== old.village_id ||
                  v.password
                )
                  await tx.query("DELETE FROM sessions WHERE user_id=$1", [id]);
              } else
                await tx.query(
                  "INSERT INTO users(id,name,username,role,active,village_id,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
                  [id, v.name, v.username, v.role, v.active, village, hashed],
                );
            }
            await audit(
              tx,
              user,
              `${p[0].toUpperCase()}_${old ? "UPDATE" : "CREATE"}`,
              p[0],
              id,
              { fields: Object.keys(input).filter((k) => k !== "password") },
            );
            return { id, ok: true };
          }),
        );
      }
    }
    if (route === "audit" && method === "GET") {
      requireRoles(user, "ADMIN", "SUPER_ADMIN");
      const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100),
        page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
      const args: any[] = [`%${q}%`];
      let filter = "(action ILIKE $1 OR actor ILIKE $1)";
      if (user.village_id) {
        args.push(user.village_id);
        filter += " AND village_id=$2";
      } else requireRoles(user, "SUPER_ADMIN");
      args.push((page - 1) * 20);
      const r = await db.query(
        `SELECT id,actor,action,target_type,target_id,metadata,created_at,count(*) OVER()::int AS total FROM audit_logs WHERE ${filter} ORDER BY created_at DESC LIMIT 20 OFFSET $${args.length}`,
        args,
      );
      return json({ items: r.rows, total: r.rows[0]?.total || 0, page });
    }
    if (route === "report" && method === "GET") {
      requireRoles(user, "ADMIN", "SUPER_ADMIN", "PIMPINAN");
      const args: any[] = [],
        sp = req.nextUrl.searchParams;
      let filter = "l.status='ISSUED'";
      if (user.village_id) {
        args.push(user.village_id);
        filter += ` AND l.village_id=$${args.length}`;
      } else requireRoles(user, "SUPER_ADMIN");
      for (const [key, op] of [
        ["from", ">="],
        ["to", "<="],
      ])
        if (sp.get(key)) {
          args.push(sp.get(key));
          filter += ` AND (l.issued_at AT TIME ZONE 'Asia/Jakarta')::date${op}$${args.length}`;
        }
      const rows = (
        await db.query(
          `SELECT v.name AS village,t.name AS type,count(*)::int AS count FROM letters l JOIN villages v ON v.id=l.village_id JOIN letter_types t ON t.id=l.type_id WHERE ${filter} GROUP BY v.name,t.name ORDER BY v.name,count DESC`,
          args,
        )
      ).rows;
      if (sp.has("download")) {
        const safe = (v: unknown) =>
          '"' +
          String(v)
            .replace(/^[=+@-]/, "'$&")
            .replaceAll('"', '""') +
          '"';
        const csv =
          "\ufeffKelurahan,Jenis Surat,Jumlah\r\n" +
          rows
            .map((r) => [r.village, r.type, r.count].map(safe).join(","))
            .join("\r\n");
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="laporan-sikepel.csv"',
            "Cache-Control": "no-store",
          },
        });
      }
      return json({ items: rows });
    }
    if (route === "profile" && method === "PATCH") {
      const v = parse(
        z.object({
          name: z.string().trim().min(1).max(100),
          current_password: z.string().optional(),
          new_password: optionalPasswordSchema,
        }),
        await req.json(),
      );
      const old = await one(db, "SELECT * FROM users WHERE id=$1", [user.id]);
      if (v.new_password) {
        if (!v.new_password.trim())
          throw new AppError(400, "Kata sandi baru tidak boleh kosong.");
        if (!verifyPassword(v.current_password || "", old.password_hash))
          throw new AppError(400, "Kata sandi saat ini tidak sesuai.");
        await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          user.id,
          hashPassword(v.new_password),
        ]);
        await db.query(
          "DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2",
          [user.id, hashToken(token!)],
        );
      }
      await db.query("UPDATE users SET name=$2 WHERE id=$1", [user.id, v.name]);
      await audit(db, user, "PROFILE_UPDATE", "users", user.id);
      return json({ ok: true });
    }
    if (route === "settings") {
      requireRoles(user, "SUPER_ADMIN");
      if (method === "GET")
        return json(
          (await one(db, "SELECT data FROM settings WHERE id='global'")).data,
        );
      if (method === "PATCH") {
        const input = parse(
          z.object({
            district: z.string().trim().min(1).max(100),
            city: z.string().trim().min(1).max(100),
          }),
          await req.json(),
        );
        await db.query("UPDATE settings SET data=$1 WHERE id='global'", [
          JSON.stringify({ ...input, timezone: "Asia/Jakarta" }),
        ]);
        await audit(db, user, "SETTINGS_UPDATE", "settings", null);
        return json({ ok: true });
      }
    }
    if (route === "counters") {
      requireRoles(user, "SUPER_ADMIN");
      const village = requireVillage(user);
      if (method === "GET")
        return json({
          items: (
            await db.query(
              "SELECT c.*,t.name FROM counters c JOIN letter_types t ON t.id=c.type_id WHERE village_id=$1 ORDER BY year DESC,t.name",
              [village],
            )
          ).rows,
        });
      if (method === "PATCH") {
        const v = parse(
          z.object({
            type_id: z.uuid(),
            year: z.number().int().min(2020).max(2100),
            last_sequence: z.number().int().min(0).max(99999999),
            reason: z.string().trim().min(5).max(1000),
          }),
          await req.json(),
        );
        return json(
          await db.transaction(async (tx) => {
            await tx.query(
              "INSERT INTO counters(village_id,type_id,year,last_sequence) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING",
              [village, v.type_id, v.year],
            );
            const old = await one(
              tx,
              "SELECT * FROM counters WHERE village_id=$1 AND type_id=$2 AND year=$3 FOR UPDATE",
              [village, v.type_id, v.year],
            );
            if (v.last_sequence < old.last_sequence)
              throw new AppError(
                400,
                "Counter tidak boleh diturunkan agar nomor tidak digunakan ulang.",
              );
            await tx.query(
              "UPDATE counters SET last_sequence=$4 WHERE village_id=$1 AND type_id=$2 AND year=$3",
              [village, v.type_id, v.year, v.last_sequence],
            );
            await audit(tx, user, "NUMBER_ADJUSTMENT", "counters", null, {
              ...v,
              previous: old.last_sequence,
            });
            return { ok: true };
          }),
        );
      }
    }
    throw new AppError(404, "Halaman atau tindakan tidak ditemukan.");
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message, fields: error.fields }, error.status);
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "23505")
        return json(
          { error: "Data sudah digunakan. Periksa NIK, kode, atau username." },
          409,
        );
      if (["22P02", "22007", "22008", "23503"].includes(String(error.code)))
        return json({ error: "Referensi atau format data tidak valid." }, 400);
    }
    const reference = randomUUID().slice(0, 8);
    console.error(
      "SIKEPEL request failed",
      reference,
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error: `Permintaan belum berhasil diproses. Coba kembali. Referensi: ${reference}`,
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
