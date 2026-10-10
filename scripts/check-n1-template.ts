import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { validateTemplate, mergeDOCX, snapshotValues } from "../src/server/documents";
import { validateFields, validateN1 } from "../src/server/validation";
import { n1Statuses } from "../src/lib/n1";
import type { Field } from "../src/lib/types";

async function main() {
  const fields: Field[] = [
    { key: "negara_pemohon", label: "Kewarganegaraan pemohon", type: "text", required: true },
    { key: "status_n1", label: "Status perkawinan untuk N1", type: "select", options: n1Statuses, required: true },
    { key: "istri_ke", label: "Beristri ke", type: "number", required: false },
  ];
  for (const side of ["bapak", "ibu"]) {
    const person = side === "bapak" ? "ayah" : "ibu";
    for (const [key, label, kind] of [
      ["nama", "Nama lengkap dan alias", "text"], ["nik", "NIK", "text"],
      ["tempat_lahir", "Tempat lahir", "text"], ["tanggal_lahir", "Tanggal lahir", "date"],
      ["negara", "Kewarganegaraan", "text"], ["agama", "Agama", "text"],
      ["pekerjaan", "Pekerjaan", "text"], ["alamat", "Alamat lengkap", "textarea"],
    ]) fields.push({ key: `${key}_${side}`, label: `${label} ${person}`, type: kind as Field["type"], required: true });
  }
  fields.push(
    { key: "jabatan_detail", label: "Keterangan tambahan jabatan (opsional)", type: "text", required: false },
    { key: "catatan", label: "Catatan Untuk Petugas (tidak tercetak)", type: "textarea", required: false },
  );
  await fs.writeFile("templates/nikah.fields.json", JSON.stringify(fields, null, 2));
  const bytes = await fs.readFile("templates/nikah.docx");
  const validation = validateTemplate(bytes, fields, "nikah");
  assert.deepEqual(validation.errors, []);
  const form: Record<string, string> = { negara_pemohon: "Indonesia", status_n1: "Jejaka", istri_ke: "", jabatan_detail: "", catatan: "Catatan internal tidak tercetak" };
  for (const side of ["bapak", "ibu"]) Object.assign(form, Object.fromEntries(Object.entries({
    nama: side === "bapak" ? "Hasan Abdullah" : "Siti Aminah",
    nik: side === "bapak" ? "0000000000000002" : "0000000000000003",
    tempat_lahir: "Tangerang", tanggal_lahir: side === "bapak" ? "1960-03-12" : "1963-06-20",
    negara: "Indonesia", agama: "Islam", pekerjaan: "Wiraswasta", alamat: "Jl. Melati No. 12, RT 003 RW 001, Cibodas Baru",
  }).map(([key, value]) => [`${key}_${side}`, value])));
  validateFields(fields, form); validateN1(form, "Laki-laki");
  const snapshot = {
    date: "2026-09-08", type: { slug: "nikah", fields }, form_data: form,
    resident: { name: "Ahmad Maulana", nik: "0000000000000001", gender: "Laki-laki", birth_place: "Tangerang", birth_date: "1985-03-12", religion: "Islam", occupation: "Wiraswasta", address: "Jl. Melati No. 12", rt: "003", rw: "001" },
    village: { name: "Cibodas Baru" }, official: { name: "Nama Pejabat Contoh", title: "Lurah Cibodas Baru", nip: "000000000000000001" },
  };
  await fs.writeFile(".data/template-n1/sample-data.json", JSON.stringify(snapshot, null, 2));
  await fs.writeFile(".data/template-n1/sample.docx", mergeDOCX(bytes, snapshotValues(snapshot, "— / BELUM TERBIT")));
  await fs.writeFile(".data/template-n1/sample-female.docx", mergeDOCX(bytes, snapshotValues({ ...snapshot, resident: { ...snapshot.resident, gender: "Perempuan", name: "Dewi Lestari" }, form_data: { ...form, status_n1: "Perawan" } }, "— / BELUM TERBIT")));
  await fs.writeFile(".data/template-n1/validation.json", JSON.stringify(validation, null, 2));
  console.log("PASS N1 slots, parent fields, marital-status validation and samples.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
