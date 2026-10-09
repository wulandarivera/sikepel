import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { waAccess, cleanWaText } from "../src/lib/wa-dashboard";

test("WA host routes only dashboard, login, exact APIs and required assets", () => {
  const request = (path: string) => proxy(new NextRequest(`https://wa.sikepel.biz.id${path}`));
  assert.ok(request("/").headers.get("x-middleware-rewrite")?.endsWith("/wa"));
  assert.ok(request("/login").headers.get("x-middleware-rewrite")?.endsWith("/wa/login"));
  assert.ok(request("/app/dashboard").headers.get("location")?.endsWith("/wa"));
  for (const path of ["/wa", "/wa/login", "/api/login", "/api/wa/status", "/api/wa/send", "/api/wa/logout", "/assets/icon.webp"]) assert.notEqual(request(path).status, 404);
  for (const path of ["/setup", "/api/users", "/api/wa/unknown", "/wa/other", "/assets/private", "/mandiri", "/_next/image?url=%2Fapi%2Fusers&w=64&q=75"]) assert.equal(request(path).status, 404);
});
test("WA access requires permitted role and exact configured village", () => {
  assert.equal(waAccess(null, "v"), false);
  for (const role of ["OPERATOR", "ADMIN", "SUPER_ADMIN"]) assert.equal(waAccess({role, village_id:"v"}, "v"), true);
  for (const user of [{role:"PIMPINAN",village_id:"v"},{role:"SUPER_ADMIN",village_id:null},{role:"ADMIN",village_id:"other"}]) assert.equal(waAccess(user,"v"),false);
  assert.equal(waAccess({role:"ADMIN",village_id:"v"},undefined),false);
});
test("external display strings cannot introduce emoji", () => {
  assert.equal(cleanWaText("Operator \u{1f600}"), "Operator ");
});
