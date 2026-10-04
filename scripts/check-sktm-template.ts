import fs from "node:fs/promises";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { validateTemplate, snapshotValues, mergeDOCX } from "../src/server/documents";
import { validateFields } from "../src/server/validation";

async function main() {
  const fields = JSON.parse(await fs.readFile("templates/tidak-mampu.fields.json", "utf8"));
  const bytes = await fs.readFile("templates/tidak-mampu.docx");
  const validation = validateTemplate(bytes, fields, "tidak-mampu");
  assert.deepEqual(validation.errors, []);
  const snapshot = {
    date: "2026-09-09", type: { slug: "tidak-mampu", fields },
    resident: { name: "Ahmad Maulana", nik: "0000000000000001", gender: "Laki-laki", birth_place: "Tangerang", birth_date: "1985-03-12", marital_status: "Kawin", religion: "Islam", occupation: "Buruh harian lepas", address: "Jl. Melati No. 12", rt: "003", rw: "001" },
    village: { name: "Cibodas Baru", address: "Jl. Contoh No. 1, Cibodas Baru", district: "Cibodas", city: "Kota Tangerang" },
    official: { name: "Nama Pejabat Contoh", nip: "000000000000000001", title: "Lurah Cibodas Baru" },
  };
  const form = { negara: "Indonesia", keterangan: "Yang bersangkutan berasal dari keluarga tidak mampu", desil: "Desil 2", keperluan: "permohonan bantuan biaya pendidikan", jabatan_detail: "", catatan: "CATATAN INTERNAL" };
  assert.ok(!fields.some((field: { key: string }) => field.key === "keterangan"));
  assert.throws(() => validateFields(fields, { ...form, desil: "" }));
  assert.throws(() => validateFields(fields, { ...form, desil: "   " }));
  assert.throws(() => validateFields(fields, { ...form, negara: "" }));
  assert.throws(() => validateFields(fields, { ...form, keperluan: "" }));
  for (const [suffix, number, date, desil] of [
    ["sample", "015/RT.003/IX/2026", "2026-09-08", "Desil 2"],
    ["no-reference", "", "2026-09-08", "Desil 1"],
    ["number-only", " 016/IX/2026 ", "", "Desil 3"],
  ]) {
    const form_data = { ...form, desil, nomor_pengantar_rt: number, tanggal_pengantar_rt: date };
    validateFields(fields, form_data);
    const values = snapshotValues({ ...snapshot, form_data }, "460/001/CB/IX/2026");
    const merged = mergeDOCX(bytes, values);
    const text = new PizZip(merged).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
    for (const value of ["Ahmad Maulana", "0000000000000001", "Cibodas Baru", "Nama Pejabat Contoh", form.keperluan]) assert.ok(text.includes(value));
    assert.ok(!text.includes(form.keterangan), "Legacy condition input must not print");
    assert.ok(text.includes(`Sesuai dengan yang tercantum dalam DTSEN (Data Tunggal Sosial dan Ekonomi Nasional) benar nama tersebut merupakan warga dengan kategori ${desil}.`));
    if (number.trim()) {
      assert.ok(text.includes(`berdasarkan keterangan Ketua RT.003 RW.001 Nomor: ${number.trim()}`));
      if (date) assert.ok(text.includes("tanggal 8 September 2026"));
    } else {
      assert.ok(!text.includes("berdasarkan keterangan Ketua"));
      assert.ok(!text.includes("Nomor:"));
      assert.ok(!text.includes("8 September 2026"));
    }
    if (!date) assert.ok(!text.includes(" tanggal "));
    assert.ok(text.includes(desil));
    assert.ok(!text.includes("CATATAN INTERNAL"));
    assert.ok(!text.includes("MERGEFIELD"));
    assert.ok(!text.includes("${"));
    await fs.writeFile(`.data/template-sktm/${suffix}.docx`, merged);
  }
  await fs.writeFile(".data/template-sktm/validation.json", JSON.stringify(validation, null, 2));
  console.log("PASS updated DTSEN declaration, required desil, removed legacy condition, optional RT and merged documents.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
