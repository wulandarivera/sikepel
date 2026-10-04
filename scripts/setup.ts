import fs from "node:fs/promises";
import path from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {getDB,one,dataRoot} from "../src/server/db";
import {initializeSetup} from "../src/server/setup";
import {createExampleTemplate,validateTemplate} from "../src/server/documents";
import {storage} from "../src/server/storage";
import type {Field} from "../src/lib/types";
async function main(){
 if(process.env.DATABASE_URL || process.env.VERCEL==='1') throw new Error('Gunakan inisialisasi cloud untuk deployment cloud.');
 await fs.mkdir(dataRoot(),{recursive:true,mode:0o700});
 const db=await getDB();
 try {
 await db.exec(await fs.readFile('migrations/001_core.sql','utf8'));
 const tokenPath=path.join(dataRoot(),'SETUP-TOKEN.txt');
 let token:string;
 try {token=(await fs.readFile(tokenPath,'utf8')).trim();} catch(e:any){if(e.code!=='ENOENT') throw e; token=randomBytes(9).toString('base64url').slice(0,12); await fs.writeFile(tokenPath,token+'\n',{mode:0o600,flag:'wx'});}
 await fs.chmod(tokenPath,0o600);
 await initializeSetup(db,token);
 if(!await one(db,'SELECT id FROM letter_types LIMIT 1')) await db.transaction(async tx=>{
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
          null,
        ],
      );
    }
 await tx.query("INSERT INTO settings(id,data) VALUES('global',$1) ON CONFLICT(id) DO NOTHING",[JSON.stringify({timezone:'Asia/Jakarta'})]);
 });
 console.log('Schema dan template siap. Buka /setup; token lokal: '+tokenPath);
 } finally {await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
