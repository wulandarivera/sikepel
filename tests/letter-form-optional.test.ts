import test from "node:test";
import assert from "node:assert/strict";
import { isNationalityField, defaultNationalityValue } from "../src/lib/letter-form";
import { validateFields } from "../src/server/validation";

test("isNationalityField detects kewarganegaraan, negara, and kebangsaan", () => {
  assert.equal(isNationalityField({ key: "kewarganegaraan" }), true);
  assert.equal(isNationalityField({ key: "kewarganegaraan_suami" }), true);
  assert.equal(isNationalityField({ key: "negara_pemohon" }), true);
  assert.equal(isNationalityField({ key: "custom", label: "Kewarganegaraan Pemohon" }), true);
  assert.equal(isNationalityField({ key: "nama" }), false);
});

test("defaultNationalityValue defaults to Indonesia or WNI for options", () => {
  assert.equal(defaultNationalityValue({ key: "kewarganegaraan" }), "Indonesia");
  assert.equal(
    defaultNationalityValue({
      key: "kewarganegaraan",
      type: "select",
      options: ["WNI", "WNA"],
    }),
    "WNI",
  );
  assert.equal(
    defaultNationalityValue({
      key: "kewarganegaraan",
      type: "select",
      options: ["Indonesia", "Asing"],
    }),
    "Indonesia",
  );
});

import type { Field } from "../src/lib/types";

test("validateFields allows empty required fields when allowEmptyRequired is true", () => {
  const fields: Field[] = [
    { key: "nama", label: "Nama", type: "text", required: true },
    { key: "keperluan", label: "Keperluan", type: "text", required: true },
  ];
  assert.doesNotThrow(() => {
    validateFields(fields, {}, { allowEmptyRequired: true });
  });
});
