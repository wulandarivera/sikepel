export type MovingMember = { nik: string; nama: string; shdk: string };
export const pindahChoiceKeys = ["no_klasifikasi_pindah", "no_alasan_pindah", "no_jenis_pindah", "no_anggota_pindah", "no_keluarga_pindah"];
export const pindahLoopKeys = ["#anggota_pindah", "/anggota_pindah", "urut_anggota", "nik_anggota", "nama_anggota", "shdk_anggota"];
export function pindahValues(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of pindahChoiceKeys) result[key] = String(data[key] ?? "").split(".")[0];
  for (const key of ["alamat_pindah", "kel_pindah", "kec_pindah", "kota_pindah", "provinsi_pindah"])
    result[key] = String(data[key] ?? "").trim().toLocaleUpperCase("id-ID");
  result.anggota_pindah = Array.isArray(data.anggota_pindah) ? data.anggota_pindah.map((m: MovingMember, i: number) => ({
    urut_anggota: i + 1, nik_anggota: m.nik,
    nama_anggota: m.nama.trim().toLocaleUpperCase("id-ID"),
    shdk_anggota: m.shdk.trim().toLocaleUpperCase("id-ID"),
  })) : [];
  return result;
}
