import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { dataRoot } from "./db";
import { AppError } from "./security";
import { dateID, type Row, type Field } from "@/lib/types";
import { ageOn, terbilang } from "@/lib/formatters";
import { f102ChoiceKeys, f102Values, f102Attachments } from "@/lib/f102";
import { n1StatusValues } from "@/lib/n1";
import { pindahLoopKeys, pindahValues } from "@/lib/pindah";
const exec = promisify(execFile);
export const globalPlaceholders = [
  "status_laki_laki_n1",
  "istri_ke_n1",
  "status_perempuan_n1",
  ...f102ChoiceKeys,
  "nama_kelurahan",
  "alamat_kelurahan",
  "telepon_kelurahan",
  "email_kelurahan",
  "nama_kecamatan",
  "kabupaten_kota",
  "provinsi",
  "kode_pos_kelurahan",
  "nama",
  "nik",
  "no_kk",
  "tempat_lahir",
  "tanggal_lahir",
  "jenis_kelamin",
  "agama",
  "status_perkawinan",
  "pekerjaan",
  "alamat",
  "rt",
  "rw",
  "nomor_surat",
  "tanggal_surat",
  "kode_surat",
  "bulan_romawi",
  "tahun",
  "umur",
  "penghasilan_terbilang",
  "keterangan_pengantar_rt",
  "nama_penandatangan",
  "nip_penandatangan",
  "jabatan_penandatangan",
  "jabatan_detail",
  "nama_surat",
];
export function validateTemplate(
  bytes: Buffer,
  fields: Field[],
  profile?: string,
) {
  if (bytes.length > 10 * 1024 * 1024)
    throw new AppError(400, "Ukuran template maksimal 10 MB.");
  try {
    const zip = new PizZip(bytes);
    let size = 0;
    let content = "";
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const declared = (entry as any)._data?.uncompressedSize || 0;
      size += declared;
      if (size > 30 * 1024 * 1024)
        throw new Error("Template terlalu besar setelah dibuka");
      if (/vbaProject|embeddings\//i.test(name))
        throw new Error("Makro atau objek tertanam tidak diizinkan");
      if (
        name.endsWith(".rels") &&
        /TargetMode="External"/i.test(entry.asText())
      )
        throw new Error("Referensi eksternal tidak diizinkan");
      if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name))
        content += entry.asText().replace(/<[^>]+>/g, "");
    }
    if (!zip.file("word/document.xml")) throw new Error("Bukan dokumen DOCX");
    new Docxtemplater(zip, {
      delimiters: { start: "${", end: "}" },
      paragraphLoop: true,
      linebreaks: true,
    });
    const placeholders = [
      ...new Set([...content.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1])),
    ];
    const available = new Set([
      ...globalPlaceholders,
      ...fields.map((f) => f.key),
      ...(profile === "pindah" ? pindahLoopKeys : []),
    ]);
    const errors = placeholders
      .filter((p) => !available.has(p))
      .map((p) => `Placeholder tidak dikenal: ${p}`);
    for (const p of profile === "ktp" || profile === "pindah"
      ? ["nama", "nik", "no_kk"]
      : profile === "suami-istri"
        ? ["nama_kelurahan", "nomor_surat", "nama_suami", "nama_istri", "nama_penandatangan"]
      : ["nama_kelurahan", "nomor_surat", "nama", "nama_penandatangan"])
      if (!placeholders.includes(p))
        errors.push(`Placeholder wajib tidak ditemukan: ${p}`);
    return { placeholders, errors };
  } catch (e) {
    throw new AppError(
      400,
      e instanceof Error && !("properties" in e)
        ? `Template tidak valid: ${e.message}`
        : "Struktur atau placeholder DOCX tidak valid.",
    );
  }
}
export async function createExampleTemplate(type: Row) {
  const p = (text: string, options: any = {}) =>
    new Paragraph({
      spacing: { after: 160 },
      ...options,
      children: [
        new TextRun({
          text,
          font: "Times New Roman",
          size: 24,
          ...options.run,
        }),
      ],
    });
  const center = { alignment: AlignmentType.CENTER };
  const rows = [
    ["Nama", "${nama}"],
    ["NIK", "${nik}"],
    ["Nomor KK", "${no_kk}"],
    ["Tempat / tanggal lahir", "${tempat_lahir}, ${tanggal_lahir}"],
    ["Jenis kelamin", "${jenis_kelamin}"],
    ["Agama", "${agama}"],
    ["Status perkawinan", "${status_perkawinan}"],
    ["Pekerjaan", "${pekerjaan}"],
    ["Alamat", "${alamat}, RT ${rt} / RW ${rw}"],
  ];
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1417, bottom: 1134, left: 1417 },
          },
        },
        children: [
          p("PEMERINTAH ${kabupaten_kota}", {
            ...center,
            run: { bold: true, size: 28 },
          }),
          p("KECAMATAN ${nama_kecamatan}", {
            ...center,
            run: { bold: true, size: 28 },
          }),
          p("KELURAHAN ${nama_kelurahan}", {
            ...center,
            run: { bold: true, size: 32 },
          }),
          p("${alamat_kelurahan}", center),
          p("Telepon: ${telepon_kelurahan} • Kode Pos ${kode_pos_kelurahan}", {
            ...center,
            border: {
              bottom: {
                color: "000000",
                style: BorderStyle.DOUBLE,
                size: 8,
                space: 8,
              },
            },
          }),
          p(type.name.toUpperCase(), {
            ...center,
            spacing: { before: 240, after: 80 },
            run: { bold: true, underline: {} },
          }),
          p("Nomor: ${nomor_surat}", center),
          p(
            "Yang bertanda tangan di bawah ini, ${jabatan_penandatangan}, Kecamatan ${nama_kecamatan}, ${kabupaten_kota}, menerangkan bahwa:",
          ),
          ...rows.map(([k, v]) => p(`${k} : ${v}`, { spacing: { after: 80 } })),
          p(
            "Berdasarkan data pelayanan kelurahan, dengan ini diberikan keterangan sebagai berikut:",
            { spacing: { before: 160, after: 160 } },
          ),
          ...(type.fields as Field[])
            .filter((f) => f.key !== "catatan")
            .map((f) => p(f.label + " : ${" + f.key + "}")),
          p(
            "Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.",
          ),
          p("${nama_kelurahan}, ${tanggal_surat}", {
            alignment: AlignmentType.RIGHT,
            spacing: { before: 240, after: 120 },
          }),
          p("${jabatan_penandatangan}", { alignment: AlignmentType.RIGHT }),
          p("${nama_penandatangan}", {
            alignment: AlignmentType.RIGHT,
            spacing: { before: 800, after: 80 },
            run: { bold: true, underline: {} },
          }),
          p("NIP. ${nip_penandatangan}", { alignment: AlignmentType.RIGHT }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
export function snapshotValues(s: Row | any, number: string) {
  const r = s.resident,
    v = s.village,
    o = s.official,
    t = s.type;
  const now = new Date(s.date);
  const referenceNumber = String(s.form_data.nomor_pengantar_rt || "").trim();
  const referenceDate = String(s.form_data.tanggal_pengantar_rt || "").trim();
  const formatted: Record<string, unknown> = { ...s.form_data };
  for (const field of t.fields as Field[]) {
    const value = s.form_data[field.key];
    if (value !== undefined && value !== "") {
      if (field.type === "date")
        formatted[field.key] = dateID(String(value), true);
      if (field.type === "number")
        formatted[field.key] = new Intl.NumberFormat("id-ID").format(
          Number(value),
        );
    }
  }
  if (t.slug === "ktp") {
    formatted.nama_petugas =
      String(s.form_data.nama_petugas ?? "").trim() || ".".repeat(35);
  }
  if (t.slug === "tidak-mampu") {
    const desil = String(s.form_data.desil ?? "").trim();
    formatted.desil = desil ? ` ${desil}` : "";
  }
  return {
    ...formatted,
    ...f102Values(s.form_data),
    ...(t.slug === "nikah" ? n1StatusValues(s.form_data, r.gender) : {}),
    ...(t.slug === "pindah" ? pindahValues(s.form_data) : {}),
    keterangan_pengantar_rt: referenceNumber
      ? t.slug === "suami-istri"
        ? `berdasarkan surat pengantar RT RW Nomor: ${referenceNumber}${referenceDate ? ` tanggal ${dateID(referenceDate, true)}` : ""} `
        : t.slug === "tidak-mampu"
          ? `, berdasarkan keterangan Ketua RT.${r.rt} RW.${r.rw} Nomor: ${referenceNumber}${referenceDate ? ` tanggal ${dateID(referenceDate, true)}` : ""}`
        : t.slug === "usaha"
          ? `keterangan Ketua RT.${r.rt} RW.${r.rw} Nomor: ${referenceNumber}${referenceDate ? ` tanggal ${dateID(referenceDate, true)}` : ""} dan `
        : t.slug === "umum"
          ? `, berdasarkan surat keterangan/pengantar dari Ketua RT.${r.rt} RW.${r.rw} Nomor: ${referenceNumber}${referenceDate ? ` tanggal ${dateID(referenceDate, true)}` : ""}`
        : `${t.slug === "belum-menikah" ? " dan berdasarkan keterangan dari Ketua" : " serta berdasarkan Surat Keterangan Ketua dari"} RT.${r.rt} RW.${r.rw} Nomor: ${referenceNumber}${referenceDate ? ` tanggal ${dateID(referenceDate, true)}` : ""}`
      : "",
    penghasilan_terbilang:
      terbilang(Number(s.form_data.penghasilan || 0)) + " rupiah",
    nama_kelurahan: v.name,
    alamat_kelurahan: v.address,
    telepon_kelurahan: v.phone,
    email_kelurahan: v.email,
    nama_kecamatan: v.district,
    kabupaten_kota: v.city,
    provinsi: v.province,
    kode_pos_kelurahan: v.postal_code,
    nama: ["ktp", "pindah"].includes(t.slug) ? String(r.name).toLocaleUpperCase("id-ID") : r.name,
    nik: r.nik,
    no_kk: r.no_kk,
    tempat_lahir: r.birth_place,
    tanggal_lahir: dateID(r.birth_date, true),
    jenis_kelamin: r.gender,
    agama: r.religion,
    status_perkawinan: r.marital_status,
    pekerjaan: r.occupation,
    alamat: r.address,
    rt: r.rt,
    rw: r.rw,
    nomor_surat: number,
    tanggal_surat: dateID(now, true),
    kode_surat: t.code,
    bulan_romawi: [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
    ][
      Number(
        new Intl.DateTimeFormat("en", {
          month: "numeric",
          timeZone: "Asia/Jakarta",
        }).format(now),
      ) - 1
    ],
    tahun: new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(now),
    umur: ageOn(r.birth_date, s.date),
    nama_penandatangan: o.name,
    nip_penandatangan: o.nip,
    jabatan_penandatangan: o.title,
    nama_surat: t.name,
  };
}
export function mergeDOCX(template: Buffer, values: Record<string, unknown>) {
  const zip = new PizZip(template);
  const source = zip.file("word/document.xml");
  if (source) {
    const allowed = new Set(f102Attachments.map(([key]) => key));
    const mark = (block: string) => {
      const key = block.match(/sikepel-f102:(lampiran_[a-z_]+)/)?.[1];
      if (!key || !allowed.has(key as any) || values[key] !== "Ya")
        return block;
      // Reuse the checkmark image already embedded in the supplied F-1.02.
      return block
        .replace(/(<a:blip\b[^>]*\br:embed=")[^"]+/, "$1rId7")
        .replace(/(<v:imagedata\b[^>]*\br:id=")[^"]+/, "$1rId7");
    };
    zip.file(
      "word/document.xml",
      source
        .asText()
        .replace(/<pic:pic\b[\s\S]*?<\/pic:pic>/g, mark)
        .replace(/<v:shape\b[\s\S]*?<\/v:shape>/g, mark),
    );
  }
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "${", end: "}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(values);
  return doc.getZip().generate({ type: "nodebuffer" });
}
export function companionValues(s: Row | any, number: string) {
  const r = s.resident, v = s.village, f = s.form_data || {};
  return {
    ...snapshotValues(s, number),
    nama: r.name,
    nama_bapak: f.nama_bapak || "",
    tempat_lahir: r.birth_place,
    tanggal_lahir: dateID(r.birth_date, true),
    negara_pernyataan: f.negara_pemohon || "Indonesia",
    agama: r.religion,
    alamat: r.address,
    rt: r.rt,
    rw: r.rw,
    nama_kelurahan: v.name,
    nama_kecamatan: v.district,
    status_pernyataan_nikah: f.status_n1 || (r.gender === "Perempuan" ? "Perawan" : "Jejaka"),
    tanggal_surat: dateID(new Date(s.date), true),
  };
}
export interface PdfConverter {
  convert(docx: Buffer): Promise<Buffer>;
}
export class LibreOfficeConverter implements PdfConverter {
  async convert(docx: Buffer) {
    if (process.env.VERCEL === "1") throw new Error("Gunakan PDF_CONVERTER_URL di Vercel");
    const root = path.join(dataRoot(), "temp");
    await fs.mkdir(root, { recursive: true });
    const folder = path.join(root, randomUUID());
    await fs.mkdir(folder);
    try {
      await fs.writeFile(path.join(folder, "surat.docx"), docx);
      const candidates = [
        process.env.LIBREOFFICE_PATH,
        path.resolve(".tools/LibreOffice/program/soffice.exe"),
        "C:/Program Files/LibreOffice/program/soffice.exe",
        "/usr/bin/libreoffice",
      ];
      let binary: string | undefined;
      for (const file of candidates) {
        if (file) {
          try {
            await fs.access(file);
            binary = file;
            break;
          } catch {}
        }
      }
      if (!binary) throw new Error("LibreOffice belum tersedia");
      await exec(
        binary,
        [
          `-env:UserInstallation=${pathToFileURL(path.join(folder, "profile")).href}`,
          "--headless",
          "--nologo",
          "--nodefault",
          "--nofirststartwizard",
          "--convert-to",
          "pdf:writer_pdf_Export",
          "--outdir",
          folder,
          path.join(folder, "surat.docx"),
        ],
        { timeout: 90000, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      const pdf = await fs.readFile(path.join(folder, "surat.pdf"));
      if (pdf.subarray(0, 5).toString() !== "%PDF-")
        throw new Error("Invalid PDF");
      return pdf;
    } finally {
      if (folder.startsWith(root + path.sep))
        await fs.rm(folder, { recursive: true, force: true });
    }
  }
}
export class GotenbergConverter implements PdfConverter {
  async convert(docx: Buffer) {
    const form = new FormData();
    form.append(
      "files",
      new Blob([new Uint8Array(docx)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "surat.docx",
    );
    const authorization = process.env.PDF_CONVERTER_TOKEN
      ? `Bearer ${process.env.PDF_CONVERTER_TOKEN}`
      : process.env.PDF_CONVERTER_USERNAME && process.env.PDF_CONVERTER_PASSWORD
        ? `Basic ${Buffer.from(`${process.env.PDF_CONVERTER_USERNAME}:${process.env.PDF_CONVERTER_PASSWORD}`).toString("base64")}`
        : "";
    if (!authorization)
      throw new Error("Converter authentication is required");
    const r = await fetch(
      `${process.env.PDF_CONVERTER_URL?.replace(/\/$/, "")}/forms/libreoffice/convert`,
      {
        method: "POST",
        body: form,
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(90000),
      },
    );
    if (!r.ok) throw new Error("Converter failed");
    const bytes = Buffer.from(await r.arrayBuffer());
    if (
      bytes.length > (process.env.VERCEL === "1" ? 4 : 20) * 1024 * 1024 ||
      bytes.subarray(0, 5).toString() !== "%PDF-"
    )
      throw new Error("Invalid PDF");
    return bytes;
  }
}
export class ConvertApiConverter implements PdfConverter {
  async convert(docx: Buffer) {
    const form = new FormData();
    form.append("File", new Blob([new Uint8Array(docx)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }), "surat.docx");
    form.append("StoreFile", "false");
    const token = process.env.PDF_CONVERTER_TOKEN;
    if (!token) throw new Error("PDF_CONVERTER_TOKEN wajib diisi untuk ConvertAPI");
    const base = (process.env.PDF_CONVERTER_URL || "https://v2.convertapi.com").replace(/\/$/, "");
    const r = await fetch(`${base}/convert/docx/to/pdf`, {
      method: "POST",
      body: form,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) throw new Error("ConvertAPI conversion failed");
    const payload = await r.json() as { Files?: Array<{ FileData?: string }> };
    const data = payload.Files?.[0]?.FileData;
    if (!data) throw new Error("ConvertAPI tidak mengembalikan PDF");
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > (process.env.VERCEL === "1" ? 4 : 20) * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("Invalid PDF");
    return bytes;
  }
}
export const converter: PdfConverter = process.env.PDF_CONVERTER_URL
  ? process.env.PDF_CONVERTER_PROVIDER === "convertapi" || /convertapi\.com/i.test(process.env.PDF_CONVERTER_URL)
    ? new ConvertApiConverter()
    : new GotenbergConverter()
  : new LibreOfficeConverter();
