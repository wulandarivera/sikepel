import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {
  validateTemplate,
  mergeDOCX,
  snapshotValues,
} from "../src/server/documents";
import { validateFields } from "../src/server/validation";
import type { Field } from "../src/lib/types";
async function main() {
  const bytes = await fs.readFile("templates/belum-memiliki-rumah.docx");
  const fields: Field[] = JSON.parse(
    await fs.readFile("templates/belum-memiliki-rumah.fields.json", "utf8"),
  );
  const result = validateTemplate(bytes, fields);
  assert.deepEqual(result.errors, []);
  const form_data = {
    negara: "Indonesia",
    nomor_pengantar_rt: "015/RT.003/IX/2026",
    tanggal_pengantar_rt: "2026-09-07",
    keperluan: "persyaratan pengajuan KPR bersubsidi",
    jabatan_detail: "",
    catatan: "Catatan internal tidak tercetak",
  };
  assert.throws(() => validateFields(fields, { keperluan: "KPR" }));
  validateFields(fields, form_data);
  validateFields(fields, { negara: "Indonesia", keperluan: "KPR" });
  const values: Record<string, unknown> = snapshotValues(
    {
      date: "2026-09-08T03:00:00Z",
      form_data,
      type: {
        name: "Surat Keterangan Belum Memiliki Rumah",
        code: "470",
        fields,
      },
      resident: {
        name: "Ahmad Maulana",
        nik: "0000000000000001",
        birth_place: "Tangerang",
        birth_date: "1985-03-12",
        gender: "Laki-laki",
        religion: "Islam",
        marital_status: "Kawin",
        occupation: "Wiraswasta",
        address: "Jl. Melati No. 12",
        rt: "003",
        rw: "001",
      },
      village: {
        name: "Cibodas Baru",
        address: "Alamat kantor kelurahan untuk pengujian",
        district: "Cibodas",
        city: "Kota Tangerang",
      },
      official: {
        name: "Nama Pejabat Contoh",
        nip: "000000000000000001",
        title: "Lurah Cibodas Baru",
      },
    },
    "— / BELUM TERBIT",
  );
  assert.equal(values.tanggal_pengantar_rt, "7 September 2026");
  await fs.writeFile(
    ".data/template-rumah/sample.docx",
    mergeDOCX(bytes, values),
  );
  await fs.writeFile(
    ".data/template-rumah/sample-without-reference.docx",
    mergeDOCX(bytes, { ...values, keterangan_pengantar_rt: "" }),
  );
  await fs.writeFile(
    ".data/template-rumah/validation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    "PASS placeholders, required form fields, localized reference date and actual DOCX merge",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
