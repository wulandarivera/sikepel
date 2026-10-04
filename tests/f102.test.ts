import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import {
  validateTemplate,
  mergeDOCX,
  snapshotValues,
} from "../src/server/documents";
import { validateFields } from "../src/server/validation";
import { f102Applications, f102Attachments, f102Values } from "../src/lib/f102";
test("F-102 preserves form geometry, maps each request and only marks selected attachments", async () => {
  const bytes = await fs.readFile("templates/ktp.docx");
  const fields = JSON.parse(
    await fs.readFile("templates/ktp.fields.json", "utf8"),
  );
  assert.deepEqual(validateTemplate(bytes, fields, "ktp").errors, []);
  assert.ok(
    validateTemplate(bytes, fields).errors.some((x) =>
      x.includes("nomor_surat"),
    ),
  );
  const snapshot = {
    date: "2026-09-08",
    resident: {
      name: "Ahmad Maulana",
      nik: "0000000000000001",
      no_kk: "0000000000000101",
      birth_date: "1985-03-12",
    },
    type: { slug: "ktp", fields },
    village: {},
    official: {},
  };
  const expected = ["Ⓐ", "Ⓑ", "Ⓒ①", "Ⓒ②", "Ⓓ", "Ⓔ", "Ⓕ", "Ⓖ", "Ⓑ"];
  assert.equal(fields.find((field: { key: string }) => field.key === "nama_petugas").required, false);
  for (const name of [undefined, "", "   ", "  Petugas Contoh  "]) {
    const form = { jenis_permohonan: "KTP baru", nama_petugas: name };
    assert.doesNotThrow(() => validateFields(fields, form));
    const values: Record<string, unknown> = snapshotValues({ ...snapshot, form_data: form }, "TEST");
    const expectedName = name?.trim() || ".".repeat(35);
    assert.equal(values.nama_petugas, expectedName);
    const xml = new PizZip(mergeDOCX(bytes, values)).file("word/document.xml")!.asText();
    assert.ok(xml.replace(/<[^>]+>/g, "").includes(`( ${expectedName} )`));
  }
  for (const [index, choice] of f102Applications.entries()) {
    const form = { jenis_permohonan: choice, nama_petugas: "Petugas Contoh" };
    validateFields(fields, form);
    assert.equal(
      Object.values(f102Values(form))
        .filter((x) => /[Ⓐ-Ⓩ①②]/.test(x))
        .join(""),
      expected[index],
    );
  }
  for (const selected of [
    [],
    ...f102Attachments.map(([key]) => [key]),
    f102Attachments.map(([key]) => key),
  ]) {
    const form = {
      jenis_permohonan: "Penggantian rusak",
      nama_petugas: "Petugas Contoh",
      ...Object.fromEntries(selected.map((key) => [key, "Ya"])),
    };
    validateFields(fields, form);
    const merged = new PizZip(
      mergeDOCX(
        bytes,
        snapshotValues(
          { ...snapshot, form_data: form },
          "470/001/TEST/IX/2026",
        ),
      ),
    );
    const xml = merged.file("word/document.xml")!.asText();
    const text = xml.replace(/<[^>]+>/g, "");
    assert.ok(text.includes("AHMAD MAULANA"));
    assert.ok(text.includes("0000000000000101"));
    assert.ok(text.includes("Petugas Contoh"));
    assert.ok(!text.includes("${"));
    assert.ok(!text.includes("{nama}"));
    assert.ok(!text.includes("470/001/TEST"));
    assert.match(xml, /<w:pgSz[^>]*w:w="12240"[^>]*w:h="20160"/);
    const blocks = xml.match(/<pic:pic\b[\s\S]*?<\/pic:pic>/g)!;
    for (const [key] of f102Attachments) {
      const block = blocks.find((b) => b.includes("sikepel-f102:" + key + '"'));
      assert.ok(block);
      assert.equal(block.includes('r:embed="rId7"'), selected.includes(key));
    }
    assert.deepEqual(
      merged.file("word/header1.xml")!.asUint8Array(),
      new PizZip(bytes).file("word/header1.xml")!.asUint8Array(),
    );
  }
  assert.throws(() =>
    validateFields(fields, { jenis_permohonan: "KK baru", nama_petugas: "A" }),
  );
  assert.throws(() =>
    validateFields(fields, {
      jenis_permohonan: "KTP baru",
      nama_petugas: "A",
      email: "invalid",
    }),
  );
  assert.throws(() =>
    validateFields(fields, {
      jenis_permohonan: "KTP baru",
      nama_petugas: "A",
      lampiran_kk: "Tidak",
    }),
  );
});
