import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import { companionValues, mergeDOCX } from "../src/server/documents";

test("N1 companion statement uses the immutable N1 snapshot", async () => {
  const template = await fs.readFile("templates/pernyataan-belum-menikah.docx");
  const snapshot = {
    date: "2026-09-08T03:00:00Z",
    form_data: { nama_bapak: "Hasan Abdullah", negara_pemohon: "Indonesia" },
    resident: {
      name: "Ahmad Maulana",
      gender: "Laki-laki",
      birth_place: "Tangerang",
      birth_date: "1985-03-12",
      religion: "Islam",
      address: "Jl. Melati No. 12",
      rt: "003",
      rw: "001",
    },
    village: { name: "Cibodas Baru", district: "Cibodas" },
    official: { name: "Pejabat Contoh", nip: "000000000000000001", title: "Lurah" },
    type: { slug: "nikah", fields: [] },
  };
  const values = companionValues(snapshot, "470/001/SKM/IX/2026");
  assert.equal(values.status_pernyataan_nikah, "Jejaka");
  const xml = new PizZip(mergeDOCX(template, values)).file("word/document.xml")!.asText();
  const text = xml.replace(/<[^>]+>/g, "");
  for (const expected of ["Ahmad Maulana", "Hasan Abdullah", "Indonesia", "Jejaka", "Cibodas Baru", "Cibodas", "8 September 2026"]) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes("${"));
  assert.ok(!text.includes("{"));
  assert.ok(text.includes("Saksi I"));
});

