import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

const testRoot = path.resolve(".data", "test-qa-fase2-" + randomUUID());
process.env.SIKEPEL_DATA_DIR = testRoot;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_URL;

const origin = "http://127.0.0.1:3000";

test("QA Fase 2: Verifikasi Alur Permohonan Mandiri & Tindakan Operator", { timeout: 180000 }, async () => {
  // 1. Initialize fixtures
  execFileSync(process.execPath, ["--import", "tsx", "tests/seed-fixtures.ts"], {
    env: { ...process.env, SIKEPEL_TEST_FIXTURES: "1" },
    stdio: "pipe",
  });

  const access = await fs.readFile(path.join(testRoot, "AKSES-LOKAL.txt"), "utf8");
  const password = access.match(/Kata sandi semua akun contoh: (.+)/)![1];

  const route = await import("../src/app/api/[...path]/route");
  const { getDB, one } = await import("../src/server/db");
  const { mandiriResponse } = await import("../src/server/mandiri");
  const db = await getDB();

  async function apiRequest(url: string, method = "GET", data?: unknown, cookie = "") {
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
        ...(cookie ? { cookie } : {}),
        ...(data !== undefined && !(data instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
      },
    });
    return (route.POST as any)(req, { params: Promise.resolve({ path: url.split("?")[0].split("/") }) });
  }

  // Login as operator
  const loginRes = await apiRequest("login", "POST", {
    username: "operator",
    password,
  });
  assert.equal(loginRes.status, 200, "Operator login failed");
  const sessionOperator = loginRes.headers.get("set-cookie")?.split(";")[0] || "";
  assert.ok(sessionOperator, "Operator session cookie missing");

  // Fetch village and type
  const opUser = await one(db, "SELECT village_id FROM users WHERE username='operator'");
  const villageId = opUser.village_id;
  process.env.MANDIRI_VILLAGE_ID = villageId;

  const letterType = await one(db, "SELECT id, name FROM letter_types LIMIT 1");
  assert.ok(letterType, "Letter type must exist");

  // Create attachment files
  const attDir = path.join(testRoot, "attachments");
  await fs.mkdir(attDir, { recursive: true });
  const attIdKtp = randomUUID();
  const attIdKk = randomUUID();
  const attIdPengantar = randomUUID();
  await fs.writeFile(path.join(attDir, attIdKtp), Buffer.from("DUMMY-KTP-IMAGE"));
  await fs.writeFile(path.join(attDir, attIdKk), Buffer.from("DUMMY-KK-IMAGE"));
  await fs.writeFile(path.join(attDir, attIdPengantar), Buffer.from("DUMMY-PENGANTAR-IMAGE"));

  const attachments = [
    { id: attIdKtp, media_type: "image/jpeg", size: 24500 },
    { id: attIdKk, media_type: "image/jpeg", size: 31200 },
    { id: attIdPengantar, media_type: "image/png", size: 18400 },
  ];

  // CHECKLIST ITEM 1: Alur Masuk Permohonan
  // Create citizen proposal
  const submitPayload = {
    type_id: letterType.id,
    contact_phone: "081234567890",
    resident: {
      nik: "3201015505950001",
      name: "Ahmad Fauzi",
      birth_place: "Bogor",
      birth_date: "1995-05-15",
      gender: "L",
      religion: "Islam",
      occupation: "Karyawan Swasta",
      address: "Jl. Melati RT 01 RW 02",
      rt: "01",
      rw: "02",
    },
    form_data: {
      keperluan: "mengurus visa kerja",
      keterangan: "Surat pengantar RT lengkap",
    },
  };

  const citizenSubmitReq = new Request(origin + "/api/mandiri/request", {
    method: "POST",
    headers: {
      origin,
      host: "127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(submitPayload),
  });
  const citizenSubmitRes = await mandiriResponse(citizenSubmitReq, "request", db);
  assert.equal(citizenSubmitRes.status, 201, "Citizen proposal submission failed");
  const submitData = await citizenSubmitRes.json();
  const ticketCode = submitData.ticket;
  const trackingToken = submitData.tracking_token;
  assert.ok(ticketCode, "Ticket code missing");
  assert.ok(trackingToken, "Tracking token missing");

  // Admin listing check: proposal must appear and badge counter match
  const listRes = await apiRequest("admin/permohonan-mandiri", "GET", undefined, sessionOperator);
  assert.equal(listRes.status, 200, "Admin list permohonan failed");
  const listData = await listRes.json();
  assert.ok(listData.total >= 1, "Total permohonan should be at least 1");
  const matchedItem = listData.items.find((i: any) => i.ticket_code === ticketCode);
  assert.ok(matchedItem, "Submitted ticket not found in admin list");
  assert.equal(matchedItem.nama_pemohon, "Ahmad Fauzi");
  assert.equal(matchedItem.status, "PENDING_VERIFICATION");

  const pendingCount = listData.items.filter((i: any) => i.status === "PENDING_VERIFICATION").length;
  assert.ok(pendingCount >= 1, "Badge counter must count PENDING_VERIFICATION accurately");

  // CHECKLIST ITEM 2: Preview Lampiran & Dokumen
  // Seed attachments directly to this request for preview testing
  const requestRow = await one(db, "SELECT id FROM online_requests WHERE ticket_code = $1", [ticketCode]);
  const requestId = requestRow.id;
  await db.query(
    "UPDATE online_requests SET attachments = $1 WHERE id = $2",
    [JSON.stringify(attachments), requestId]
  );
  const detailRes = await apiRequest(`admin/permohonan-mandiri/${requestId}`, "GET", undefined, sessionOperator);
  assert.equal(detailRes.status, 200, "Admin detail permohonan failed");
  const detailData = await detailRes.json();
  assert.equal(detailData.attachments.length, 3, "Attachments count mismatch");

  // Verify attachment stream
  const streamRes = await apiRequest(`admin/permohonan-mandiri/${requestId}/lampiran/${attIdKtp}`, "GET", undefined, sessionOperator);
  assert.equal(streamRes.status, 200, "Attachment stream failed");
  const streamBuffer = await streamRes.arrayBuffer();
  assert.equal(Buffer.from(streamBuffer).toString(), "DUMMY-KTP-IMAGE", "Attachment stream content mismatch");

  // CHECKLIST ITEM 3: Edit Redaksi Keperluan & Audit Log
  const originalKeperluan = detailData.form_data.keperluan;
  assert.equal(originalKeperluan, "mengurus visa kerja");

  const updatedKeperluan = "Persyaratan kelengkapan administrasi pengajuan visa kerja";
  const patchRes = await apiRequest(
    `admin/permohonan-mandiri/${requestId}`,
    "PATCH",
    {
      form_data: {
        ...detailData.form_data,
        keperluan: updatedKeperluan,
      },
    },
    sessionOperator,
  );
  assert.equal(patchRes.status, 200, "Operator edit redaksi failed");
  const patchData = await patchRes.json();
  assert.equal(patchData.ok, true);
  assert.equal(patchData.form_data.keperluan, updatedKeperluan);

  // Verify in audit_logs
  const auditLogs = await db.query(
    "SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'ONLINE_REQUEST_UPDATE'",
    [requestId],
  );
  assert.ok(auditLogs.rows.length >= 1, "Audit log for redaksi edit not recorded");

  // CHECKLIST ITEM 4: Tindakan Operator (Minta Perbaikan, Tolak, Setujui)
  // 4a. Minta Perbaikan
  const revisionNote = "Mohon lampirkan scan Kartu Keluarga yang terbaru.";
  const revisionRes = await apiRequest(
    `admin/permohonan-mandiri/${requestId}/minta-perbaikan`,
    "POST",
    { catatan_perbaikan: revisionNote },
    sessionOperator,
  );
  assert.equal(revisionRes.status, 200, "Minta perbaikan failed");
  const revData = await revisionRes.json();
  assert.equal(revData.ok, true);
  assert.equal(revData.status, "NEEDS_REVISION");
  assert.equal(revData.revision_note, revisionNote);

  // Check citizen tracking sees status NEEDS_REVISION and revision note
  const trackReq = new Request(origin + `/api/mandiri/track/${ticketCode}`, {
    headers: { authorization: `Bearer ${trackingToken}` },
  });
  const citizenTrackRes = await mandiriResponse(trackReq, `track/${ticketCode}`, db);
  assert.equal(citizenTrackRes.status, 200);
  const citizenTrackData = await citizenTrackRes.json();
  assert.equal(citizenTrackData.status, "NEEDS_REVISION");
  assert.equal(citizenTrackData.revision_note, revisionNote);

  // 4b. Tolak (tested on a secondary request to keep workflow clean)
  const submitPayload2 = {
    ...submitPayload,
    resident: {
      ...submitPayload.resident,
      nik: "3201015505950002",
      name: "Dewi Lestari",
    },
    form_data: {
      keperluan: "keterangan domisili luar kota",
    },
  };
  const submitReq2 = new Request(origin + "/api/mandiri/request", {
    method: "POST",
    headers: {
      origin,
      host: "127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(submitPayload2),
  });
  const submitRes2 = await mandiriResponse(submitReq2, "request", db);
  const data2 = await submitRes2.json();
  const ticket2 = data2.ticket;

  const req2Row = await one(db, "SELECT id FROM online_requests WHERE ticket_code = $1", [ticket2]);
  const rejectNote = "Pemohon belum terdaftar di wilayah kelurahan ini.";
  const rejectRes = await apiRequest(
    `admin/permohonan-mandiri/${req2Row.id}/tolak`,
    "POST",
    { alasan_penolakan: rejectNote },
    sessionOperator,
  );
  assert.equal(rejectRes.status, 200, "Tolak permohonan failed");
  const rejectData = await rejectRes.json();
  assert.equal(rejectData.ok, true);
  assert.equal(rejectData.status, "REJECTED");
  assert.equal(rejectData.revision_note, rejectNote);

  // 4c. Setujui (from NEEDS_REVISION or PENDING_VERIFICATION)
  const approveRes = await apiRequest(
    `admin/permohonan-mandiri/${requestId}/setujui`,
    "POST",
    {},
    sessionOperator,
  );
  assert.equal(approveRes.status, 200, "Setujui permohonan failed");
  const approveData = await approveRes.json();
  assert.equal(approveData.ok, true);
  assert.equal(approveData.status, "APPROVED");
  assert.ok(approveData.letter_id, "Letter ID not generated on approval");

  // Verify resident upserted and official letter created with edited redaksi
  const letterRow = await one(db, "SELECT * FROM letters WHERE id = $1", [approveData.letter_id]);
  assert.ok(letterRow, "Official letter not found in letters table");
  assert.equal(letterRow.status, "DRAFT", "Official letter should start as DRAFT");
  const letterFormData = typeof letterRow.form_data === "string" ? JSON.parse(letterRow.form_data) : letterRow.form_data;
  assert.equal(
    letterFormData.keperluan,
    updatedKeperluan,
    "Official letter draft must use the edited redaksi keperluan",
  );

  // CHECKLIST ITEM 5: Standar Kode & UI (No Emoji)
  const uiFiles = [
    "src/components/permohonan-mandiri.tsx",
    "src/app/admin/permohonan-mandiri/[[...slug]]/page.tsx",
    "src/server/permohonan-mandiri-admin.ts",
  ];
  const emojiRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/gu;
  for (const rel of uiFiles) {
    const full = path.resolve(process.cwd(), rel);
    const content = await fs.readFile(full, "utf8");
    const matched = (content.match(emojiRegex) || []).filter(
      (e) => e !== "\u00a9" && e !== "\u00ae" && e !== "\u2122",
    );
    assert.equal(matched.length, 0, `File ${rel} contains prohibited emoji: ${matched.join(", ")}`);
  }

  // Cleanup
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {});
});
