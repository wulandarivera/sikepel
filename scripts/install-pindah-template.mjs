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
  let type = boot.types.find((t) => t.slug === "pindah");
  const fields = JSON.parse(
    await fs.readFile("templates/pindah.fields.json", "utf8"),
  );
  if (!type) {
    const created = await api("types", "POST", {
      name: "Surat Pindah", slug: "pindah", code: "470", category: "Kependudukan",
      description: "Formulir F-1.03 untuk perpindahan penduduk dalam negeri beserta daftar keluarga yang pindah.",
      fields, active: false,
    });
    type = (await api("bootstrap")).types.find(t => t.id === created.id);
  }
  assert.ok(type);
  const bytes = await fs.readFile("templates/pindah.docx");
  const templates = (await api("templates")).items;
  const current = templates.find((t) => t.id === type.template_id);
  const validation = JSON.parse(
    await fs.readFile(".data/template-pindah/validation.json", "utf8"),
  );
  assert.deepEqual(validation.errors, []);
  await fs.writeFile(
    ".data/template-pindah/pre-install.json",
    JSON.stringify(
      { type, templates: templates.filter((t) => t.type_id === type.id) },
      null,
      2,
    ),
  );
  await api("types/" + type.id, "PATCH", {
    ...type,
    fields,
    description:
      "Formulir F-1.03 untuk perpindahan penduduk dalam negeri beserta daftar keluarga yang pindah.",
  });
  try {
    const form = new FormData();
    form.set("type_id", type.id);
    form.set("file", new File([bytes], "Pindah.docx"));
    const uploaded = await api("templates", "POST", form);
    assert.deepEqual(uploaded.errors, []);
    await api("templates/" + uploaded.id + "/activate", "POST", {});
    await api("types/" + type.id, "PATCH", { ...type, fields, active: true, description: "Formulir F-1.03 untuk perpindahan penduduk dalam negeri beserta daftar keluarga yang pindah." });
    const updated = (await api("bootstrap")).types.find(
      (t) => t.id === type.id,
    );
    assert.equal(updated.template_id, uploaded.id);
    assert.deepEqual(updated.fields, fields);
    await fs.writeFile(
      ".data/template-pindah/installed.json",
      JSON.stringify(
        {
          type_id: type.id,
          template_id: uploaded.id,
          version: uploaded.version,
          installed_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(
      "Template Pindah versi " +
        uploaded.version +
        " aktif; formulir layanan Pindah tersimpan.",
    );
  } catch (error) {
    await api("types/" + type.id, "PATCH", type);
    if (current) await api("templates/" + current.id + "/activate", "POST", {});
    throw error;
  }
} finally {
  await api("logout", "POST", {});
}

