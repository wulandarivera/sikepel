import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import {
  snapshotValues,
  mergeDOCX,
  validateTemplate,
} from "../src/server/documents";
import { validateFields } from "../src/server/validation";

test("Unmarried letter preserves its declaration and includes RT reference only with a number", async () => {
  const fields = JSON.parse(
    await fs.readFile("templates/belum-menikah.fields.json", "utf8"),
  );
  const template = await fs.readFile("templates/belum-menikah.docx");
  assert.deepEqual(validateTemplate(template, fields).errors, []);
  const snapshot = {
    date: "2026-09-08",
    type: { fields, slug: "belum-menikah" },
    resident: { rt: "003", rw: "001", birth_date: "1985-03-12" },
    village: {},
    official: {},
  };
  for (const [number, date, expected] of [
    [
      "015/IX/2026",
      "2026-09-07",
      "Nomor: 015/IX/2026 tanggal 7 September 2026",
    ],
    [" 015/IX/2026 ", "", "Nomor: 015/IX/2026"],
    ["", "", ""],
    ["", "2026-09-07", ""],
    ["   ", "2026-09-07", ""],
  ]) {
    const form_data = {
      negara: "Indonesia",
      keperluan: "persyaratan administrasi pekerjaan",
      nomor_pengantar_rt: number,
      tanggal_pengantar_rt: date,
    };
    validateFields(fields, form_data);
    const values = snapshotValues(
      { ...snapshot, form_data },
      "— / BELUM TERBIT",
    );
    const text = new PizZip(mergeDOCX(template, values))
      .file("word/document.xml")!
      .asText()
      .replace(/<[^>]+>/g, "");
    if (expected) {
      assert.ok(text.includes(expected));
      assert.ok(
        text.includes(
          "dan berdasarkan keterangan dari Ketua RT.003 RW.001",
        ),
      );
      if (!date) assert.ok(!text.includes(" tanggal "));
    } else {
      assert.equal(values.keterangan_pengantar_rt, "");
      assert.ok(!text.includes("Nomor:"));
      assert.ok(!text.includes("keterangan dari Ketua"));
      assert.ok(!text.includes("7 September 2026"));
      assert.ok(text.includes("menurut pengakuan yang bersangkutan, bahwa"));
    }
    assert.ok(text.includes("belum pernah menikah baik resmi maupun tidak resmi"));
    assert.ok(text.includes("persyaratan administrasi pekerjaan"));
    assert.ok(!text.includes("MERGEFIELD"));
    assert.ok(!text.includes("${"));
  }
});

