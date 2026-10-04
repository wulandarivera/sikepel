import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { f102Applications, f102Attachments } from "../src/lib/f102";
import {
  validateTemplate,
  snapshotValues,
  mergeDOCX,
} from "../src/server/documents";
import type { Field } from "../src/lib/types";
async function main() {
  const fields: Field[] = [
    {
      key: "jenis_permohonan",
      label: "Jenis permohonan KTP-el",
      type: "select",
      options: f102Applications,
      required: true,
    },
    {
      key: "nomor_handphone",
      label: "Nomor handphone / WA (opsional)",
      type: "text",
      required: false,
    },
    {
      key: "email",
      label: "Alamat email (opsional)",
      type: "text",
      required: false,
    },
    {
      key: "nama_petugas",
      label: "Nama petugas (opsional)",
      type: "text",
      required: false,
    },
    ...f102Attachments.map(([key, label]) => ({
      key,
      label,
      type: "checkbox" as const,
      required: false,
    })),
    {
      key: "catatan",
      label: "Catatan petugas (tidak tercetak)",
      type: "textarea",
      required: false,
    },
  ];
  await fs.writeFile(
    "templates/ktp.fields.json",
    JSON.stringify(fields, null, 2),
  );
  const bytes = await fs.readFile("templates/ktp.docx");
  const validation = validateTemplate(bytes, fields, "ktp");
  assert.deepEqual(validation.errors, []);
  await fs.writeFile(
    ".data/template-ktp/validation.json",
    JSON.stringify(validation, null, 2),
  );
  const snapshot = {
    date: "2026-09-08",
    type: { slug: "ktp", fields },
    resident: {
      name: "Ahmad Maulana",
      nik: "0000000000000001",
      no_kk: "0000000000000101",
      birth_date: "1985-03-12",
    },
    village: {},
    official: {},
  };
  for (const [name, form_data] of [
    [
      "hilang",
      {
        jenis_permohonan: "Penggantian hilang",
        nomor_handphone: "080000000001",
        email: "pemohon@example.com",
        nama_petugas: "Petugas Contoh",
        lampiran_kk: "Ya",
        lampiran_hilang: "Ya",
        lampiran_pernyataan: "Ya",
      },
    ],
    [
      "perubahan",
      {
        jenis_permohonan: "Perubahan data",
        nomor_handphone: "",
        email: "",
        nama_petugas: "Petugas Contoh",
        lampiran_perubahan: "Ya",
        lampiran_ktp: "Ya",
      },
    ],
  ] as const) {
    await fs.writeFile(
      `.data/template-ktp/sample-${name}.docx`,
      mergeDOCX(
        bytes,
        snapshotValues({ ...snapshot, form_data }, "— / BELUM TERBIT"),
      ),
    );
  }
  console.log(
    "PASS F-102 validation; sample applications and attachment selections merged.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
