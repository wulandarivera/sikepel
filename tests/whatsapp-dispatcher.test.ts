import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DB } from "../src/server/db";
import { migrateMandiri } from "../src/server/mandiri-schema";
import {
  formatWhatsAppMessage,
  dispatchWhatsAppNotification,
  notifyPermohonanStatus,
  type PermohonanNotificationPayload,
} from "../src/server/whatsapp";
import {
  mandiriResidentSchema,
  mandiriSubmissionSchema,
  createPermohonanMandiri,
} from "../src/server/mandiri";

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

function assertNoEmoji(text: string, context: string) {
  assert.ok(
    !EMOJI_REGEX.test(text),
    `Terdeteksi emoji pada ${context}: "${text}"`,
  );
}

test("formatWhatsAppMessage: private-safe statuses with next action",()=>{
 for(const status of ['SUBMITTED','APPROVED','COMPLETED','SIAP_DIAMBIL','NEEDS_REVISION','REJECTED'] as const){
 const msg=formatWhatsAppMessage({to:'081234567890',ticket:'TIK-202610-A1B2C3D4',status,type_name:'Private type',resident_name:'Private name',note:'Private note'});
 assertNoEmoji(msg,status);assert.match(msg,/TIK-202610-A1B2C3D4/);assert.match(msg,/lacak/);assert.doesNotMatch(msg,/Private|KTP elektronik asli/);
 }
});

test("WhatsApp Dispatcher: pengiriman ke endpoint gateway lokal berhasil", async () => {
  let receivedBody: any = null;
  let receivedAuth: string | undefined = undefined;

  const mockGateway = http.createServer((req, res) => {
    receivedAuth = req.headers["authorization"];
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      receivedBody = JSON.parse(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, recipient: "6281234567890@s.whatsapp.net" }));
    });
  });

  await new Promise<void>((resolve) => mockGateway.listen(0, "127.0.0.1", () => resolve()));
  const port = (mockGateway.address() as any).port;

  const originalUrl = process.env.WA_GATEWAY_URL;
  const originalSecret = process.env.WA_GATEWAY_SECRET;

  process.env.WA_GATEWAY_URL = `http://127.0.0.1:${port}`;
  process.env.WA_GATEWAY_SECRET = "test-secret-token";

  try {
    const result = await notifyPermohonanStatus({
      to: "081234567890",
      ticket: "TIK-202610-88889999",
      status: "APPROVED",
      type_name: "Surat Keterangan Usaha",
      resident_name: "Budi Santoso",
    });

    assert.equal(result.ok, true);
    assert.ok(receivedBody);
    assert.equal(receivedBody.ticket, "TIK-202610-88889999");
    assert.equal(receivedBody.status, "APPROVED");
    assert.equal(receivedAuth, "Bearer test-secret-token");
  } finally {
    mockGateway.close();
    process.env.WA_GATEWAY_URL = originalUrl;
    process.env.WA_GATEWAY_SECRET = originalSecret;
  }
});

test("WhatsApp Dispatcher: gateway offline tidak melempar eksepsi (graceful non-blocking)", async () => {
  const originalUrl = process.env.WA_GATEWAY_URL;
  process.env.WA_GATEWAY_URL = "http://127.0.0.1:49999"; // port non-existent

  try {
    const result = await notifyPermohonanStatus({
      to: "081234567890",
      ticket: "TIK-202610-77777777",
      status: "APPROVED",
      type_name: "Surat Keterangan Usaha",
    });

    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    process.env.WA_GATEWAY_URL = originalUrl;
  }
});

test("mandiriResidentSchema: memvalidasi seluruh data warga sebagai wajib", () => {
  const completeResident = {
    nik: "3201010101010001",
    name: "Ahmad Subarjo",
    birth_date: "1990-01-01",
    birth_place: "Tangerang",
    gender: "Laki-laki",
    religion: "Islam",
    marital_status: "Kawin",
    occupation: "Karyawan Swasta",
    address: "Jl. Veteran No. 1",
    rt: "001",
    rw: "002",
  };

  // Valid complete resident data
  const parsed = mandiriResidentSchema.safeParse(completeResident);
  assert.ok(parsed.success, "Data warga lengkap harus valid");

  // Setiap field berikut harus WAJIB (missing / empty string gagal)
  const requiredFields = [
    "nik",
    "name",
    "birth_date",
    "birth_place",
    "gender",
    "religion",
    "occupation",
    "address",
    "rt",
    "rw",
  ] as const;

  for (const field of requiredFields) {
    const omitted: any = { ...completeResident };
    delete omitted[field];
    const resOmitted = mandiriResidentSchema.safeParse(omitted);
    assert.equal(
      resOmitted.success,
      false,
      `Field ${field} harus wajib (omitted tidak boleh lolos)`,
    );

    const emptyVal: any = { ...completeResident, [field]: "" };
    const resEmpty = mandiriResidentSchema.safeParse(emptyVal);
    assert.equal(
      resEmpty.success,
      false,
      `Field ${field} harus wajib (empty string tidak boleh lolos)`,
    );

    const whitespaceVal: any = { ...completeResident, [field]: "   " };
    const resWhitespace = mandiriResidentSchema.safeParse(whitespaceVal);
    assert.equal(
      resWhitespace.success,
      false,
      `Field ${field} harus wajib (whitespace tidak boleh lolos)`,
    );
  }
});

test("createPermohonanMandiri: auto-dispatch WhatsApp notifikasi saat permohonan berhasil diajukan", async () => {
  const root = path.resolve(".data", "test-mandiri-notif-" + randomUUID());
  process.env.SIKEPEL_DATA_DIR = root;

  // Siapkan mock gateway server
  const receivedRequests: any[] = [];
  const mockPort = 3899;
  const mockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      receivedRequests.push({
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: body ? JSON.parse(body) : null,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => mockServer.listen(mockPort, resolve));
  process.env.WA_GATEWAY_URL = `http://127.0.0.1:${mockPort}`;
  process.env.WA_GATEWAY_SECRET = "test-secret-123";

  const pg = new PGlite();
  await pg.waitReady;
  const wrap = (client: any): DB => ({
    query: (s, p) => client.query(s, p),
    exec: (s) => client.exec(s),
    close: () => pg.close(),
    transaction: (fn) => client.transaction((tx: any) => fn(wrap(tx))),
  });
  const db = wrap(pg);

  const village = randomUUID();
  const type = randomUUID();

  try {
    await db.exec(await fs.readFile("migrations/001_core.sql", "utf8"));
    await migrateMandiri(db);
    await db.query("INSERT INTO villages(id,name,code) VALUES($1,'Cibodas','CBD')", [
      village,
    ]);
    await db.query(
      "INSERT INTO letter_types(id,name,code,slug,category,fields) VALUES($1,'Surat Keterangan Usaha','SKU','sku','umum','[]')",
      [type],
    );

    const submissionData = {
      type_id: type,
      resident: {
        nik: "3201010101010001",
        name: "Budi Santoso",
        birth_date: "1990-01-01",
        birth_place: "Tangerang",
        gender: "Laki-laki",
        religion: "Islam",
        marital_status: "Kawin",
        occupation: "Wiraswasta",
        address: "Jl. Merdeka No. 10",
        rt: "001",
        rw: "002",
      },
      contact_phone: "081234567890",
      form_data: { keperluan: "Kredit Usaha Rakyat" },
    };

    const result = await createPermohonanMandiri(db, village, submissionData);
    assert.match(result.ticket, /^TIK-\d{6}-[A-F0-9]{8}$/);
    assert.equal(result.status, "PENDING_VERIFICATION");

    // Pastikan gateway menerima request dispatch notifikasi WhatsApp
    assert.equal(receivedRequests.length, 1, "Harus mendispatch 1 notifikasi WA");
    const dispatched = receivedRequests[0];
    assert.equal(dispatched.url, "/notify");
    assert.equal(dispatched.headers["authorization"], "Bearer test-secret-123");
    assert.equal(dispatched.body.to, "081234567890");
    assert.equal(dispatched.body.status, "SUBMITTED");
    assert.equal(dispatched.body.ticket, result.ticket);
    assert.equal(dispatched.body.type_name, "Permohonan surat");
    assert.equal(dispatched.body.resident_name, undefined);
    assert.equal(dispatched.body.note, undefined);
    assert.equal(dispatched.body.message, undefined);
  } finally {
    mockServer.close();
    await db.close();
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    delete process.env.WA_GATEWAY_URL;
    delete process.env.WA_GATEWAY_SECRET;
  }
});
