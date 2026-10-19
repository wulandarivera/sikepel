import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import { mergeDOCX, snapshotValues, validateTemplate } from "../src/server/documents";
import { fieldsSchema, validateFields } from "../src/server/validation";
import { spouseDefaults } from "../src/lib/spouse-form";

test("Spouse defaults fill only the selected resident's side without inventing partner data", () => {
  const resident = { id: "resident", name: "Pemohon", gender: "Perempuan", birth_date: "1987-06-20", address: "Alamat istri", rt: "001" };
  const wife = spouseDefaults(resident, { id: "village", name: "Kelurahan", city: "Kabupaten Contoh" });
  assert.equal(wife.nama_istri, "Pemohon");
  assert.equal(wife.rt_istri, "001");
  assert.equal(wife.kota_istri, "Kabupaten Contoh");
  assert.equal(wife.nama_suami, undefined);
  assert.equal(wife.negara_istri, undefined);
  assert.equal(spouseDefaults({ ...resident, gender: "Laki-laki" }).nama_suami, "Pemohon");
  assert.deepEqual(spouseDefaults({ ...resident, gender: "" }), {});
});

test("Suami istri template validates both identities, dates, and optional RT references", async () => {
  const fields = fieldsSchema.parse(JSON.parse(await fs.readFile("templates/suami-istri.fields.json", "utf8")));
  const bytes = await fs.readFile("templates/suami-istri.docx");
  assert.deepEqual(validateTemplate(bytes, fields, "suami-istri").errors, []);
  const form: Record<string, string> = Object.fromEntries(fields.filter(f => f.required).map(f => [f.key, f.type === "date" ? "2010-05-15" : "Contoh"]));
  Object.assign(form, { nama_suami: "Ahmad Maulana", nama_istri: "Siti Aminah", tanggal_lahir_suami: "1985-03-12", tanggal_lahir_istri: "1987-06-20", keterangan_akta_perkawinan: "belum diterbitkan", keperluan: "administrasi keluarga", catatan: "INTERNAL-ONLY" });
  validateFields(fields, form);
  for (const key of ["nama_suami", "nama_istri", "tanggal_pernikahan", "keterangan_akta_perkawinan"]) assert.throws(() => validateFields(fields, { ...form, [key]: "" }));
  assert.throws(() => validateFields(fields, { ...form, tanggal_lahir_istri: "invalid" }));
  for (const number of ["015/IX/2026", "", "   "]) {
    const data = { date: "2026-09-08", type: { slug: "suami-istri", fields }, resident: { name: "Pemohon arsip", birth_date: "1985-03-12" }, village: { name: "Cibodas Baru" }, official: { name: "Pejabat Contoh" }, form_data: { ...form, nomor_pengantar_rt: number, tanggal_pengantar_rt: "2026-09-07" } };
    const xml = new PizZip(mergeDOCX(bytes, snapshotValues(data, "470/001/IX/2026"))).file("word/document.xml")!.asText();
    const text = xml.replace(/<[^>]+>/g, "");
    for (const expected of ["Ahmad Maulana", "Siti Aminah", "12 Maret 1985", "20 Juni 1987", "15 Mei 2010", "belum diterbitkan", "administrasi keluarga", "470/001/IX/2026", "Pejabat Contoh"]) assert.ok(text.includes(expected), expected);
    assert.match(xml, /<w:pgSz[^>]*w:w="11907"[^>]*w:h="16839"/);
    assert.ok(!text.includes("{"));
    assert.ok(!text.includes("INTERNAL-ONLY"));
    if (number.trim()) assert.ok(text.includes("berdasarkan surat pengantar RT RW Nomor: 015/IX/2026 tanggal 7 September 2026 benar"));
    else {
      assert.ok(!text.includes("surat pengantar RT"));
      assert.ok(!text.includes("7 September 2026"));
      assert.ok(text.includes("warga Kelurahan Cibodas Baru, benar adalah pasangan suami-istri"));
    }
  }
});
