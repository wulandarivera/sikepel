import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isNationalityField, defaultNationalityValue } from "../src/lib/letter-form";
import { validateFields, validateN1, validatePindah } from "../src/server/validation";
import { requirementsComplete } from "../src/lib/requirements";
import type { Field } from "../src/lib/types";

test("QA Item 1: Template nationality fields detection and default values", () => {
  const templatesDir = path.resolve(process.cwd(), "templates");
  const fieldFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".fields.json"));

  assert.ok(fieldFiles.length > 0, "Template field files must exist");

  const nationalityFieldsFound: { file: string; key: string; label: string; defaultValue: string }[] = [];

  for (const file of fieldFiles) {
    const raw = fs.readFileSync(path.join(templatesDir, file), "utf-8");
    const fields: Field[] = JSON.parse(raw);

    for (const f of fields) {
      if (isNationalityField(f)) {
        const def = defaultNationalityValue(f);
        nationalityFieldsFound.push({ file, key: f.key, label: f.label, defaultValue: def });
        assert.ok(
          def === "Indonesia" || def === "WNI",
          `Field ${f.key} in ${file} must default to Indonesia or WNI, got: ${def}`
        );
      }
    }
  }

  // Ensure nationality fields were found across templates
  assert.ok(nationalityFieldsFound.length >= 8, `Expected at least 8 nationality fields across templates, found ${nationalityFieldsFound.length}`);
  
  // Verify specific expected nationality fields
  const keys = nationalityFieldsFound.map(n => n.key);
  assert.ok(keys.includes("negara"), "Should detect 'negara' field");
  assert.ok(keys.includes("negara_pemohon"), "Should detect 'negara_pemohon' field");
  assert.ok(keys.includes("negara_bapak"), "Should detect 'negara_bapak' field");
  assert.ok(keys.includes("negara_ibu"), "Should detect 'negara_ibu' field");
  assert.ok(keys.includes("negara_suami"), "Should detect 'negara_suami' field");
  assert.ok(keys.includes("negara_istri"), "Should detect 'negara_istri' field");
});

test("QA Item 2: All template fields optional when allowEmptyRequired is enabled", () => {
  const templatesDir = path.resolve(process.cwd(), "templates");
  const fieldFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".fields.json"));

  for (const file of fieldFiles) {
    const raw = fs.readFileSync(path.join(templatesDir, file), "utf-8");
    const fields: Field[] = JSON.parse(raw);

    // Empty form data must pass validation without throwing errors
    assert.doesNotThrow(() => {
      validateFields(fields, {}, { allowEmptyRequired: true });
    }, `Empty form_data failed validateFields for ${file}`);
  }
});

test("QA Item 2b: validateN1 and validatePindah succeed with empty input", () => {
  // Empty data should not trigger validation errors
  assert.doesNotThrow(() => {
    validatePindah({});
  }, "validatePindah failed on empty data");

  assert.doesNotThrow(() => {
    validateN1({}, "Laki-laki");
  }, "validateN1 failed on empty data for male");

  assert.doesNotThrow(() => {
    validateN1({}, "Perempuan");
  }, "validateN1 failed on empty data for female");

  // But invalid formats when provided must still be rejected
  assert.throws(() => {
    validatePindah({ pos_pindah: "123" });
  }, "validatePindah should reject invalid postal code");

  assert.throws(() => {
    validateN1({ nik_bapak: "123" }, "Laki-laki");
  }, "validateN1 should reject invalid NIK format");
});

test("QA Item 3: Requirement checklist and gate remain functional", () => {
  const requirements = [
    { id: "req-1", label: "KTP Asli", mandatory: true },
    { id: "req-2", label: "Kartu Keluarga", mandatory: true },
    { id: "req-3", label: "Surat Pengantar RT/RW", mandatory: false },
  ];

  // Incomplete requirements must fail
  assert.equal(requirementsComplete(requirements, {}), false);
  assert.equal(requirementsComplete(requirements, { "req-1": true }), false);
  assert.equal(requirementsComplete(requirements, { "req-1": true, "req-2": false }), false);

  // Complete mandatory requirements must pass even if optional is unchecked
  assert.equal(requirementsComplete(requirements, { "req-1": true, "req-2": true }), true);
  assert.equal(requirementsComplete(requirements, { "req-1": true, "req-2": true, "req-3": true }), true);
});

test("QA Item 5: No emoji in changed or added files", () => {
  const filesToCheck = [
    "src/components/pindah-members.tsx",
    "src/components/service.tsx",
    "src/lib/letter-form.ts",
    "src/server/letters.ts",
    "src/server/validation.ts",
    "tests/letter-form-optional.test.ts",
  ];

  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  for (const rel of filesToCheck) {
    const full = path.resolve(process.cwd(), rel);
    const content = fs.readFileSync(full, "utf-8");
    assert.equal(
      emojiRegex.test(content),
      false,
      `File ${rel} contains emoji, which violates owner development requirements`
    );
  }
});
