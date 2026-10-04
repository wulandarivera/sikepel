import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { validateTemplate, mergeDOCX, snapshotValues } from "../src/server/documents";
import { validateFields } from "../src/server/validation";
import type { Field } from "../src/lib/types";

async function main() {
  const fields: Field[] = [];
  for (const side of ["suami", "istri"]) {
    for (const [key, label, kind] of [
      ["nama", "Nama lengkap", "text"],
      ["tempat_lahir", "Tempat lahir", "text"],
      ["tanggal_lahir", "Tanggal lahir", "date"],
      ["pekerjaan", "Pekerjaan", "text"],
      ["agama", "Agama", "text"],
      ["negara", "Kewarganegaraan", "text"],
      ["alamat", "Alamat", "textarea"],
      ["rt", "RT", "text"],
      ["rw", "RW", "text"],
      ["kel", "Kelurahan/desa", "text"],
      ["kec", "Kecamatan", "text"],
      ["kota", "Kota/kabupaten", "text"],
    ]) fields.push({ key: `${key}_${side}`, label: `${label} ${side}`, type: kind as Field["type"], required: true });
  }
  fields.push(
    { key: "tanggal_pernikahan", label: "Tanggal pernikahan", type: "date", required: true },
    { key: "keterangan_akta_perkawinan", label: "Keterangan buku nikah / akta perkawinan", type: "textarea", required: true },
    { key: "nomor_pengantar_rt", label: "Nomor surat pengantar RT/RW (opsional)", type: "text", required: false },
    { key: "tanggal_pengantar_rt", label: "Tanggal surat pengantar RT/RW (opsional)", type: "date", required: false },
    { key: "keperluan", label: "Peruntukan surat", type: "textarea", required: true },
    { key: "jabatan_detail", label: "Keterangan tambahan jabatan (opsional)", type: "text", required: false },
    { key: "catatan", label: "Catatan petugas (tidak tercetak)", type: "textarea", required: false },
  );
  await fs.writeFile("templates/suami-istri.fields.json", JSON.stringify(fields, null, 2));
  const bytes = await fs.readFile("templates/suami-istri.docx");
  const validation = validateTemplate(bytes, fields, "suami-istri");
  assert.deepEqual(validation.errors, []);
  const form: Record<string, string> = {
    tanggal_pernikahan: "2010-05-15", keterangan_akta_perkawinan: "belum diterbitkan",
    keperluan: "persyaratan administrasi keluarga", nomor_pengantar_rt: "015/RT.003/IX/2026",
    tanggal_pengantar_rt: "2026-09-07", jabatan_detail: "", catatan: "Catatan internal tidak tercetak",
  };
  for (const side of ["suami", "istri"]) Object.assign(form, Object.fromEntries(Object.entries({
    nama: side === "suami" ? "Ahmad Maulana" : "Siti Aminah",
    tempat_lahir: "Tangerang", tanggal_lahir: side === "suami" ? "1985-03-12" : "1987-06-20",
    pekerjaan: "Wiraswasta", agama: "Islam", negara: "Indonesia", alamat: "Jl. Melati No. 12",
    rt: "003", rw: "001", kel: "Cibodas Baru", kec: "Cibodas", kota: "Kota Tangerang",
  }).map(([key, value]) => [`${key}_${side}`, value])));
  validateFields(fields, form);
  const snapshot = {
    date: "2026-09-08", type: { slug: "suami-istri", fields }, form_data: form,
    resident: { name: "Ahmad Maulana", birth_date: "1985-03-12", rt: "003", rw: "001" },
    village: { name: "Cibodas Baru", address: "Alamat kantor kelurahan untuk pengujian" },
    official: { name: "Nama Pejabat Contoh", title: "Lurah Cibodas Baru", nip: "000000000000000001" },
  };
  await fs.writeFile(".data/template-suami-istri/sample-data.json", JSON.stringify(snapshot, null, 2));
  for (const empty of [false, true]) {
    const data = { ...snapshot, form_data: { ...form, nomor_pengantar_rt: empty ? "" : form.nomor_pengantar_rt } };
    await fs.writeFile(`.data/template-suami-istri/sample${empty ? "-without-reference" : ""}.docx`, mergeDOCX(bytes, snapshotValues(data, "— / BELUM TERBIT")));
  }
  await fs.writeFile(".data/template-suami-istri/validation.json", JSON.stringify(validation, null, 2));
  console.log("PASS suami-istri template validation, fields and sample documents.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
