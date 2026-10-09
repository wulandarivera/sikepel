import { test } from "node:test";
import assert from "node:assert/strict";
import { createWaDashboard, waDashboard } from "./wa-dashboard";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hashToken } from "./security";
import type { DB } from "./db";
import type { User } from "../lib/types";
const user: User = { id: "u", username: "op", name: "Operator", role: "OPERATOR", village_id: "v" };
function setup(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const handler = createWaDashboard({
    session: async (token) => token === "valid" ? user : null,
    config: () => ({ village: "v", url: "http://127.0.0.1:3001", secret: "private" }),
    audit: async (_u, action) => { calls.push(action); },
    fetch: async (_url, init) => {
      calls.push(String(init?.method));
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer private");
      return Response.json({ connected: false, hasQr: false, qrDataUrl: null, profile: { phone: null, name: null, startedAt: null }, logs: [], ok: true });
    }, ...overrides,
  });
  return { handler, calls };
}
function req(action = "status", body?: unknown, origin = "http://localhost") {
  return new Request(`http://localhost/api/wa/${action}`, { method: body === undefined ? "GET" : "POST", headers: { cookie: "sikepel_session=valid", origin, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test("status contract, cookie auth, no-store, daemon secret server-only", async () => {
  const { handler } = setup();
  const res = await handler(req(), "status");
  assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { connected: false, hasQr: false, qrDataUrl: null, profile: { phone: null, name: null, startedAt: null }, logs: [] });
  assert.equal((await handler(new Request("http://localhost/api/wa/status", { headers: { authorization: "Bearer valid" } }), "status")).status, 401);
});
test("scope and role isolation fail before contacting daemon", async () => {
  for (const u of [{ ...user, village_id: "other" }, { ...user, role: "PIMPINAN" }, { ...user, role: "SUPER_ADMIN", village_id: null }]) {
    const { handler, calls } = setup({ session: async () => u });
    assert.equal((await handler(req(), "status")).status, 403); assert.deepEqual(calls, []);
  }
  const { handler } = setup({ config: () => ({ village: "", url: "http://localhost", secret: "" }) });
  assert.equal((await handler(req(), "status")).status, 503);
});
test("POST CSRF, validation, confirmation and audit", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(req("send", { to: "081234567890", text: "Halo" }, "https://evil.test"), "send")).status, 403);
  assert.equal((await handler(req("send", { to: "bad", text: "Halo" }), "send")).status, 400);
  assert.equal((await handler(req("send", { to: "081234567890", text: "Halo \u{1f600}" }), "send")).status, 400);
  assert.equal((await handler(req("logout", { confirm: false }), "logout")).status, 400);
  assert.deepEqual(calls, []);
  assert.equal((await handler(req("send", { to: "081234567890", text: "Halo" }), "send")).status, 200);
  assert.deepEqual(calls, ["WA_SEND_REQUESTED", "POST", "WA_SEND_COMPLETED"]);
});
test("real session query rejects expired/disabled users; SUPER_ADMIN scope; audit persisted", async () => {
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(await fs.readFile("migrations/001_core.sql", "utf8"));
  const db: DB = { query: (sql, params) => pg.query(sql, params), exec: (sql) => pg.exec(sql), close: () => pg.close(), transaction: async (fn) => fn(db) };
  const globals = globalThis as typeof globalThis & { sikepelDB?: Promise<DB> };
  const oldDB = globals.sikepelDB, oldFetch = globalThis.fetch;
  const oldEnv = { village: process.env.WA_GATEWAY_VILLAGE_ID, secret: process.env.WA_GATEWAY_SECRET };
  const village = randomUUID(), other = randomUUID(), admin = randomUUID(), op = randomUUID();
  await pg.query("INSERT INTO villages(id,name,code) VALUES($1,'V','V'),($2,'Other','O')", [village, other]);
  await pg.query("INSERT INTO users(id,village_id,name,username,password_hash,role) VALUES($1,$2,'Operator','operator','unused','OPERATOR'),($3,NULL,'Admin','admin','unused','SUPER_ADMIN')", [op, village, admin]);
  for (const [token, id, scope, expired] of [["valid", op, null, false], ["expired", op, null, true], ["admin-none", admin, null, false], ["admin-other", admin, other, false], ["admin-valid", admin, village, false]] as const) {
    await pg.query("INSERT INTO sessions(token_hash,user_id,scope_id,expires_at) VALUES($1,$2,$3,now()+$4::interval)", [hashToken(token), id, scope, expired ? "-1 hour" : "1 hour"]);
  }
  globals.sikepelDB = Promise.resolve(db); process.env.WA_GATEWAY_VILLAGE_ID = village; process.env.WA_GATEWAY_SECRET = "test-only";
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ ok: true }); };
  const request = (token: string) => new Request("http://localhost/api/wa/send", { method: "POST", headers: { origin: "http://localhost", cookie: `sikepel_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ to: "081234567890", text: "Halo" }) });
  try {
    assert.equal((await waDashboard(request("expired"), "send")).status, 401);
    assert.equal((await waDashboard(request("admin-none"), "send")).status, 403);
    assert.equal((await waDashboard(request("admin-other"), "send")).status, 403);
    assert.equal(calls, 0);
    assert.equal((await waDashboard(request("valid"), "send")).status, 200);
    assert.equal((await waDashboard(request("admin-valid"), "send")).status, 200);
    const rows = (await pg.query("SELECT village_id,action,metadata FROM audit_logs ORDER BY action")).rows as any[];
    assert.equal(rows.length, 4); assert.ok(rows.every((r) => r.village_id === village && JSON.stringify(r.metadata) === "{}"));
    await pg.query("UPDATE users SET active=false WHERE id=$1", [op]);
    assert.equal((await waDashboard(request("valid"), "send")).status, 401);
    await pg.query("UPDATE villages SET active=false WHERE id=$1", [village]);
    assert.equal((await waDashboard(request("valid"), "send")).status, 401);
  } finally {
    globals.sikepelDB = oldDB; globalThis.fetch = oldFetch;
    for (const [key, value] of [["WA_GATEWAY_VILLAGE_ID", oldEnv.village], ["WA_GATEWAY_SECRET", oldEnv.secret]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
    await pg.close();
  }
});
test("rate limit bounded by user, generic daemon failure", async () => {
  const { handler } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await handler(req("logout", { confirm: true }), "logout")).status, 200);
  assert.equal((await handler(req("logout", { confirm: true }), "logout")).status, 429);
  const failing = setup({ fetch: async () => { throw new Error("private credential"); } });
  const res = await failing.handler(req(), "status");
  assert.equal(res.status, 503); assert.ok(!(await res.text()).includes("credential"));
});
