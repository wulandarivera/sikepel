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

test("Optional RT reference renders a complete clause only with a nonblank number", async () => {
  const fields = JSON.parse(
    await fs.readFile("templates/belum-memiliki-rumah.fields.json", "utf8"),
  );
  const template = await fs.readFile("templates/belum-memiliki-rumah.docx");
  assert.deepEqual(validateTemplate(template, fields).errors, []);
  const snapshot = {
    date: "2026-09-08",
    type: { fields },
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
      keperluan: "KPR",
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
          "serta berdasarkan Surat Keterangan Ketua dari RT.003 RW.001",
        ),
      );
      if (!date) assert.ok(!text.includes(" tanggal "));
    } else {
      assert.equal(values.keterangan_pengantar_rt, "");
      assert.ok(!text.includes("Nomor:"));
      assert.ok(!text.includes("Surat Keterangan Ketua"));
      assert.ok(!text.includes("7 September 2026"));
      assert.ok(text.includes("menurut pengakuan yang bersangkutan, bahwa"));
    }
    assert.ok(!text.includes("${"));
  }
});
