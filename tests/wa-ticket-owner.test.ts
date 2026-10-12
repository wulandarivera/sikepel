import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { DB } from "../src/server/db";
import { getTicketStatusForBot } from "../src/server/whatsapp";

// Cast allows the proposed contract to run against the old two-argument API.
// Phone matching grants minimal status, never identity verification/autofill.
const lookup = getTicketStatusForBot as unknown as (
  db: DB, ticket: string, senderPhone: string, villageId: string,
) => Promise<{ ticket_code: string; status: string } | null>;
const ticket = "TIK-202610-ABCD1234";
const village = "11111111-1111-4111-8111-111111111111";
const otherVillage = "22222222-2222-4222-8222-222222222222";

async function withFixture(check: (db: DB) => Promise<void>) {
  // In-memory only: no getDB, migration, environment, HTTP or WhatsApp calls.
  const pg = new PGlite();
  await pg.waitReady;
  const db = { query: (sql: string, params?: any[]) => pg.query(sql, params) } as unknown as DB;
  try {
    await pg.exec(`
      CREATE TABLE letter_types (id uuid PRIMARY KEY, name text);
      CREATE TABLE online_requests (
        ticket_code text PRIMARY KEY, status text, contact_phone text,
        village_id uuid, type_id uuid, revision_note text,
        created_at timestamptz, verified_at timestamptz, form_data jsonb
      );
    `);
    const type = "33333333-3333-4333-8333-333333333333";
    await pg.query("INSERT INTO letter_types VALUES ($1,$2)", [type, "PRIVATE_TYPE_FIXTURE"]);
    await pg.query("INSERT INTO online_requests VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      ticket, "APPROVED", "081234567890", village, type, "PRIVATE_NOTE_FIXTURE",
      "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z",
      JSON.stringify({ resident: { name: "PRIVATE_NAME_FIXTURE", nik: "0000000000000000", birth_date: "1990-01-01" } }),
    ]);
    await check(db);
  } finally {
    await pg.close();
  }
}

test("owner-bound status returns only ticket_code and status", async () => {
  await withFixture(async (db) => {
    assert.deepEqual(await lookup(db, ticket.toLowerCase(), "6281234567890", village),
      { ticket_code: ticket, status: "APPROVED" });
  });
});

test("ticket knowledge does not grant another sender status access", async () => {
  await withFixture(async (db) => {
    assert.equal(await lookup(db, ticket, "6289999999999", village), null);
  });
});

test("matching sender does not grant another village status access", async () => {
  await withFixture(async (db) => {
    assert.equal(await lookup(db, ticket, "6281234567890", otherVillage), null);
  });
});

// Transport authorization needs separate evidence: placement before session auth
// does not establish unauthenticated access when a gateway secret guard exists.
