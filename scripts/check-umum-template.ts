import fs from "node:fs/promises";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { validateTemplate, snapshotValues, mergeDOCX } from "../src/server/documents";
import { validateFields } from "../src/server/validation";

async function main() {
  const fields = JSON.parse(await fs.readFile("templates/umum.fields.json", "utf8"));
  const template = await fs.readFile("templates/umum.docx");
  const validation = validateTemplate(template, fields, "umum");
  assert.deepEqual(validation.errors, []);
  const form = {
    negara: "Indonesia",
    keperluan: "Melengkapi persyaratan administrasi pendaftaran pekerjaan",
    jabatan_detail: "", catatan: "CATATAN INTERNAL",
  };
  validateFields(fields, form);
  for (const f of fields.filter((f: {required: boolean}) => f.required)) {
    assert.throws(() => validateFields(fields, { ...form, [f.key]: "" }));
  }
  const snapshot = {
    date: "2026-09-14", type: { slug: "umum", fields },
    resident: { name: "Ahmad Maulana", nik: "0000000000000001", gender: "Laki-laki", birth_place: "Tangerang", birth_date: "1985-03-12", marital_status: "Kawin", religion: "Islam", occupation: "Wiraswasta", address: "Jl. Melati No. 12", rt: "003", rw: "001" },
    village: { name: "Cibodas Baru", address: "Jl. Contoh No. 1, Cibodas Baru", district: "Cibodas", city: "Kota Tangerang" },
    official: { name: "Nama Pejabat Contoh", nip: "000000000000000001", title: "Lurah Cibodas Baru" },
  };
  await fs.mkdir(".data/template-umum", { recursive: true });
  for (const [suffix, number, date] of [
    ["sample", "015/RT.003/IX/2026", "2026-09-13"],
    ["no-reference", "", "2026-09-13"],
    ["number-only", " 016/IX/2026 ", ""],
    ["blank-reference", "   ", "2026-09-13"],
  ]) {
    const form_data = { ...form, nomor_pengantar_rt: number, tanggal_pengantar_rt: date };
    validateFields(fields, form_data);
    const merged = mergeDOCX(template, snapshotValues({ ...snapshot, form_data }, "470/001/CB/IX/2026"));
    const text = new PizZip(merged).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
    for (const v of ["Ahmad Maulana", "0000000000000001", "Nama Pejabat Contoh", "Jl. Melati No. 12", "12 Maret 1985", "14 September 2026", "Indonesia", "bertempat tinggal/berdomisili di alamat tersebut diatas.", `digunakan untuk ${form.keperluan}.`]) assert.ok(text.includes(v), v);
    if (number.trim()) {
      assert.ok(text.includes(`Kelurahan Cibodas Baru, berdasarkan surat keterangan/pengantar dari Ketua RT.003 RW.001 Nomor: ${number.trim()}`));
      if (date) assert.ok(text.includes("tanggal 13 September 2026, Bahwa"));
    } else {
      assert.ok(text.includes("Nama tersebut diatas benar Penduduk Kelurahan Cibodas Baru, Bahwa nama tersebut"));
      assert.ok(!text.includes("pengantar dari Ketua"));
      assert.ok(!text.includes("Nomor:"));
      assert.ok(!text.includes("13 September 2026"));
    }
    if (!date) assert.ok(!text.includes(" tanggal "));
    for (const v of ["CATATAN INTERNAL", "MERGEFIELD", "{", "}"]) assert.ok(!text.includes(v), v);
    await fs.writeFile(`.data/template-umum/${suffix}.docx`, merged);
  }
  await fs.writeFile(".data/template-umum/validation.json", JSON.stringify(validation, null, 2));
  console.log("PASS UMUM required fields, identity, purpose, optional RT reference, localized dates and complete template merge.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
