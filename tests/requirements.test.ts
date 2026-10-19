import { test } from "node:test";
import assert from "node:assert/strict";
import { missingRequirements, requirementsComplete, whatsappMissing } from "../src/lib/requirements";
test("checklist uses strict booleans and optional requirements do not block", () => {
 const list = [{ id: "a", label: "Dokumen A", mandatory: true }, { id: "b", label: "Dokumen B", mandatory: false }];
 assert.equal(requirementsComplete(list, { a: "true" }), false);
 assert.equal(requirementsComplete(list, { a: true }), true);
 assert.deepEqual(missingRequirements(list, { a: true }).map(r=>r.id), ["b"]);
 assert.equal(requirementsComplete([]), true);
});
test("WhatsApp normalizes Indonesian phones and encodes only missing labels", () => {
 const missing = [{ id: "b", label: "Dokumen B & C", mandatory: false }];
 const url = whatsappMissing("0812 3456-7890", "Pelapor Uji", "Layanan Uji", missing);
 assert.equal(new URL(url).pathname, "/6281234567890");
 assert.equal(whatsappMissing("+62 81234567890", "Pelapor Uji", "Layanan Uji", missing), url);
 assert.match(new URL(url).searchParams.get("text")!, /Dokumen B & C/);
 assert.throws(()=>whatsappMissing("123", "Uji", "Uji", missing));
 assert.throws(()=>whatsappMissing("081234567890", "Uji", "Uji", []));
});
