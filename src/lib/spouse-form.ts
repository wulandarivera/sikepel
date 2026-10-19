import type { Row } from "./types";

export function spouseDefaults(resident: Row, village?: Row): Record<string, string> {
  const side = resident.gender === "Laki-laki" ? "suami" : resident.gender === "Perempuan" ? "istri" : null;
  if (!side) return {};
  const values = {
    nama: resident.name,
    tempat_lahir: resident.birth_place,
    tanggal_lahir: resident.birth_date,
    pekerjaan: resident.occupation,
    agama: resident.religion,
    alamat: resident.address,
    rt: resident.rt,
    rw: resident.rw,
    kel: village?.name,
    kec: village?.district,
    kota: village?.city,
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`${key}_${side}`, String(value ?? "")]));
}
