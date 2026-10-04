import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { getDB, one, dataRoot } from "../src/server/db";
import { hashPassword } from "../src/server/security";
import {
  createExampleTemplate,
  validateTemplate,
} from "../src/server/documents";
import { storage } from "../src/server/storage";
import type { Field } from "../src/lib/types";

async function main() {
  if (!process.env.SIKEPEL_TEST_FIXTURES || !process.env.SIKEPEL_DATA_DIR || !path.basename(process.env.SIKEPEL_DATA_DIR).startsWith("test-")) throw new Error("Fixtures require an isolated test directory");
  if (process.env.VERCEL === "1" || process.env.DATABASE_URL)
    throw new Error("Setup contoh hanya untuk lokal. Gunakan npm run cloud:init untuk database cloud baru.");
  const db = await getDB();
  await db.exec(await fs.readFile("migrations/001_core.sql", "utf8"));
  if (await one(db, "SELECT id FROM users LIMIT 1")) {
    console.log("Database sudah tersedia. Data yang ada dipertahankan.");
    await db.close();
    return;
  }
  const password = randomBytes(32).toString("hex");
  const passwordHash = hashPassword(password);
  const ids: Record<string, string> = {};
  await db.transaction(async (tx) => {
    for (const [name, code] of [
      ["Sukamaju", "SKM"],
      ["Sukamurni", "SKN"],
    ]) {
      const id = randomUUID();
      ids[name] = id;
      await tx.query(
        "INSERT INTO villages(id,name,code,data) VALUES($1,$2,$3,$4)",
        [
          id,
          name,
          code,
          JSON.stringify({
            district: "Sejahtera",
            city: "Kota Sejahtera",
            province: "Banten",
            address: `Jl. Pelayanan No. ${code === "SKM" ? 1 : 2}, ${name}`,
            phone: "021-5550100",
            email: "",
            postal_code: "15138",
          }),
        ],
      );
      await tx.query(
        "INSERT INTO officials(id,village_id,name,data) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          id,
          name === "Sukamaju" ? "Drs. H. Agus Setiawan" : "Dra. Ratna Puspita",
          JSON.stringify({
            nip:
              name === "Sukamaju" ? "197508172005011001" : "197803122006042001",
            title: `Lurah ${name}`,
            start_date: "2025-01-01",
            end_date: "",
          }),
        ],
      );
    }
    for (const [username, name, role, village] of [
      ["admin", "Admin Kecamatan", "SUPER_ADMIN", ""],
      ["admin.kelurahan", "Siti Rahmawati", "ADMIN", "Sukamaju"],
      ["operator", "Budi Santoso", "OPERATOR", "Sukamaju"],
      ["pimpinan", "Agus Setiawan", "PIMPINAN", "Sukamaju"],
      ["operator.b", "Rina Wulandari", "OPERATOR", "Sukamurni"],
    ]) {
      const id = randomUUID();
      ids[username] = id;
      await tx.query(
        "INSERT INTO users(id,village_id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5,$6)",
        [id, ids[village] || null, name, username, passwordHash, role],
      );
    }
    const required = (
      key: string,
      label: string,
      type: Field["type"] = "text",
    ): Field => ({ key, label, type, required: true });
    const common = required("keperluan", "Keperluan surat", "textarea");
    const types = [
      [
        "umum", "Surat Keterangan Umum", "470", "Kependudukan",
        "Keterangan penduduk dan tempat tinggal untuk peruntukan yang diisi petugas sesuai template kelurahan.",
        [common],
      ],
      [
        "usaha", "Surat Keterangan Usaha", "503", "Usaha",
        "Keterangan kepemilikan usaha beserta jenis, nama, dan alamat usaha sesuai template kelurahan.",
        [common],
      ],
      [
        "domisili",
        "Surat Keterangan Domisili",
        "470",
        "Kependudukan",
        "Keterangan domisili atau tempat tinggal penduduk di wilayah kelurahan.",
        [
          common,
          required("alamat_domisili", "Alamat domisili", "textarea"),
          required("berlaku_mulai", "Berlaku mulai", "date"),
          required("berlaku_sampai", "Berlaku sampai", "date"),
        ],
      ],
      [
        "tidak-mampu",
        "Surat Keterangan Tidak Mampu",
        "460",
        "Sosial",
        "Keterangan untuk keperluan bantuan sosial, pendidikan, dan layanan publik.",
        [
          common,
          required("penghasilan", "Penghasilan per bulan (Rp)", "number"),
        ],
      ],
      [
        "penghasilan",
        "Surat Keterangan Penghasilan",
        "501",
        "Usaha",
        "Keterangan besaran penghasilan untuk keperluan administratif.",
        [
          common,
          required("penghasilan", "Penghasilan per bulan (Rp)", "number"),
          required("sumber_penghasilan", "Sumber penghasilan"),
        ],
      ],
      [
        "belum-memiliki-rumah",
        "Surat Keterangan Belum Memiliki Rumah",
        "470",
        "Kependudukan",
        "Keterangan bahwa penduduk belum memiliki rumah di wilayah kelurahan.",
        [common],
      ],
      [
        "belum-menikah",
        "Surat Keterangan Belum Menikah",
        "470",
        "Kependudukan",
        "Keterangan belum pernah menikah untuk keperluan administrasi sesuai template kelurahan.",
        [common],
      ],
      [
        "suami-istri",
        "Surat Keterangan Suami Istri",
        "470",
        "Kependudukan",
        "Keterangan pasangan suami istri yang menikah secara agama, sesuai template kelurahan.",
        [common],
      ],
      [
        "pindah",
        "Surat Pindah",
        "472",
        "Kependudukan",
        "Formulir F-1.03 untuk perpindahan penduduk dalam negeri beserta daftar keluarga yang pindah.",
        [
          common,
          required("alamat_tujuan", "Alamat tujuan", "textarea"),
          required("tanggal_pindah", "Tanggal pindah", "date"),
        ],
      ],
      [
        "ktp",
        "Formulir KTP",
        "470",
        "Kependudukan",
        "Formulir F-1.02 untuk permohonan KTP-el dan pilihan dokumen persyaratan.",
        [
          common,
          {
            ...required("jenis_permohonan", "Jenis permohonan", "select"),
            options: [
              "KTP baru",
              "Perubahan data",
              "Penggantian hilang",
              "Penggantian rusak",
            ],
          },
        ],
      ],
      [
        "nikah",
        "Surat Pengantar Nikah (N1)",
        "474",
        "Lainnya",
        "Surat pengantar untuk keperluan pendaftaran pernikahan di KUA.",
        [
          common,
          required("nama_pasangan", "Nama calon pasangan"),
          required("tanggal_nikah", "Rencana tanggal pernikahan", "date"),
          required("kua_tujuan", "KUA tujuan"),
        ],
      ],
    ] as const;
    for (const [slug, name, code, category, description, baseFields] of types) {
      const id = randomUUID(),
        tid = randomUUID();
      const fields = ["belum-memiliki-rumah", "belum-menikah", "suami-istri", "ktp", "nikah", "tidak-mampu", "usaha", "umum", "pindah"].includes(slug)
        ? JSON.parse(await fs.readFile(`templates/${slug}.fields.json`, "utf8"))
        : [
            ...baseFields,
            {
              key: "catatan",
              label: "Catatan petugas (tidak tercetak)",
              type: "textarea",
              required: false,
            },
          ];
      const type = { id, slug, name, code, category, description, fields };
      const bytes = ["belum-memiliki-rumah", "belum-menikah", "suami-istri", "ktp", "nikah", "tidak-mampu", "usaha", "umum", "pindah"].includes(slug)
        ? await fs.readFile(`templates/${slug}.docx`)
        : await createExampleTemplate(type);
      const validation = validateTemplate(bytes, fields as Field[], slug);
      const key = `templates/${slug}/${tid}.docx`;
      await storage.put(key, bytes);
      await tx.query(
        "INSERT INTO letter_types(id,name,code,slug,category,description,fields) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, name, code, slug, category, description, JSON.stringify(fields)],
      );
      await tx.query(
        "INSERT INTO templates(id,type_id,version,storage_path,file_name,placeholders,errors,active,created_by) VALUES($1,$2,1,$3,$4,$5,$6,true,$7)",
        [
          tid,
          id,
          key,
          slug === "belum-memiliki-rumah"
            ? "Belum Memiliki Rumah.docx"
            : slug === "belum-menikah"
              ? "Keterangan Belum Menikah.docx"
            : slug === "suami-istri"
              ? "Keterangan Suami Istri.docx"
            : slug === "ktp"
              ? "F-102.docx"
              : slug === "nikah" ? "N1.docx" : slug === "tidak-mampu" ? "SKTM.docx" : slug === "usaha" ? "SKU.docx" : slug === "umum" ? "UMUM.docx" : slug === "pindah" ? "Pindah.docx" : `${slug}-contoh-v1.docx`,
          JSON.stringify(validation.placeholders),
          JSON.stringify(validation.errors),
          ids.admin,
        ],
      );
    }
    const names = [
      "Ahmad Maulana",
      "Siti Nurhaliza",
      "Rudi Hartono",
      "Dewi Lestari",
      "Agus Setiawan",
      "Nur Aisyah",
      "Bambang Saputra",
      "Fitri Handayani",
      "Dedi Kurniawan",
      "Rina Marlina",
      "Andi Pratama",
      "Lina Susanti",
    ];
    for (const [index, name] of names.entries()) {
      await tx.query(
        "INSERT INTO residents(id,village_id,nik,name,data,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          ids.Sukamaju,
          "000000000000" + String(index + 1).padStart(4, "0"),
          name,
          JSON.stringify({
            no_kk: "000000000000" + String(index + 101).padStart(4, "0"),
            birth_place: "Tangerang",
            birth_date: `${1985 + index}-03-12`,
            gender: index % 2 ? "Perempuan" : "Laki-laki",
            religion: "Islam",
            marital_status: "Kawin",
            occupation: index % 3 ? "Karyawan Swasta" : "Wiraswasta",
            address: `Jl. Melati No. ${index + 12}`,
            rt: "003",
            rw: "001",
          }),
          ids.operator,
        ],
      );
    }
    await tx.query(
      "INSERT INTO residents(id,village_id,nik,name,data,created_by) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        ids.Sukamurni,
        "0000000000009001",
        "Penduduk Kelurahan Sukamurni",
        JSON.stringify({
          no_kk: "0000000000009101",
          birth_place: "Tangerang",
          birth_date: "1990-01-01",
          gender: "Laki-laki",
          religion: "Islam",
          marital_status: "Kawin",
          occupation: "Wiraswasta",
          address: "Jl. Sukamurni No. 1",
          rt: "001",
          rw: "001",
        }),
        ids["operator.b"],
      ],
    );
    await tx.query("INSERT INTO settings(id,data) VALUES('global',$1)", [
      JSON.stringify({
        district: "Sejahtera",
        city: "Kota Sejahtera",
        timezone: "Asia/Jakarta",
      }),
    ]);
  });
  const access = `SIKEPEL — AKSES LOKAL\n\nAlamat: http://localhost:3000\nKata sandi semua akun contoh: ${password}\n\noperator — Operator Sukamaju\nadmin.kelurahan — Admin Kelurahan Sukamaju\nadmin — Super Admin Kecamatan\npimpinan — Pimpinan Sukamaju (baca saja)\noperator.b — Operator Sukamurni (uji isolasi)\n\nData penduduk dan identitas pemerintah merupakan contoh untuk pengujian lokal.\nTemplate awal dibuat berdasarkan spesifikasi, bukan formulir resmi instansi.\nUbah kata sandi melalui Profil Saya. Jangan bagikan folder .data.\n`;
  await fs.writeFile(path.join(dataRoot(), "AKSES-LOKAL.txt"), access);
  console.log("Setup selesai. Akun tersimpan di .data/AKSES-LOKAL.txt");
  await db.close();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
