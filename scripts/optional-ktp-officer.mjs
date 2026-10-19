import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const password = (await fs.readFile(".data/AKSES-LOKAL.txt", "utf8")).match(
  /Kata sandi semua akun contoh: (.+)/,
)[1];
const login = await fetch(base + "/api/login", {
  method: "POST",
  headers: { origin: base, "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password }),
});
assert.ok(login.ok, "Login admin lokal gagal");
const cookie = login.headers.get("set-cookie").split(";")[0];
async function api(path, method = "GET", body) {
  const response = await fetch(base + "/api/" + path, {
    method,
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.ok(response.ok, result.error || "Permintaan gagal");
  return result;
}
try {
  const boot = await api("bootstrap");
  assert.equal(boot.local, true);
  const type = boot.types.find((item) => item.slug === "ktp");
  assert.ok(type?.fields.some((field) => field.key === "nama_petugas"));
  const fields = type.fields.map((field) => field.key === "nama_petugas"
    ? { ...field, label: "Nama petugas (opsional)", required: false }
    : field);
  await api("types/" + type.id, "PATCH", { ...type, fields });
  const updated = (await api("bootstrap")).types.find((item) => item.id === type.id);
  assert.deepEqual(updated.fields, fields);
  assert.equal(updated.template_id, type.template_id);
  console.log("PASS nama petugas opsional; template aktif tetap sama.");
} finally {
  await api("logout", "POST", {});
}
