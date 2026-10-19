import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(/Kata sandi semua akun contoh: (.+)/)[1];
const login = await fetch(base + "/api/login", {
  method: "POST", headers: { origin: base, "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password }),
});
assert.ok(login.ok, "Login admin lokal gagal");
const cookie = login.headers.get("set-cookie").split(";")[0];
async function api(route, method = "GET", body) {
  const response = await fetch(base + "/api/" + route, {
    method, headers: { cookie, origin: base, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.ok(response.ok, result.error || "Permintaan gagal");
  return result;
}
try {
  const boot = await api("bootstrap");
  assert.equal(boot.local, true);
  const type = boot.types.find(t => t.slug === "tidak-mampu");
  assert.ok(type);
  const field = JSON.parse(await fs.readFile("templates/tidak-mampu.fields.json", "utf8")).find(f => f.key === "desil");
  assert.ok(type.fields.some(f => f.key === "desil"));
  await api("types/" + type.id, "PATCH", { ...type, fields: type.fields.map(f => f.key === "desil" ? field : f) });
  const updated = (await api("bootstrap")).types.find(t => t.id === type.id);
  assert.deepEqual(updated.fields.find(f => f.key === "desil"), field);
  assert.equal(updated.template_id, type.template_id);
  console.log("PASS dropdown desil aktif dengan enam pilihan; versi template dipertahankan.");
} finally {
  await api("logout", "POST", {});
}
