import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { hashToken } from "../src/server/security";

const testRoot = path.resolve(".data", "test-mandiri-admin-" + randomUUID());
process.env.SIKEPEL_DATA_DIR = testRoot;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_URL;

const origin = "http://127.0.0.1:3000";

test(
  "Operator Permohonan Mandiri: list, detail, secure stream, edit redaksi, minta perbaikan, tolak, dan setujui",
  { timeout: 180000 },
  async () => {
    // 1. Initialize fixtures
    execFileSync(process.execPath, ["--import", "tsx", "tests/seed-fixtures.ts"], {
      env: { ...process.env, SIKEPEL_TEST_FIXTURES: "1" },
      stdio: "pipe",
    });

    const access = await fs.readFile(
      path.join(testRoot, "AKSES-LOKAL.txt"),
      "utf8",
    );
    const password = access.match(/Kata sandi semua akun contoh: (.+)/)![1];

    const route = await import("../src/app/api/[...path]/route");
    const { getDB, one } = await import("../src/server/db");
    const db = await getDB();

    async function apiRequest(
      url: string,
      method = "GET",
      data?: unknown,
      cookie = "",
    ) {
      const body =
        data instanceof FormData
          ? data
          : data === undefined
            ? undefined
            : JSON.stringify(data);
      const req = new NextRequest(origin + "/api/" + url, {
        method,
        body,
        headers: {
          origin,
          host: "127.0.0.1:3000",
          ...(data && !(data instanceof FormData)
            ? { "content-type": "application/json" }
            : {}),
          ...(cookie ? { cookie: `sikepel_session=${cookie}` } : {}),
        },
      });
      const res =
        method === "GET"
          ? await route.GET(req, { params: Promise.resolve({ path: url.split("?")[0].split("/") }) })
          : method === "POST"
            ? await route.POST(req, { params: Promise.resolve({ path: url.split("?")[0].split("/") }) })
            : method === "PATCH"
              ? await route.PATCH(req, { params: Promise.resolve({ path: url.split("?")[0].split("/") }) })
              : await route.DELETE(req, { params: Promise.resolve({ path: url.split("?")[0].split("/") }) });
      return res;
    }

    async function login(username: string): Promise<string> {
      const res = await apiRequest("login", "POST", { username, password });
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie") || "";
      const match = setCookie.match(/sikepel_session=([^;]+)/);
      assert.ok(match, "Session cookie must be set");
      return match[1];
    }

    const sessionOperatorA = await login("operator"); // Sukamaju
    const sessionOperatorB = await login("operator.b"); // Sukamurni
    const sessionPimpinan = await login("pimpinan"); // Pimpinan Sukamaju

    const villageA = await one(db, "SELECT id FROM villages WHERE code = 'SKM'");
    const villageB = await one(db, "SELECT id FROM villages WHERE code = 'SKN'");
    const letterType = await one(db, "SELECT id FROM letter_types WHERE slug = 'umum'");

    // Create attachments directory and dummy attachment file
    const attachmentsDir = path.join(testRoot, "attachments");
    await fs.mkdir(attachmentsDir, { recursive: true, mode: 0o700 });
    const sampleAttachmentId = randomUUID() + ".pdf";
    const sampleAttachmentPath = path.join(attachmentsDir, sampleAttachmentId);
    await fs.writeFile(sampleAttachmentPath, "%PDF-1.4 dummy content", { mode: 0o600 });

    // Seed test requests for Village A
    const req1Id = randomUUID();
    const req1Ticket = "TIK-202610-A1111111";
    const req1Token = randomBytes(32).toString("hex");
    await db.query(
      `
      INSERT INTO online_requests(
        id, ticket_code, type_id, village_id, form_data, contact_phone, attachments, tracking_token_hash, tracking_expires_at
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '30 days')
    `,
      [
        req1Id,
        req1Ticket,
        letterType.id,
        villageA.id,
        JSON.stringify({
          resident: {
            nik: "3201011212900001",
            name: "Ahmad Dahlan",
            birth_date: "1990-12-12",
            birth_place: "Bogor",
            gender: "Laki-laki",
            religion: "Islam",
            marital_status: "Kawin",
            occupation: "Wiraswasta",
            address: "Jl. Melati No. 10",
            rt: "001",
            rw: "002",
          },
          fields: {
            keperluan: "Pengurusan izin usaha mikro",
          },
        }),
        "081234567890",
        JSON.stringify([
          {
            id: sampleAttachmentId,
            media_type: "application/pdf",
            size: 21,
          },
        ]),
        hashToken(req1Token),
      ],
    );

    const req2Id = randomUUID();
    const req2Ticket = "TIK-202610-A2222222";
    const req2Token = randomBytes(32).toString("hex");
    await db.query(
      `
      INSERT INTO online_requests(
        id, ticket_code, type_id, village_id, form_data, contact_phone, attachments, tracking_token_hash, tracking_expires_at
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '30 days')
    `,
      [
        req2Id,
        req2Ticket,
        letterType.id,
        villageA.id,
        JSON.stringify({
          resident: {
            nik: "3201011505920002",
            name: "Siti Badriah",
            birth_date: "1992-05-15",
            address: "Jl. Mawar No. 5",
          },
          fields: {
            keperluan: "Pengurusan BPJS Kesehatan",
          },
        }),
        "081234567891",
        JSON.stringify([]),
        hashToken(req2Token),
      ],
    );

    const req3Id = randomUUID();
    const req3Ticket = "TIK-202610-A3333333";
    const req3Token = randomBytes(32).toString("hex");
    await db.query(
      `
      INSERT INTO online_requests(
        id, ticket_code, type_id, village_id, form_data, contact_phone, attachments, tracking_token_hash, tracking_expires_at
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '30 days')
    `,
      [
        req3Id,
        req3Ticket,
        letterType.id,
        villageA.id,
        JSON.stringify({
          resident: {
            nik: "3201012010880003",
            name: "Bambang Pamungkas",
            birth_date: "1988-10-20",
            address: "Jl. Kenanga No. 12",
          },
          fields: {
            keperluan: "Pendaftaran lomba kelurahan",
          },
        }),
        "081234567892",
        JSON.stringify([]),
        hashToken(req3Token),
      ],
    );

    // Seed test request for Village B (Sukamurni)
    const reqBId = randomUUID();
    const reqBTicket = "TIK-202610-B1111111";
    const reqBToken = randomBytes(32).toString("hex");
    await db.query(
      `
      INSERT INTO online_requests(
        id, ticket_code, type_id, village_id, form_data, contact_phone, attachments, tracking_token_hash, tracking_expires_at
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '30 days')
    `,
      [
        reqBId,
        reqBTicket,
        letterType.id,
        villageB.id,
        JSON.stringify({
          resident: {
            nik: "3201021111950009",
            name: "Warga Sukamurni",
            birth_date: "1995-11-11",
            address: "Jl. Sukamurni Indah No. 1",
          },
          fields: {
            keperluan: "Surat pengantar dinas",
          },
        }),
        "081299998888",
        JSON.stringify([]),
        hashToken(reqBToken),
      ],
    );

    // ----------------------------------------------------
    // TEST 1: Auth & Role Gates
    // ----------------------------------------------------
    // Unauthenticated request
    const unauthRes = await apiRequest("admin/permohonan-mandiri");
    assert.equal(unauthRes.status, 401);

    // Pimpinan role cannot access operator endpoint
    const pimpinanRes = await apiRequest("admin/permohonan-mandiri", "GET", undefined, sessionPimpinan);
    assert.equal(pimpinanRes.status, 403);

    // Operator Sukamaju accesses endpoint successfully
    const authRes = await apiRequest("admin/permohonan-mandiri", "GET", undefined, sessionOperatorA);
    assert.equal(authRes.status, 200);

    // ----------------------------------------------------
    // TEST 2: Scoped Listing & Filtering
    // ----------------------------------------------------
    const listAData = await authRes.json();
    assert.equal(listAData.total, 3);
    assert.equal(listAData.items.length, 3);
    // All items must belong to Village A
    const ticketsA = listAData.items.map((i: any) => i.ticket_code);
    assert.ok(ticketsA.includes(req1Ticket));
    assert.ok(ticketsA.includes(req2Ticket));
    assert.ok(ticketsA.includes(req3Ticket));
    assert.ok(!ticketsA.includes(reqBTicket), "Village A operator must NOT see Village B request");

    // Operator Sukamurni sees only Village B request
    const listBRes = await apiRequest("admin/permohonan-mandiri", "GET", undefined, sessionOperatorB);
    assert.equal(listBRes.status, 200);
    const listBData = await listBRes.json();
    assert.equal(listBData.total, 1);
    assert.equal(listBData.items[0].ticket_code, reqBTicket);

    // Pagination test
    const pageRes = await apiRequest("admin/permohonan-mandiri?page=1&limit=2", "GET", undefined, sessionOperatorA);
    assert.equal(pageRes.status, 200);
    const pageData = await pageRes.json();
    assert.equal(pageData.items.length, 2);
    assert.equal(pageData.total, 3);
    assert.equal(pageData.limit, 2);
    assert.equal(pageData.page, 1);

    // Filter by status: PENDING_VERIFICATION
    const filterRes = await apiRequest("admin/permohonan-mandiri?status=PENDING_VERIFICATION", "GET", undefined, sessionOperatorA);
    assert.equal(filterRes.status, 200);
    const filterData = await filterRes.json();
    assert.equal(filterData.total, 3);

    // ----------------------------------------------------
    // TEST 3: Detail Endpoint & Secure Attachment Stream
    // ----------------------------------------------------
    const detailRes = await apiRequest(`admin/permohonan-mandiri/${req1Id}`, "GET", undefined, sessionOperatorA);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.id, req1Id);
    assert.equal(detailData.ticket_code, req1Ticket);
    assert.equal(detailData.pemohon.name, "Ahmad Dahlan");
    assert.equal(detailData.pemohon.nik, "3201011212900001");
    assert.equal(detailData.form_data.keperluan, "Pengurusan izin usaha mikro");
    assert.equal(detailData.attachments.length, 1);
    assert.equal(detailData.attachments[0].id, sampleAttachmentId);
    assert.equal(detailData.attachments[0].media_type, "application/pdf");
    assert.ok(detailData.attachments[0].url.includes(sampleAttachmentId));
    assert.ok(Array.isArray(detailData.status_riwayat));

    // Operator B cannot view Village A request detail (403)
    const crossDetailRes = await apiRequest(`admin/permohonan-mandiri/${req1Id}`, "GET", undefined, sessionOperatorB);
    assert.equal(crossDetailRes.status, 403);

    // Non-existent ID returns 404
    const notFoundDetail = await apiRequest(`admin/permohonan-mandiri/${randomUUID()}`, "GET", undefined, sessionOperatorA);
    assert.equal(notFoundDetail.status, 404);

    // Secure attachment stream
    const streamRes = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}/lampiran/${sampleAttachmentId}`,
      "GET",
      undefined,
      sessionOperatorA,
    );
    assert.equal(streamRes.status, 200);
    assert.equal(streamRes.headers.get("content-type"), "application/pdf");
    const streamedText = await streamRes.text();
    assert.equal(streamedText, "%PDF-1.4 dummy content");

    // Secure attachment stream: path traversal rejected (400)
    const badStreamRes = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}/lampiran/..%2Fbad.pdf`,
      "GET",
      undefined,
      sessionOperatorA,
    );
    assert.ok([400, 404].includes(badStreamRes.status));

    // Secure attachment stream: cross-tenant rejected (403)
    const crossStreamRes = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}/lampiran/${sampleAttachmentId}`,
      "GET",
      undefined,
      sessionOperatorB,
    );
    assert.equal(crossStreamRes.status, 403);

    // ----------------------------------------------------
    // TEST 4: Edit Redaksi / Form Data oleh Operator
    // ----------------------------------------------------
    const patchRes = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}`,
      "PATCH",
      {
        form_data: {
          keperluan: "Pengurusan izin usaha mikro binaan kelurahan Sukamaju",
        },
      },
      sessionOperatorA,
    );
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.ok, true);
    assert.equal(patchData.form_data.keperluan, "Pengurusan izin usaha mikro binaan kelurahan Sukamaju");

    // Verify detail reflects the edit
    const detailAfterPatch = await apiRequest(`admin/permohonan-mandiri/${req1Id}`, "GET", undefined, sessionOperatorA);
    const detailAfterPatchData = await detailAfterPatch.json();
    assert.equal(
      detailAfterPatchData.form_data.keperluan,
      "Pengurusan izin usaha mikro binaan kelurahan Sukamaju",
    );

    // Verify audit log exists
    const auditLogs = await db.query(
      "SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'ONLINE_REQUEST_UPDATE'",
      [req1Id],
    );
    assert.ok(auditLogs.rows.length >= 1);
    assert.equal(auditLogs.rows[0].actor, "Budi Santoso");

    // Cross-tenant PATCH is forbidden
    const crossPatch = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}`,
      "PATCH",
      { keperluan: "Peretasan antar kelurahan" },
      sessionOperatorB,
    );
    assert.equal(crossPatch.status, 403);

    // ----------------------------------------------------
    // TEST 5: POST minta-perbaikan
    // ----------------------------------------------------
    // Empty note fails (400)
    const emptyRevisionRes = await apiRequest(
      `admin/permohonan-mandiri/${req2Id}/minta-perbaikan`,
      "POST",
      { catatan_perbaikan: "   " },
      sessionOperatorA,
    );
    assert.equal(emptyRevisionRes.status, 400);

    // Valid revision request
    const revisionNote = "Foto KTP buram, mohon perbarui foto kartu identitas.";
    const validRevisionRes = await apiRequest(
      `admin/permohonan-mandiri/${req2Id}/minta-perbaikan`,
      "POST",
      { catatan_perbaikan: revisionNote },
      sessionOperatorA,
    );
    assert.equal(validRevisionRes.status, 200);
    const revisionData = await validRevisionRes.json();
    assert.equal(revisionData.ok, true);
    assert.equal(revisionData.status, "NEEDS_REVISION");
    assert.equal(revisionData.revision_note, revisionNote);

    // Verify status updated in DB
    const req2Row = await one(db, "SELECT status, revision_note FROM online_requests WHERE id = $1", [req2Id]);
    assert.equal(req2Row.status, "NEEDS_REVISION");
    assert.equal(req2Row.revision_note, revisionNote);

    // Verify citizen tracking API sees NEEDS_REVISION and the revision note
    const trackReq = new Request(origin + `/api/mandiri/track/${req2Ticket}`, {
      headers: {
        authorization: `Bearer ${req2Token}`,
      },
    });
    const { mandiriResponse } = await import("../src/server/mandiri");
    process.env.MANDIRI_VILLAGE_ID = villageA.id;
    const citizenTrackRes = await mandiriResponse(trackReq, `track/${req2Ticket}`, db);
    assert.equal(citizenTrackRes.status, 200);
    const citizenTrackData = await citizenTrackRes.json();
    assert.equal(citizenTrackData.status, "NEEDS_REVISION");
    assert.equal(citizenTrackData.revision_note, revisionNote);

    // ----------------------------------------------------
    // TEST 6: POST tolak
    // ----------------------------------------------------
    // Empty reason fails (400)
    const emptyRejectRes = await apiRequest(
      `admin/permohonan-mandiri/${req3Id}/tolak`,
      "POST",
      { alasan_penolakan: "" },
      sessionOperatorA,
    );
    assert.equal(emptyRejectRes.status, 400);

    // Valid rejection
    const rejectReason = "Pemohon berdomisili di luar wilayah kelurahan Sukamaju.";
    const validRejectRes = await apiRequest(
      `admin/permohonan-mandiri/${req3Id}/tolak`,
      "POST",
      { alasan_penolakan: rejectReason },
      sessionOperatorA,
    );
    assert.equal(validRejectRes.status, 200);
    const rejectData = await validRejectRes.json();
    assert.equal(rejectData.ok, true);
    assert.equal(rejectData.status, "REJECTED");
    assert.equal(rejectData.revision_note, rejectReason);

    // Verify status updated in DB
    const req3Row = await one(db, "SELECT status, revision_note FROM online_requests WHERE id = $1", [req3Id]);
    assert.equal(req3Row.status, "REJECTED");
    assert.equal(req3Row.revision_note, rejectReason);

    // Attempting to approve rejected request fails (409)
    const approveRejectedRes = await apiRequest(
      `admin/permohonan-mandiri/${req3Id}/setujui`,
      "POST",
      {},
      sessionOperatorA,
    );
    assert.equal(approveRejectedRes.status, 409);

    // ----------------------------------------------------
    // TEST 7: POST setujui
    // ----------------------------------------------------
    // Prior to approval, applicant NIK 3201011212900001 does NOT exist in residents table
    const residentBefore = await one(
      db,
      "SELECT id FROM residents WHERE village_id = $1 AND nik = '3201011212900001'",
      [villageA.id],
    );
    assert.ok(!residentBefore);

    // Cross-tenant approval is forbidden (403)
    const crossApprove = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}/setujui`,
      "POST",
      {},
      sessionOperatorB,
    );
    assert.equal(crossApprove.status, 403);

    // Approve request 1
    const approveRes = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}/setujui`,
      "POST",
      {},
      sessionOperatorA,
    );
    assert.equal(approveRes.status, 200);
    const approveData = await approveRes.json();
    assert.equal(approveData.ok, true);
    assert.equal(approveData.status, "APPROVED");
    assert.ok(approveData.resident_id, "Must return created resident id");
    assert.ok(approveData.letter_id, "Must return created draft letter id");

    // Verify resident is now in residents table
    const residentAfter = await one(
      db,
      "SELECT id, name, nik, data FROM residents WHERE id = $1",
      [approveData.resident_id],
    );
    assert.ok(residentAfter);
    assert.equal(residentAfter.name, "Ahmad Dahlan");
    assert.equal(residentAfter.nik, "3201011212900001");
    assert.equal(residentAfter.data.address, "Jl. Melati No. 10");

    // Verify letter draft is in letters table with status DRAFT
    const letterRow = await one(
      db,
      "SELECT id, status, resident_id, type_id, form_data FROM letters WHERE id = $1",
      [approveData.letter_id],
    );
    assert.ok(letterRow);
    assert.equal(letterRow.status, "DRAFT");
    assert.equal(letterRow.resident_id, approveData.resident_id);
    assert.equal(letterRow.type_id, letterType.id);

    // Verify online_requests is updated to APPROVED and linked
    const req1Row = await one(
      db,
      "SELECT status, resident_id, letter_id, verified_by FROM online_requests WHERE id = $1",
      [req1Id],
    );
    assert.equal(req1Row.status, "APPROVED");
    assert.equal(req1Row.resident_id, approveData.resident_id);
    assert.equal(req1Row.letter_id, approveData.letter_id);

    // Verify approving again fails (409)
    const approveAgainRes = await apiRequest(
      `admin/permohonan-mandiri/${req1Id}/setujui`,
      "POST",
      {},
      sessionOperatorA,
    );
    assert.equal(approveAgainRes.status, 409);

    // Test approval when applicant already exists in master residents
    const req4Id = randomUUID();
    const req4Ticket = "TIK-202610-A4444444";
    const req4Token = randomBytes(32).toString("hex");
    await db.query(
      `
      INSERT INTO online_requests(
        id, ticket_code, type_id, village_id, form_data, contact_phone, attachments, tracking_token_hash, tracking_expires_at
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '30 days')
    `,
      [
        req4Id,
        req4Ticket,
        letterType.id,
        villageA.id,
        JSON.stringify({
          resident: {
            nik: "3201011212900001", // same NIK as existing Ahmad Dahlan
            name: "Ahmad Dahlan",
            birth_date: "1990-12-12",
            address: "Jl. Melati No. 10",
          },
          fields: {
            keperluan: "Pengurusan izin usaha kedua",
          },
        }),
        "081234567890",
        JSON.stringify([]),
        hashToken(req4Token),
      ],
    );

    const approveExistingRes = await apiRequest(
      `admin/permohonan-mandiri/${req4Id}/setujui`,
      "POST",
      {},
      sessionOperatorA,
    );
    assert.equal(approveExistingRes.status, 200);
    const approveExistingData = await approveExistingRes.json();
    assert.equal(approveExistingData.resident_id, approveData.resident_id, "Reuses existing master resident");

    // Close DB
    await db.close();
  },
);
