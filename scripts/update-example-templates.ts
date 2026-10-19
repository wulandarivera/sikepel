import fs from "node:fs/promises";
import { createExampleTemplate } from "../src/server/documents";
async function main() {
  const base = "http://127.0.0.1:3000";
  const access = await fs.readFile(".data/AKSES-LOKAL.txt", "utf8");
  const password = access.match(/Kata sandi semua akun contoh: (.+)/)![1];
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
  });
  if (!login.ok) throw new Error("Login lokal gagal");
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const boot = await (
    await fetch(base + "/api/bootstrap", { headers: { cookie } })
  ).json();
  if (!boot.local) throw new Error("Hanya untuk instalasi lokal.");
  for (const type of boot.types) {
    const bytes = await createExampleTemplate(type);
    const form = new FormData();
    form.set("type_id", type.id);
    form.set(
      "file",
      new File([new Uint8Array(bytes)], type.slug + "-contoh.docx"),
    );
    const upload = await fetch(base + "/api/templates", {
      method: "POST",
      headers: { cookie, origin: base },
      body: form,
    });
    if (!upload.ok) throw new Error(await upload.text());
    const result = await upload.json();
    const active = await fetch(
      base + "/api/templates/" + result.id + "/activate",
      {
        method: "POST",
        headers: { cookie, origin: base, "content-type": "application/json" },
        body: "{}",
      },
    );
    if (!active.ok) throw new Error(await active.text());
    console.log(type.name + ": versi " + result.version + " aktif.");
  }
  await fetch(base + "/api/logout", {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: "{}",
  });
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
