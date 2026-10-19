export type Requirement = { id: string; label: string; mandatory: boolean };
// getRandomValues is available on plain HTTP; randomUUID requires a secure context.
// These IDs identify checklist entries, not credentials or authorization tokens.
export function createRequirementId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function missingRequirements(requirements: Requirement[] = [], checks: Record<string, unknown> = {}) {
  return requirements.filter((r) => checks[r.id] !== true);
}
export function requirementsComplete(requirements: Requirement[] = [], checks: Record<string, unknown> = {}) {
  return !missingRequirements(requirements, checks).some((r) => r.mandatory);
}
type RequirementDetailLetter = {
  status: string;
  type?: { requirements?: Requirement[] };
  form_data?: { requirement_checks?: Record<string, unknown> };
  snapshot?: { requirements?: Requirement[]; form_data?: { requirement_checks?: Record<string, unknown> } } | null;
};
export function requirementDetail(letter: RequirementDetailLetter) {
  const draft = ["DRAFT", "PREVIEW"].includes(letter.status);
  const requirements = (draft ? letter.type?.requirements : letter.snapshot?.requirements) || [];
  const checks = (draft ? letter.form_data?.requirement_checks : letter.snapshot?.form_data?.requirement_checks) || {};
  const missing = missingRequirements(requirements, checks);
  const mandatory = requirements.filter(r => r.mandatory);
  return { requirements, missing, completed: requirements.length - missing.length,
    mandatoryCompleted: mandatory.length - missing.filter(r => r.mandatory).length,
    mandatoryTotal: mandatory.length, complete: requirements.length ? requirementsComplete(requirements, checks) : null, source: draft ? "current" : "snapshot" };
}
export function whatsappMissing(phone: string, name: string, type: string, missing: Requirement[]) {
  let number = phone.trim().replace(/[\s()-]/g, "").replace(/^\+/, "");
  if (number.startsWith("08")) number = "62" + number.slice(1);
  if (!/^628\d{7,11}$/.test(number)) throw new Error("Isi nomor WhatsApp pelapor Indonesia yang valid (08 atau +62).");
  if (!missing.length) throw new Error("Tidak ada persyaratan yang kurang.");
  const message = `Yth. ${name}, untuk layanan ${type}, mohon lengkapi persyaratan berikut:\n${missing.map((r) => `- ${r.label}`).join("\n")}\nTerima kasih.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
