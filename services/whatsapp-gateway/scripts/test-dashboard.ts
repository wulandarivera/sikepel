import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { DashboardLogs, qrDataUrl, cleanName } from "../src/dashboard.js";
import { WhatsAppSessionManager } from "../src/session.js";
import fs from "node:fs/promises";
import path from "node:path";

test("daemon QR/status fail closed; explicit scope; logout confirmation", async () => {
  const previous = config.secret;
  const village = process.env.WA_GATEWAY_VILLAGE_ID;
  let loggedOut = 0;
  const server = createHttpServer({ getStatus: () => ({ connected: false }), getQR: () => "local-secret-qr", getDashboardStatus: () => ({ connected: false, qrDataUrl: qrDataUrl("local-secret-qr") }), logout: async () => { loggedOut++; } } as any);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    config.secret = "";
    for (const p of ["/qr", "/health", "/status", "/send"]) assert.equal((await fetch(url + p)).status, 401);
    config.secret = "test-only"; process.env.WA_GATEWAY_VILLAGE_ID = "v";
    assert.equal((await fetch(url + "/qr")).status, 401);
    const headers = { authorization: "Bearer test-only", "x-wa-village-id": "v", "content-type": "application/json" };
    assert.equal((await fetch(url + "/status", { headers: { authorization: headers.authorization } })).status, 403);
    const res = await fetch(url + "/status", { headers });
    assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match((await res.json()).qrDataUrl, /^data:image\/svg\+xml;base64,/);
    assert.equal((await fetch(url + "/logout", { method: "POST", headers, body: '{"confirm":false}' })).status, 400);
    assert.equal(loggedOut, 0);
    assert.equal((await fetch(url + "/logout", { method: "POST", headers, body: '{"confirm":true}' })).status, 200);
    assert.equal(loggedOut, 1);
  } finally {
    config.secret = previous;
    if (village === undefined) delete process.env.WA_GATEWAY_VILLAGE_ID; else process.env.WA_GATEWAY_VILLAGE_ID = village;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("logs bounded, metadata only; QR local SVG; profile emoji removed", () => {
  const logs = new DashboardLogs(); for (let i = 0; i < 150; i++) logs.add("in", "received");
  assert.equal(logs.list().length, 100); assert.equal(logs.list()[0].recipient, "[redacted]");
  const svg = Buffer.from(qrDataUrl("test")!.split(",")[1], "base64").toString();
  assert.match(svg, /<svg/); assert.ok(!svg.includes("test")); assert.ok(!svg.includes("<script"));
  assert.equal(cleanName("Operator \u{1f600}"), "Operator ");
});
test("logout invalidates old generation, timers, credentials; fresh session only", async () => {
  const previous = config.sessionDir;
  const dir = await fs.mkdtemp(path.join(process.env.TMPDIR || process.cwd(), "wa-dashboard-test-"));
  config.sessionDir = path.join(dir, "session");
  await fs.mkdir(config.sessionDir); await fs.writeFile(path.join(config.sessionDir, "creds.json"), "test-only");
  const manager = new WhatsAppSessionManager(); const internal = manager as any;
  let logout = 0, reconnect = 0, ended = 0;
  internal.sock = { end: () => { ended++; }, logout: async () => { logout++; } };
  internal.isConnected = true; internal.currentQr = "old"; internal.startedAt = new Date().toISOString();
  internal.reconnectTimer = setTimeout(() => { reconnect++; }, 20);
  internal.connect = async () => {
    reconnect++;
    assert.equal(internal.stopped, false);
    assert.deepEqual(await fs.readdir(config.sessionDir), []);
  };
  try {
    await manager.logout(); await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(logout, 1); assert.equal(ended, 1); assert.equal(reconnect, 1);
    assert.equal(internal.generation, 1); assert.equal(manager.getQR(), null);
    assert.equal(manager.getDashboardStatus().profile.startedAt, null);
    assert.equal((await fs.stat(config.sessionDir)).mode & 0o777, 0o700);
  } finally { config.sessionDir = previous; await fs.rm(dir, { recursive: true, force: true }); }
});
