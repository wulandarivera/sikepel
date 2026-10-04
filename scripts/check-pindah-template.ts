import fs from "node:fs/promises";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { validateTemplate, snapshotValues, mergeDOCX } from "../src/server/documents";
import { validateFields, validatePindah } from "../src/server/validation";
async function main() {
  const fields = JSON.parse(await fs.readFile("templates/pindah.fields.json", "utf8"));
  const bytes = await fs.readFile("templates/pindah.docx");
  const validation = validateTemplate(bytes, fields, "pindah");
  assert.deepEqual(validation.errors, []);
  const form: Record<string, any> = {
    alamat_pindah: "Jl. Anggrek No. 25", rt_pindah: "005", rw_pindah: "002",
    kel_pindah: "Cibodas Baru", kec_pindah: "Cibodas", kota_pindah: "Kota Tangerang", provinsi_pindah: "Banten", pos_pindah: "15138",
    nomor_handphone: "081234567890", email: "contoh@example.com", catatan: "CATATAN INTERNAL",
    anggota_pindah: [{ nik: "0000000000000001", nama: "Ahmad Maulana", shdk: "Kepala Keluarga" }, { nik: "0000000000000002", nama: "Siti Aminah", shdk: "Istri" }],
  };
  for (const f of fields) if (f.type === "select") form[f.key] = f.options[1];
  validateFields(fields, form); validatePindah(form);
  for (const f of fields.filter((f: any) => f.required)) assert.throws(() => validateFields(fields, { ...form, [f.key]: "" }));
  for (const patch of [{ pos_pindah: "123" }, { rt_pindah: "x" }, { anggota_pindah: [] }, { anggota_pindah: [form.anggota_pindah[0], form.anggota_pindah[0]] }, { anggota_pindah: [{ nik: "123", nama: "", shdk: "" }] }]) assert.throws(() => validatePindah({ ...form, ...patch }));
  const snapshot = { date: "2026-09-14", type: { slug: "pindah", fields },
    resident: { name: "Ahmad Maulana", nik: "0000000000000001", no_kk: "0000000000000010", birth_date: "1985-03-12", address: "Jl. Melati No. 12", rt: "003", rw: "001" },
    village: { name: "Cibodas", district: "Cibodas", city: "Kota Tangerang", province: "Banten", postal_code: "15138" },
    official: { name: "NAMA PEJABAT ARSIP", title: "Lurah Cibodas", nip: "000000000000000001" },
  };
  for (const count of [1, 2, 6]) {
    const form_data = { ...form, anggota_pindah: Array.from({length:count}, (_,i) => form.anggota_pindah[i] ?? { nik: String(i+1).padStart(16,"0"), nama: `Anggota Contoh ${i+1}`, shdk: "Anak" }), ...(count === 1 ? { nomor_handphone: "", email: "" } : {}) };
    validatePindah(form_data);
    const values = snapshotValues({ ...snapshot, form_data }, "472/001/IX/2026");
    const merged = mergeDOCX(bytes, values);
    const xml = new PizZip(merged).file("word/document.xml")!.asText();
    const text = xml.replace(/<[^>]+>/g, "");
    for (const str of ["FORMULIR PENDAFTARAN PERPINDAHAN PENDUDUK", "AHMAD MAULANA", "0000000000000010", "JL. ANGGREK NO. 25", "14 September 2026"]) assert.ok(text.includes(str), str);
    assert.equal((text.match(/KEPALA KELUARGA/g) || []).length, 1);
    if (count > 1) assert.ok(text.includes("SITI AMINAH"));
    if (count > 2) assert.ok(text.includes(`ANGGOTA CONTOH ${count}`));
    for (const f of fields.filter((f: any) => f.type === "select")) assert.equal(values[f.key as keyof typeof values], "2");
    for (const str of ["{", "}", "MERGEFIELD", "CATATAN INTERNAL", "472/001/IX/2026", "NAMA PEJABAT ARSIP"]) assert.ok(!text.includes(str), str);
    await fs.writeFile(`.data/template-pindah/sample-${count}.docx`, merged);
  }
  await fs.writeFile(".data/template-pindah/validation.json", JSON.stringify(validation,null,2));
  console.log("PASS F1.03 identity, choice codes, repeat family rows, required fields, duplicate/invalid NIK, optional contacts and no added official number/signature.");
}
main().catch(e => { console.error(e); process.exitCode=1; });
