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
if (!login.ok) throw new Error("Login admin lokal gagal");
const cookie = login.headers.get("set-cookie").split(";")[0];
async function api(path, method = "GET", body) {
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: {
      cookie,
      origin: base,
      ...(body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Permintaan gagal");
  return result;
}
try {
  const boot = await api("bootstrap");
  assert.equal(boot.local, true);
  const fields = JSON.parse(await fs.readFile("templates/suami-istri.fields.json", "utf8"));
  const bytes = await fs.readFile("templates/suami-istri.docx");
  const validation = JSON.parse(await fs.readFile(".data/template-suami-istri/validation.json", "utf8"));
  assert.deepEqual(validation.errors, []);
  let type = boot.types.find((item) => item.slug === "suami-istri");
  if (type?.template_id) {
    console.log("Jenis surat Suami Istri sudah memiliki template aktif; dipertahankan.");
  } else {
    if (!type) {
      const created = await api("types", "POST", {
        name: "Surat Keterangan Suami Istri",
        code: "470",
        slug: "suami-istri",
        category: "Kependudukan",
        description: "Keterangan pasangan suami istri yang menikah secara agama, sesuai template kelurahan.",
        active: false,
        fields,
      });
      type = (await api("bootstrap")).types.find((item) => item.id === created.id);
    }
    assert.ok(type);
    const form = new FormData();
    form.set("type_id", type.id);
    form.set("file", new File([bytes], "Keterangan Suami Istri.docx"));
    const uploaded = await api("templates", "POST", form);
    assert.deepEqual(uploaded.errors, []);
    await api("templates/" + uploaded.id + "/activate", "POST", {});
    await api("types/" + type.id, "PATCH", { ...type, fields, active: true });
    const updated = (await api("bootstrap")).types.find((item) => item.id === type.id);
    assert.equal(updated.template_id, uploaded.id);
    assert.equal(updated.active, true);
    assert.deepEqual(updated.fields, fields);
    await fs.writeFile(".data/template-suami-istri/installed.json", JSON.stringify({
      type_id: type.id, template_id: uploaded.id, version: uploaded.version,
      installed_at: new Date().toISOString(),
    }, null, 2));
    console.log("PASS jenis surat baru Suami Istri dan template versi " + uploaded.version + " aktif.");
  }
} finally {
  await api("logout", "POST", {});
}


