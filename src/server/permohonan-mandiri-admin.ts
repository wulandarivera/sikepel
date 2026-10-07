import { NextRequest, NextResponse } from "next/server";
import { type DB, one, dataRoot } from "./db";
import type { User } from "../lib/types";
import { AppError, requireRoles, requireVillage, audit } from "./security";
import { saveDraft, previewLetter, allocateLetter } from "./letters";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function validateUUID(value: string, message = "ID tidak valid."): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw new AppError(400, message);
  }
  return value;
}

export async function handleAdminPermohonanMandiri(
  req: NextRequest,
  pathParts: string[],
  user: User,
  db: DB,
): Promise<NextResponse | Response> {
  requireRoles(user, "ADMIN", "OPERATOR", "SUPER_ADMIN");
  const village = requireVillage(user);
  const method = req.method;

  // 1. GET /api/admin/permohonan-mandiri
  if (pathParts.length === 0) {
    if (method !== "GET") {
      throw new AppError(405, "Metode tidak diizinkan.");
    }
    const searchParams = req.nextUrl.searchParams;
    const statusParam = searchParams.get("status");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 10));
    const offset = (page - 1) * limit;
    const q = (searchParams.get("q") || "").trim().slice(0, 100);

    const validStatuses = [
      "PENDING_VERIFICATION",
      "NEEDS_REVISION",
      "APPROVED",
      "REJECTED",
      "COMPLETED",
    ];

    const conditions: string[] = ["r.village_id = $1"];
    const params: any[] = [village];
    let paramIdx = 2;

    if (statusParam) {
      const statuses = statusParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      for (const st of statuses) {
        if (!validStatuses.includes(st)) {
          throw new AppError(400, "Status permohonan tidak valid.");
        }
      }
      if (statuses.length === 1) {
        conditions.push(`r.status = $${paramIdx++}`);
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        conditions.push(`r.status = ANY($${paramIdx++})`);
        params.push(statuses);
      }
    }

    if (q) {
      conditions.push(
        `(r.ticket_code ILIKE $${paramIdx} OR r.form_data->'resident'->>'name' ILIKE $${paramIdx} OR r.form_data->'resident'->>'nik' LIKE $${paramIdx})`,
      );
      params.push(`%${q}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");
    params.push(limit, offset);
    const querySql = `
      SELECT
        r.id,
        r.ticket_code,
        r.type_id,
        r.village_id,
        r.resident_id,
        r.status,
        r.revision_note,
        r.contact_phone,
        r.letter_id,
        r.created_at,
        r.updated_at,
        r.verified_at,
        r.verified_by,
        r.form_data,
        t.name AS type_name,
        count(*) OVER()::int AS total_count
      FROM online_requests r
      JOIN letter_types t ON t.id = r.type_id
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    const res = await db.query(querySql, params);
    const total = res.rows[0]?.total_count || 0;

    const items = res.rows.map((row: any) => {
      const residentObj = (row.form_data?.resident || {}) as Record<string, any>;
      return {
        id: row.id,
        ticket_code: row.ticket_code,
        tiket: row.ticket_code,
        nama_pemohon: residentObj.name || "",
        nik: residentObj.nik || "",
        jenis_surat: row.type_name,
        type_name: row.type_name,
        type_id: row.type_id,
        status: row.status,
        tanggal_submit: row.created_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        contact_phone: row.contact_phone,
        revision_note: row.revision_note,
        letter_id: row.letter_id,
      };
    });

    return json({
      items,
      total,
      page,
      limit,
    });
  }

  // 2. /api/admin/permohonan-mandiri/:id
  if (pathParts.length === 1) {
    if (pathParts[0] === "count" || pathParts[0] === "stats") {
      if (method !== "GET") {
        throw new AppError(405, "Metode tidak diizinkan.");
      }
      const pendingRes = await db.query(
        "SELECT count(*)::int AS count FROM online_requests WHERE village_id = $1 AND status = 'PENDING_VERIFICATION'",
        [village],
      );
      const c = pendingRes.rows[0]?.count || 0;
      return json({ count: c, pending: c, pending_verification: c });
    }

    const id = validateUUID(pathParts[0], "ID permohonan tidak valid.");

    // GET /api/admin/permohonan-mandiri/:id
    if (method === "GET") {
      const row = await one(
        db,
        `
        SELECT
          r.*,
          t.name AS type_name,
          u.name AS verified_by_name
        FROM online_requests r
        JOIN letter_types t ON t.id = r.type_id
        LEFT JOIN users u ON u.id = r.verified_by
        WHERE r.id = $1
      `,
        [id],
      );
      if (!row) {
        throw new AppError(404, "Permohonan tidak ditemukan.");
      }
      if (row.village_id !== village) {
        throw new AppError(403, "Anda tidak memiliki akses ke data ini.");
      }

      const residentObj = (row.form_data?.resident || {}) as Record<string, any>;
      const fieldsObj = (row.form_data?.fields || row.form_data || {}) as Record<
        string,
        any
      >;

      const attachments = (row.attachments || []).map((att: any) => ({
        id: att.id,
        media_type: att.media_type,
        size: att.size,
        url: `/api/admin/permohonan-mandiri/${row.id}/lampiran/${att.id}`,
        stream_url: `/api/admin/permohonan-mandiri/${row.id}/lampiran/${att.id}`,
      }));

      const auditLogs = await db.query(
        `
        SELECT id, actor, action, metadata, created_at
        FROM audit_logs
        WHERE target_type = 'online_requests' AND target_id = $1
        ORDER BY created_at ASC
      `,
        [id],
      );

      let linkedLetter = null;
      if (row.letter_id) {
        linkedLetter = await one(
          db,
          "SELECT id, number, status, created_at FROM letters WHERE id = $1",
          [row.letter_id],
        );
      }

      return json({
        id: row.id,
        ticket_code: row.ticket_code,
        tiket: row.ticket_code,
        status: row.status,
        type_id: row.type_id,
        jenis_surat: row.type_name,
        type_name: row.type_name,
        village_id: row.village_id,
        resident_id: row.resident_id,
        contact_phone: row.contact_phone,
        nama_pemohon: residentObj.name || "",
        nik: residentObj.nik || "",
        pemohon: {
          nik: residentObj.nik || "",
          name: residentObj.name || "",
          birth_date: residentObj.birth_date || "",
          birth_place: residentObj.birth_place || "",
          gender: residentObj.gender || "",
          religion: residentObj.religion || "",
          marital_status: residentObj.marital_status || "",
          occupation: residentObj.occupation || "",
          address: residentObj.address || "",
          rt: residentObj.rt || "",
          rw: residentObj.rw || "",
          no_kk: residentObj.no_kk || "",
        },
        form_data: fieldsObj,
        raw_form_data: row.form_data,
        attachments,
        lampiran: attachments,
        revision_note: row.revision_note,
        tanggal_submit: row.created_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        verified_at: row.verified_at,
        verified_by: row.verified_by,
        verified_by_name: row.verified_by_name,
        letter_id: row.letter_id,
        letter: linkedLetter,
        riwayat: auditLogs.rows,
        status_riwayat: auditLogs.rows,
        audit_trail: auditLogs.rows,
      });
    }

    // PATCH /api/admin/permohonan-mandiri/:id
    if (method === "PATCH") {
      const row = await one(
        db,
        "SELECT * FROM online_requests WHERE id = $1",
        [id],
      );
      if (!row) {
        throw new AppError(404, "Permohonan tidak ditemukan.");
      }
      if (row.village_id !== village) {
        throw new AppError(403, "Anda tidak memiliki akses ke data ini.");
      }
      if (["REJECTED", "COMPLETED"].includes(row.status)) {
        throw new AppError(
          400,
          `Permohonan dengan status ${row.status} tidak dapat diubah.`,
        );
      }

      const body = await req.json().catch(() => {
        throw new AppError(400, "Format data JSON tidak valid.");
      });

      const currentFormData = (row.form_data || {}) as Record<string, any>;
      const currentResident = (currentFormData.resident || {}) as Record<
        string,
        any
      >;
      const currentFields = (currentFormData.fields || {}) as Record<
        string,
        any
      >;

      const changedFields: string[] = [];
      const newResident = { ...currentResident };
      const newFields = { ...currentFields };

      if (body.resident && typeof body.resident === "object") {
        for (const [key, val] of Object.entries(body.resident)) {
          if (newResident[key] !== val) {
            newResident[key] = val;
            changedFields.push(`resident.${key}`);
          }
        }
      }

      const fieldsUpdate =
        body.form_data?.fields || body.fields || body.form_data || {};
      if (typeof fieldsUpdate === "object" && fieldsUpdate !== null) {
        for (const [key, val] of Object.entries(fieldsUpdate)) {
          if (key !== "resident" && key !== "fields") {
            if (newFields[key] !== val) {
              newFields[key] = val;
              changedFields.push(key);
            }
          }
        }
      }

      // Also check if body has direct keys for fields (excluding resident, fields, form_data)
      for (const [key, val] of Object.entries(body)) {
        if (!["resident", "fields", "form_data"].includes(key)) {
          if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
            if (newFields[key] !== val) {
              newFields[key] = val;
              if (!changedFields.includes(key)) changedFields.push(key);
            }
          }
        }
      }

      const updatedFormData = {
        ...currentFormData,
        resident: newResident,
        fields: newFields,
      };

      await db.query(
        `
        UPDATE online_requests
        SET form_data = $1, updated_at = now()
        WHERE id = $2 AND village_id = $3
      `,
        [JSON.stringify(updatedFormData), id, village],
      );

      await audit(
        db,
        user,
        "ONLINE_REQUEST_UPDATE",
        "online_requests",
        id,
        {
          changed_fields: changedFields,
          actor: user.name,
        },
      );

      return json({
        ok: true,
        id,
        form_data: newFields,
        resident: newResident,
        changed_fields: changedFields,
        updated_at: new Date().toISOString(),
      });
    }

    throw new AppError(405, "Metode tidak diizinkan.");
  }

  // 3. /api/admin/permohonan-mandiri/:id/:action
  if (pathParts.length === 2) {
    const id = validateUUID(pathParts[0], "ID permohonan tidak valid.");
    const action = pathParts[1];

    if (method !== "POST") {
      throw new AppError(405, "Metode tidak diizinkan.");
    }

    const row = await one(
      db,
      "SELECT * FROM online_requests WHERE id = $1",
      [id],
    );
    if (!row) {
      throw new AppError(404, "Permohonan tidak ditemukan.");
    }
    if (row.village_id !== village) {
      throw new AppError(403, "Anda tidak memiliki akses ke data ini.");
    }

    // POST /api/admin/permohonan-mandiri/:id/minta-perbaikan
    if (action === "minta-perbaikan") {
      if (["REJECTED", "APPROVED", "COMPLETED"].includes(row.status)) {
        throw new AppError(
          400,
          `Permohonan dengan status ${row.status} tidak dapat diminta perbaikan.`,
        );
      }
      const body = await req.json().catch(() => ({}));
      const note = (
        body.catatan_perbaikan ||
        body.revision_note ||
        ""
      ).trim();
      if (!note) {
        throw new AppError(400, "Catatan perbaikan wajib diisi.");
      }
      if (note.length > 2000) {
        throw new AppError(400, "Catatan perbaikan maksimal 2000 karakter.");
      }

      await db.query(
        `
        UPDATE online_requests
        SET status = 'NEEDS_REVISION',
            revision_note = $1,
            verified_by = $2,
            verified_at = now(),
            updated_at = now()
        WHERE id = $3 AND village_id = $4
      `,
        [note, user.id, id, village],
      );

      await audit(
        db,
        user,
        "ONLINE_REQUEST_NEEDS_REVISION",
        "online_requests",
        id,
        {
          revision_note: note,
          actor: user.name,
        },
      );

      return json({
        ok: true,
        id,
        status: "NEEDS_REVISION",
        revision_note: note,
        catatan_perbaikan: note,
      });
    }

    // POST /api/admin/permohonan-mandiri/:id/tolak
    if (action === "tolak") {
      if (["APPROVED", "COMPLETED"].includes(row.status)) {
        throw new AppError(409, "Permohonan sudah disetujui sebelumnya.");
      }
      const body = await req.json().catch(() => ({}));
      const reason = (
        body.alasan_penolakan ||
        body.reason ||
        body.revision_note ||
        ""
      ).trim();
      if (!reason) {
        throw new AppError(400, "Alasan penolakan wajib diisi.");
      }
      if (reason.length > 2000) {
        throw new AppError(400, "Alasan penolakan maksimal 2000 karakter.");
      }

      await db.query(
        `
        UPDATE online_requests
        SET status = 'REJECTED',
            revision_note = $1,
            verified_by = $2,
            verified_at = now(),
            updated_at = now()
        WHERE id = $3 AND village_id = $4
      `,
        [reason, user.id, id, village],
      );

      await audit(
        db,
        user,
        "ONLINE_REQUEST_REJECTED",
        "online_requests",
        id,
        {
          reason,
          actor: user.name,
        },
      );

      return json({
        ok: true,
        id,
        status: "REJECTED",
        alasan_penolakan: reason,
        revision_note: reason,
      });
    }

    // POST /api/admin/permohonan-mandiri/:id/setujui
    if (action === "setujui") {
      if (["APPROVED", "COMPLETED"].includes(row.status)) {
        throw new AppError(409, "Permohonan sudah disetujui sebelumnya.");
      }
      if (row.status === "REJECTED") {
        throw new AppError(409, "Permohonan sudah ditolak.");
      }

      const body = await req.json().catch(() => ({}));
      const pemohon = (row.form_data?.resident || {}) as Record<string, any>;
      if (!pemohon.nik || !pemohon.name) {
        throw new AppError(400, "Data pemohon tidak lengkap.");
      }

      // Check or create resident in master residents
      const existingRes = await one(
        db,
        "SELECT id, name, nik FROM residents WHERE village_id = $1 AND nik = $2",
        [village, pemohon.nik],
      );

      let residentId: string;
      if (existingRes) {
        residentId = existingRes.id;
      } else {
        residentId = randomUUID();
        const resData = {
          no_kk: pemohon.no_kk || "",
          birth_place: pemohon.birth_place || "",
          birth_date: pemohon.birth_date || "",
          gender: pemohon.gender || "",
          religion: pemohon.religion || "",
          marital_status: pemohon.marital_status || "",
          occupation: pemohon.occupation || "",
          address: pemohon.address || "",
          rt: pemohon.rt || "",
          rw: pemohon.rw || "",
          phone: row.contact_phone || "",
        };
        await db.query(
          `
          INSERT INTO residents(id, village_id, name, nik, data, created_by)
          VALUES($1, $2, $3, $4, $5, $6)
        `,
          [
            residentId,
            village,
            pemohon.name,
            pemohon.nik,
            JSON.stringify(resData),
            user.id,
          ],
        );
        await audit(
          db,
          user,
          "RESIDENT_CREATED_FROM_REQUEST",
          "residents",
          residentId,
          { nik: pemohon.nik, request_id: id },
        );
      }

      // Prepare form_data for letter draft
      const letterFields = {
        ...(row.form_data?.fields || row.form_data || {}),
      };
      delete (letterFields as any).resident;
      delete (letterFields as any).fields;
      if (!letterFields.reporter_phone && row.contact_phone) {
        letterFields.reporter_phone = row.contact_phone;
      }

      // Create official letter draft
      const draft = await saveDraft(user, {
        resident_id: residentId,
        type_id: row.type_id,
        official_id: body.official_id,
        form_data: letterFields,
      });

      let letterResult: any = draft;

      // If operator explicitly requested generating official letter number
      if (body.generate_number) {
        try {
          await previewLetter(user, draft.id);
          letterResult = await allocateLetter(user, draft.id);
        } catch {
          // If converter or prerequisite not met, fall back to draft
          letterResult = draft;
        }
      }

      // Update online_requests to APPROVED with linked letter_id and resident_id
      await db.query(
        `
        UPDATE online_requests
        SET status = 'APPROVED',
            resident_id = $1,
            letter_id = $2,
            verified_by = $3,
            verified_at = now(),
            updated_at = now()
        WHERE id = $4 AND village_id = $5
      `,
        [residentId, draft.id, user.id, id, village],
      );

      await audit(
        db,
        user,
        "ONLINE_REQUEST_APPROVED",
        "online_requests",
        id,
        {
          resident_id: residentId,
          letter_id: draft.id,
          actor: user.name,
        },
      );

      return json({
        ok: true,
        id,
        status: "APPROVED",
        resident_id: residentId,
        letter_id: draft.id,
        letter: letterResult,
      });
    }

    throw new AppError(404, "Tindakan tidak ditemukan.");
  }

  // 4. GET /api/admin/permohonan-mandiri/:id/(lampiran|attachments)/:attachmentId
  if (pathParts.length === 3) {
    const id = validateUUID(pathParts[0], "ID permohonan tidak valid.");
    const sub = pathParts[1];
    const attachmentId = pathParts[2];

    if (!["lampiran", "attachments"].includes(sub)) {
      throw new AppError(404, "Rute tidak ditemukan.");
    }
    if (method !== "GET") {
      throw new AppError(405, "Metode tidak diizinkan.");
    }

    const row = await one(
      db,
      "SELECT * FROM online_requests WHERE id = $1",
      [id],
    );
    if (!row) {
      throw new AppError(404, "Permohonan tidak ditemukan.");
    }
    if (row.village_id !== village) {
      throw new AppError(403, "Anda tidak memiliki akses ke data ini.");
    }

    const att = (row.attachments || []).find((a: any) => a.id === attachmentId);
    if (!att) {
      throw new AppError(404, "Lampiran tidak ditemukan.");
    }

    const safeName = path.basename(attachmentId);
    if (safeName !== attachmentId) {
      throw new AppError(400, "Nama lampiran tidak valid.");
    }

    const filePath = path.join(dataRoot(), "attachments", safeName);
    const bytes = await fs.readFile(filePath).catch(() => null);
    if (!bytes) {
      throw new AppError(404, "Berkas lampiran fisik tidak ditemukan.");
    }

    await audit(
      db,
      user,
      "ONLINE_REQUEST_ATTACHMENT_VIEW",
      "online_requests",
      id,
      { attachment_id: safeName },
    );

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": att.media_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  throw new AppError(404, "Halaman atau tindakan tidak ditemukan.");
}
