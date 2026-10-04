export type Requirement = { id: string; label: string; mandatory: boolean };
export function missingRequirements(requirements: Requirement[] = [], checks: Record<string, unknown> = {}) {
  return requirements.filter((r) => checks[r.id] !== true);
}
export function requirementsComplete(requirements: Requirement[] = [], checks: Record<string, unknown> = {}) {
  return !missingRequirements(requirements, checks).some((r) => r.mandatory);
}
export function whatsappMissing(phone: string, name: string, type: string, missing: Requirement[]) {
  let number = phone.trim().replace(/[\s()-]/g, "").replace(/^\+/, "");
  if (number.startsWith("08")) number = "62" + number.slice(1);
  if (!/^628\d{7,11}$/.test(number)) throw new Error("Isi nomor WhatsApp pelapor Indonesia yang valid (08 atau +62).");
  if (!missing.length) throw new Error("Tidak ada persyaratan yang kurang.");
  const message = `Yth. ${name}, untuk layanan ${type}, mohon lengkapi persyaratan berikut:\n${missing.map((r) => `- ${r.label}`).join("\n")}\nTerima kasih.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
