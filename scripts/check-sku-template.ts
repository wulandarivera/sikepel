import fs from "node:fs/promises";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { validateTemplate, snapshotValues, mergeDOCX } from "../src/server/documents";
import { validateFields } from "../src/server/validation";

async function main() {
  const fields = JSON.parse(await fs.readFile("templates/usaha.fields.json", "utf8"));
  const template = await fs.readFile("templates/usaha.docx");
  const validation = validateTemplate(template, fields, "usaha");
  assert.deepEqual(validation.errors, []);
  const form = {
    negara: "Indonesia", jenis_usaha: "Perdagangan sembako", nama_usaha: "Toko Berkah",
    alamat_usaha: "Jl. Anggrek No. 25", rt_usaha: "005", rw_usaha: "002",
    kel_usaha: "Cibodas Baru", kec_usaha: "Cibodas", kota_kabupaten_usaha: "Kota Tangerang",
    jabatan_detail: "", catatan: "CATATAN INTERNAL",
  };
  validateFields(fields, form);
  for (const f of fields.filter((f: {required: boolean}) => f.required)) {
    assert.throws(() => validateFields(fields, { ...form, [f.key]: "" }));
  }
  const snapshot = {
    date: "2026-09-14", type: { slug: "usaha", fields },
    resident: { name: "Ahmad Maulana", nik: "0000000000000001", gender: "Laki-laki", birth_place: "Tangerang", birth_date: "1985-03-12", marital_status: "Kawin", religion: "Islam", occupation: "Wiraswasta", address: "Jl. Melati No. 12", rt: "003", rw: "001" },
    village: { name: "Cibodas Baru", address: "Jl. Contoh No. 1, Cibodas Baru", district: "Cibodas", city: "Kota Tangerang" },
    official: { name: "Nama Pejabat Contoh", nip: "000000000000000001", title: "Lurah Cibodas Baru" },
  };
  for (const [suffix, number, date] of [
    ["sample", "015/RT.003/IX/2026", "2026-09-13"],
    ["no-reference", "", "2026-09-13"],
    ["number-only", " 016/IX/2026 ", ""],
    ["blank-reference", "   ", "2026-09-13"],
  ]) {
    const form_data = { ...form, nomor_pengantar_rt: number, tanggal_pengantar_rt: date };
    validateFields(fields, form_data);
    const merged = mergeDOCX(template, snapshotValues({ ...snapshot, form_data }, "503/001/CB/IX/2026"));
    const text = new PizZip(merged).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
    for (const v of ["Ahmad Maulana", "0000000000000001", "Nama Pejabat Contoh", "Jl. Melati No. 12", "Perdagangan sembako", "Toko Berkah", "Jl. Anggrek No. 25 RT.005 RW.002", "Kelurahan Cibodas Baru Kecamatan Cibodas Kota Tangerang"]) assert.ok(text.includes(v), v);
    if (number.trim()) {
      assert.ok(text.includes(`berdasarkan keterangan Ketua RT.003 RW.001 Nomor: ${number.trim()}`));
      assert.ok(text.includes(" dan pengakuan yang bersangkutan"));
      if (date) assert.ok(text.includes("tanggal 13 September 2026"));
    } else {
      assert.ok(text.includes("Nama tersebut diatas berdasarkan pengakuan yang bersangkutan"));
      assert.ok(!text.includes("keterangan Ketua"));
      assert.ok(!text.includes("Nomor:"));
      assert.ok(!text.includes("13 September 2026"));
    }
    if (!date) assert.ok(!text.includes(" tanggal "));
    for (const v of ["CATATAN INTERNAL", "MERGEFIELD", "${"]) assert.ok(!text.includes(v));
    await fs.writeFile(`.data/template-sku/${suffix}.docx`, merged);
  }
  await fs.writeFile(".data/template-sku/validation.json", JSON.stringify(validation, null, 2));
  console.log("PASS SKU required fields, separate business address, optional RT reference, dates and template merge.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
