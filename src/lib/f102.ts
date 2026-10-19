export const f102Applications = [
  "KTP baru",
  "Pindah datang",
  "Penggantian hilang",
  "Penggantian rusak",
  "Perpanjangan ITAP",
  "Perubahan status kewarganegaraan",
  "Luar domisili",
  "Transmigrasi",
  "Perubahan data",
];
export const f102Attachments = [
  ["lampiran_kk", "KK lama / KK rusak"],
  ["lampiran_nikah", "Buku nikah / kutipan akta perkawinan"],
  ["lampiran_cerai", "Kutipan akta perceraian"],
  ["lampiran_pindah", "Surat keterangan pindah"],
  ["lampiran_pindah_ln", "Surat keterangan pindah luar negeri"],
  ["lampiran_ktp", "KTP-el rusak / KTP-el daerah asal"],
  ["lampiran_paspor", "Dokumen perjalanan (paspor)"],
  ["lampiran_hilang", "Surat keterangan hilang dari kepolisian"],
  [
    "lampiran_perubahan",
    "Bukti perubahan peristiwa kependudukan / peristiwa penting",
  ],
  ["lampiran_sptjm", "SPTJM perkawinan / perceraian belum tercatat"],
  ["lampiran_kematian", "Akta kematian"],
  ["lampiran_pernyataan", "Pernyataan penyebab hilang atau rusak"],
  ["lampiran_perwakilan", "Surat keterangan pindah dari Perwakilan RI"],
  [
    "lampiran_keluarga",
    "Pernyataan bersedia menerima sebagai anggota keluarga",
  ],
  ["lampiran_pengasuhan", "Surat kuasa pengasuhan anak dari orang tua / wali"],
  ["lampiran_izin_tinggal", "Kartu izin tinggal tetap / terbatas"],
] as const;
export const f102ChoiceKeys = [
  "f102_a",
  "f102_b",
  "f102_c",
  "f102_hilang",
  "f102_rusak",
  "f102_d",
  "f102_e",
  "f102_f",
  "f102_g",
  "f102_perubahan",
];
export function f102Values(form: Record<string, unknown>) {
  const choice = String(form.jenis_permohonan || "");
  const selected = [
    choice === "KTP baru",
    choice === "Pindah datang",
    ["Penggantian hilang", "Penggantian rusak"].includes(choice),
    choice === "Penggantian hilang",
    choice === "Penggantian rusak",
    choice === "Perpanjangan ITAP",
    choice === "Perubahan status kewarganegaraan",
    choice === "Luar domisili",
    choice === "Transmigrasi",
    choice === "Perubahan data",
  ];
  const plain = ["A", "B", "C", "1.", "2.", "D", "E", "F", "G", "B"];
  const circled = ["Ⓐ", "Ⓑ", "Ⓒ", "①", "②", "Ⓓ", "Ⓔ", "Ⓕ", "Ⓖ", "Ⓑ"];
  return Object.fromEntries(
    f102ChoiceKeys.map((key, i) => [key, selected[i] ? circled[i] : plain[i]]),
  );
}
