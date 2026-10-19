import { z } from "zod";
import { AppError } from "./security";
import type { Field } from "@/lib/types";
import { n1StatusOptions } from "@/lib/n1";
const text = z.string().trim().min(1, "Wajib diisi").max(500);
export function validatePindah(data: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const key of ["rt_pindah", "rw_pindah"]) {
    const val = String(data[key] ?? "").trim();
    if (val && !/^\d{1,3}$/.test(val)) errors[key] = "Isi 1–3 digit.";
  }
  const pos = String(data.pos_pindah ?? "").trim();
  if (pos && !/^\d{5}$/.test(pos)) errors.pos_pindah = "Kode pos harus 5 digit.";
  const members = data.anggota_pindah;
  if (members !== undefined && members !== null && Array.isArray(members) && members.length > 0) {
    if (members.length > 20) {
      errors.anggota_pindah = "Maksimal 20 anggota keluarga yang pindah.";
    } else {
      const seen = new Set<string>();
      members.forEach((m, index) => {
        for (const key of ["nik", "nama", "shdk"]) {
          const value = m && typeof m[key] === "string" ? m[key].trim() : "";
          if (value && key === "nik" && !/^\d{16}$/.test(value))
            errors[`anggota_pindah.${index}.${key}`] = "NIK harus 16 digit.";
          else if (value && value.length > 100)
            errors[`anggota_pindah.${index}.${key}`] = "Maksimal 100 karakter.";
        }
        if (m?.nik && seen.has(m.nik)) errors[`anggota_pindah.${index}.nik`] = "NIK anggota tidak boleh duplikat.";
        if (m?.nik) seen.add(m.nik);
      });
    }
  }
  if (Object.keys(errors).length) throw new AppError(400, "Periksa data kepindahan.", errors);
}
export function validateN1(data: Record<string, unknown>, gender: string) {
  const errors: Record<string, string> = {};
  const statusN1 = String(data.status_n1 ?? "").trim();
  if (statusN1 && !n1StatusOptions(gender).includes(statusN1))
    errors.status_n1 = "Pilih status perkawinan sesuai jenis kelamin pemohon.";
  if (data.status_n1 === "Beristri" && data.istri_ke && !/^[1-9]\d*$/.test(String(data.istri_ke ?? "")))
    errors.istri_ke = "Isi urutan istri dengan bilangan bulat mulai dari 1.";
  for (const key of ["nik_bapak", "nik_ibu"]) {
    const val = String(data[key] ?? "").trim();
    if (val && !/^\d{16}$/.test(val)) errors[key] = "NIK harus terdiri dari 16 digit.";
  }
  if (Object.keys(errors).length) throw new AppError(400, "Periksa data formulir N1.", errors);
}
export const residentSchema = z.object({
  nik: z.string().regex(/^\d{16}$/, "NIK harus terdiri dari 16 digit"),
  name: text,
  no_kk: z.string().regex(/^\d{16}$/, "Nomor KK harus terdiri dari 16 digit"),
  birth_place: text,
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal lahir wajib diisi")
    .refine(
      (v) =>
        !isNaN(Date.parse(v)) && v <= new Date().toISOString().slice(0, 10),
      "Tanggal lahir tidak valid",
    ),
  gender: z.enum(["Laki-laki", "Perempuan"]),
  religion: text,
  marital_status: text,
  occupation: text,
  address: text,
  rt: z.string().regex(/^\d{1,3}$/, "RT berupa 1–3 digit"),
  rw: z.string().regex(/^\d{1,3}$/, "RW berupa 1–3 digit"),
});
export const villageSchema = z.object({
  name: text,
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,15}$/),
  active: z.boolean().default(true),
  district: text,
  city: text,
  province: text,
  address: text,
  phone: z.string().max(40),
  email: z.union([z.email(), z.literal("")]),
  postal_code: z.string().regex(/^\d{5}$/, "Kode pos 5 digit"),
});
export const officialSchema = z
  .object({
    name: text,
    nip: z.string().regex(/^\d{18}$/, "NIP harus 18 digit"),
    title: text,
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().default(""),
    active: z.boolean().default(true),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    message: "Tanggal selesai harus setelah tanggal mulai",
    path: ["end_date"],
  });
export const fieldsSchema = z
  .array(
    z.object({
      key: z.string().regex(/^[a-z][a-z0-9_]*$/),
      label: text,
      type: z.enum([
        "text",
        "textarea",
        "number",
        "date",
        "select",
        "checkbox",
      ]),
      required: z.boolean(),
      options: z.array(z.string().min(1).max(100)).optional(),
    }),
  )
  .max(40)
  .refine(
    (a) => new Set(a.map((f) => f.key)).size === a.length,
    "Kunci field tidak boleh duplikat",
  )
  .refine(
    (a) => a.every((f) => f.type !== "select" || !!f.options?.length),
    "Pilihan wajib memiliki opsi",
  );
export const typeSchema = z.object({
  name: text,
  code: z
    .string()
    .trim()
    .min(1, "Kode klasifikasi wajib diisi")
    .max(30, "Kode klasifikasi maksimal 30 karakter")
    .regex(
      /^[A-Za-z0-9./_-]+$/,
      "Kode klasifikasi dapat memuat angka, huruf, dan simbol pemisah seperti titik (contoh: 400.8.2.7)",
    ),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: text,
  description: z.string().max(1000),
  active: z.boolean(),
  fields: fieldsSchema,
});
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const e of r.error.issues) fields[e.path.join(".")] = e.message;
    throw new AppError(400, "Periksa kembali data yang Anda isi.", fields);
  }
  return r.data;
}
export function validateFields(fields: Field[], data: Record<string, unknown>, options?: { allowEmptyRequired?: boolean }) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = data[f.key];
    if (
      !options?.allowEmptyRequired &&
      f.required &&
      (v === undefined || v === null || String(v).trim() === "")
    )
      errors[f.key] = `${f.label} wajib diisi`;
    else if (v !== undefined && v !== null && v !== "") {
      if (String(v).length > 2000) errors[f.key] = "Maksimal 2.000 karakter";
      if (
        f.type === "number" &&
        (!Number.isFinite(Number(v)) ||
          Number(v) < 0 ||
          Number(v) > Number.MAX_SAFE_INTEGER)
      )
        errors[f.key] =
          "Masukkan angka nol atau lebih, maksimal 9.007.199.254.740.991";
      if (
        f.type === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || isNaN(Date.parse(String(v))))
      )
        errors[f.key] = "Tanggal tidak valid";
      if (f.type === "select" && !f.options?.includes(String(v)))
        errors[f.key] = "Pilihan tidak valid";
      if (f.type === "checkbox" && v !== "Ya")
        errors[f.key] = "Pilihan lampiran tidak valid";
      if (f.key === "email" && !z.email().safeParse(String(v)).success)
        errors[f.key] = "Alamat email tidak valid";
      if (
        f.key === "nomor_handphone" &&
        !/^\+?[0-9 ()-]{7,25}$/.test(String(v))
      )
        errors[f.key] = "Nomor handphone tidak valid";
    }
  }
  if (
    data.berlaku_mulai &&
    data.berlaku_sampai &&
    String(data.berlaku_sampai) < String(data.berlaku_mulai)
  )
    errors.berlaku_sampai = "Tanggal selesai harus setelah tanggal mulai";
  if (Object.keys(errors).length)
    throw new AppError(
      400,
      "Lengkapi data surat sebelum pratinjau atau penerbitan.",
      errors,
    );
}
