export const n1Statuses = ["Jejaka", "Duda", "Beristri", "Perawan", "Janda"];
export function n1StatusOptions(gender: string) {
  return gender === "Laki-laki" ? n1Statuses.slice(0, 3) : gender === "Perempuan" ? n1Statuses.slice(3) : [];
}
export function n1StatusValues(form: Record<string, unknown>, gender: string) {
  const status = String(form.status_n1 ?? "");
  return {
    status_laki_laki_n1: gender === "Laki-laki" ? status : "-",
    istri_ke_n1: gender === "Laki-laki" && status === "Beristri" ? String(form.istri_ke ?? "") : "-",
    status_perempuan_n1: gender === "Perempuan" ? status : "-",
  };
}
