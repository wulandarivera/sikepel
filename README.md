# SIKEPEL v1 — aplikasi lokal

Aplikasi pelayanan kelurahan berdasarkan empat dokumen spesifikasi, sepuluh mockup, dan tujuh aset pada folder Google Drive PROJECT SIKEPEL. Versi ini berjalan di komputer lokal sesuai arahan pemilik proyek. Belum dipublikasikan ke internet.

## Membuka aplikasi

1. Jalankan **Jalankan SIKEPEL.cmd** dari folder proyek, jika server belum berjalan.
2. Buka **http://127.0.0.1:3000**.
3. Buka **.data/AKSES-LOKAL.txt** untuk melihat kata sandi awal yang dibuat secara acak.
4. Masuk dengan `operator` untuk pelayanan, atau `admin` untuk administrasi kecamatan.

Jangan menjalankan dua server yang menggunakan folder database lokal yang sama. Tutup server dengan Ctrl+C sebelum menjalankan ulang. Data tersimpan di `.data`, tidak hilang saat tab browser atau server ditutup.

| Username awal   | Peran                            | Kelurahan                               |
| --------------- | -------------------------------- | --------------------------------------- |
| operator        | Operator                         | Sukamaju                                |
| admin.kelurahan | Admin Kelurahan                  | Sukamaju                                |
| admin           | Super Admin Kecamatan            | Pilih lingkup pada bagian atas aplikasi |
| pimpinan        | Pimpinan, baca arsip dan laporan | Sukamaju                                |
| operator.b      | Operator untuk pengujian isolasi | Sukamurni                               |

Kata sandi dapat diubah melalui **Profil Saya**. Administrator dapat mengatur ulang kata sandi pengguna melalui **Pengguna → Edit**. Mengubah peran, kata sandi, atau menonaktifkan akun mencabut sesi yang relevan.

## Alur pelayanan

**Dashboard → Buat Pelayanan → Pilih jenis surat → Cari / tambah penduduk → Isi data surat → Preview → Konfirmasi Terbitkan → PDF dan arsip.**

- Simpan Draft tidak mengambil nomor resmi dan tidak mensyaratkan semua isian final.
- NIK dan nomor KK disimpan sebagai teks 16 digit. Data lokal tidak diklaim terverifikasi Dukcapil.
- Preview dan penerbitan memakai template DOCX, Docxtemplater, dan LibreOffice yang sama.
- Jika penduduk, pejabat, jenis surat, atau template berubah setelah preview, penerbitan meminta preview ulang.
- Penerbitan mengalokasikan nomor di transaksi PostgreSQL dengan counter per kelurahan, jenis surat, dan tahun.
- Kegagalan PDF mempertahankan nomor. Pilih **Coba Lagi**, bukan membuat surat pengganti.
- Surat terbit menyimpan snapshot penduduk, kelurahan, pejabat, formulir, dan versi template. Cetak ulang memakai PDF tersimpan.
- Pembatalan memerlukan Admin dan alasan. Nomor tidak digunakan ulang.
- PDF ditampilkan dengan PDF.js di dalam aplikasi. Tombol Print menyiapkan semua halaman; Download menyimpan PDF asli.

## Fitur tersedia

- Login, sesi HttpOnly, logout, pembatasan percobaan masuk, penggantian kata sandi.
- Empat peran dan isolasi data kelurahan pada server; scope eksplisit untuk Super Admin.
- Dashboard dari data aktual, grafik enam bulan, status draft/pending, surat terbaru.
- Data penduduk: pencarian, pagination, tambah/edit, detail, dan riwayat surat.
- Tujuh jenis layanan contoh dengan formulir dinamis serta pemilihan penandatangan.
- Draft, preview PDF, konfirmasi penerbitan, retry idempotent, arsip, unduh, cetak, pembatalan.
- Kelurahan, pejabat, pengguna, status aktif/nonaktif.
- Jenis surat: metadata, kategori, definisi field, tipe, pilihan, wajib/tidak, urutan field.
- Template DOCX: upload versi baru, validasi placeholder, aktivasi satu versi, unduh versi lama.
- Super Admin dapat menghapus versi melalui Template Global → Hapus → konfirmasi. Versi tersebut hilang dari daftar dan tidak dapat diaktifkan lagi. Jika versi aktif dihapus, aktifkan versi pengganti untuk pelayanan baru. Sumber template tetap disimpan bagi arsip dan retry surat yang sedang diproses; urutan versi tidak digunakan ulang. Penghapusan dicatat di Audit Log.
- Audit aktivitas, laporan per jenis/kelurahan dan periode, ekspor CSV agregat.
- Identitas global, penyesuaian counter dengan alasan, profil pengguna.
- Tampilan desktop dan seluler; tabel dapat digeser di dalam kontainernya; dialog memakai Radix UI untuk pengelolaan fokus.

## Data contoh dan template

Nama pemerintah, penduduk, NIK, pejabat, kontak, serta identitas kelurahan awal adalah contoh lokal. NIK contoh sengaja memakai awalan nol. Statistik dashboard dihitung dari database, bukan angka statis pada mockup.

Folder Drive belum menyertakan template surat DOCX resmi. Template awal dibuat sebagai **contoh untuk pengujian alur**, termasuk contoh layanan berlabel N1/KTP; template tersebut belum merupakan formulir resmi instansi. Ganti melalui Template Global dengan format dan bahasa yang disetujui instansi. Surat tidak ditambahi watermark DATA DEMONSTRASI, mengikuti spesifikasi.

Surat Keterangan Belum Memiliki Rumah telah disesuaikan dengan DOCX yang diberikan pengguna pada 8 September 2026. Template pada `templates/belum-memiliki-rumah.docx` mempertahankan kop Kota Tangerang/Kecamatan Cibodas, logo, redaksi dan susunan tanda tangan. Formulir menambahkan kewarganegaraan, nomor/tanggal pengantar RT/RW, peruntukan, serta keterangan jabatan opsional. Nomor dan tanggal pengantar bersifat opsional: nomor diisi akan dicetak dengan format Nomor: diikuti nilainya; nomor kosong menghilangkan seluruh rujukan pengantar beserta tanggalnya. Identitas penduduk/kelurahan/pejabat tetap berasal dari data yang dipilih; data master awal masih contoh dan perlu disesuaikan sebelum pelayanan sebenarnya. Template ini juga digunakan saat setup instalasi baru.

Beberapa gambar mockup menampilkan menu admin pada akun operator, nomor resmi di preview, atau keterangan tanda tangan elektronik. Implementasi mengikuti aturan eksplisit pada PRD: menu sesuai peran, preview belum bernomor, dan tidak mengklaim tanda tangan elektronik, Dukcapil, atau portal pengajuan warga. Aset banner dan pengajuan warga disimpan untuk kebutuhan masa depan dan tidak dipakai sebagai fitur aktif.

## Teknologi dan berkas

Formulir KTP menggunakan F-1.02 dari file `F-102.docx` pengguna. Tata letak Legal (8,5 × 14 inci), tabel, kotak data dan bagian tanda tangan dipertahankan. Nama, NIK, nomor KK dan tanggal terisi otomatis. Nomor handphone, email, dan nama petugas opsional. Jika nama petugas dikosongkan, bagian tanda tangan menampilkan titik-titik sesuai template. Pilih permohonan KTP-el dan centang dokumen yang benar-benar dilampirkan. Kolom KK/KIA tetap tercetak sesuai sumber, tetapi layanan ini mengisi pilihan KTP-el saja. Nomor surat dikelola untuk arsip aplikasi dan tidak ditambahkan pada formulir yang tidak memiliki slot nomor. Cetak mengikuti ukuran asli PDF; pilih kertas Legal pada printer.

- Next.js App Router, React, TypeScript, Tailwind CSS; komponen UI lokal dengan Radix/shadcn patterns.
- PostgreSQL embedded melalui PGlite untuk penyimpanan lokal tanpa Docker.
- Adapter `pg` untuk PostgreSQL eksternal; adapter penyimpanan filesystem atau Supabase private bucket; adapter converter LibreOffice atau Gotenberg.
- Password di-hash dengan scrypt. Sesi token acak disimpan sebagai hash di database, cookie HttpOnly/SameSite Strict.
- SQL migration ada di `migrations/001_core.sql`; aturan domain ada di `src/server/letters.ts`.
- Database: `.data/postgres`; arsip/template: `.data/storage`; file kerja converter: `.data/temp` (dibersihkan setelah proses).
- LibreOffice lokal: `.tools/LibreOffice/program/soffice.exe`. Paket sumbernya berasal dari The Document Foundation, versi 26.8.0, dengan SHA-256 yang diverifikasi sebelum diekstrak.
- Aset runtime: `public/assets/*.webp`; salinan asli PNG dan mockup ada di `public/assets` dan `reference/mockups`.
- Salinan teks empat spesifikasi ada di `reference/`.

## Menyiapkan ulang pada komputer lain

Memerlukan Node.js 22.13 atau lebih baru dan LibreOffice. Salin proyek beserta `.tools/LibreOffice` bila menggunakan converter portabel yang sudah disiapkan, atau atur `LIBREOFFICE_PATH` untuk instalasi LibreOffice setempat.

```powershell
npm ci
npm run setup
npm run build
npm start
```

Setup tidak menimpa akun/data bila database sudah terisi. Untuk pengembangan, gunakan `npm run dev`. `npm ci` menyalin worker PDF.js ke folder publik melalui postinstall. Tidak ada aset yang diambil dari Google Drive saat aplikasi dijalankan.

## Pengujian

```powershell
npm run typecheck
npm test
npm run build
npm run test:browser
```

Pengujian inti membuat database terpisah di `.data/test-*`, menguji autentikasi, origin, isolasi tenant, validasi NIK, peran, preview PDF nyata, penerbitan bersamaan, idempotensi, kegagalan converter/retry, snapshot historis, versioning/validasi template, pembatalan, perubahan setelah preview, formatter, dan pencabutan sesi.

Pengujian browser memerlukan Microsoft Edge serta server lokal yang berjalan. Ia menggunakan akun contoh lokal dan menambahkan satu surat contoh untuk memeriksa seluruh alur. Screenshot serta hasilnya disimpan di `reference/verification`. Jangan menjalankan tes browser pada lingkungan operasional.

## Backup dan pemulihan lokal

1. Hentikan server dengan Ctrl+C; pastikan proses konversi sudah selesai.
2. Salin seluruh folder `.data` ke lokasi backup pribadi. Database, template, PDF, dan akun perlu dicadangkan bersama.
3. Untuk memulihkan, pastikan aplikasi berhenti, simpan dahulu folder data yang ada sebagai backup terpisah, lalu pulihkan salinan `.data` yang dipilih.
4. Jalankan aplikasi dan periksa login, jumlah arsip, serta satu PDF historis.

Folder `.data`, `.env*`, dan `.tools` dikecualikan dari Git. Hindari memasukkan backup atau berkas akses lokal ke repository/public assets. Folder `.data/test-*` adalah hasil pengujian terpisah dan tidak diperlukan oleh database utama.

## Batas versi lokal dan tahap cloud

Persiapan deployment Vercel, environment, dan inisialisasi cloud tersedia di [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). Jalankan `npm run cloud:check -- --files-only` untuk memeriksa berkas sebelum layanan cloud disediakan. Build Vercel tidak membuat akun atau data contoh.

Versi yang telah diuji adalah satu proses Next.js dengan PGlite dan LibreOffice lokal. PostgreSQL eksternal, Supabase Storage, dan Gotenberg memiliki adapter, tetapi belum diprovisikan atau diuji dengan akun cloud pengguna. Supabase Auth belum diintegrasikan; akun versi lokal dikelola aplikasi. RLS, kebijakan bucket privat, autentikasi Cloud Run, backup cloud, pemindahan data, dan deployment Vercel harus dikonfigurasi serta diuji sebelum pilot daring. Contoh variabel server ada di `.env.example`.

Import Excel/CSV penduduk belum diaktifkan karena bersifat opsional pada PRD. Tidak ada integrasi Dukcapil, BSrE, pembayaran, WhatsApp, atau portal warga, sesuai ruang lingkup v1.

Surat Keterangan Belum Menikah menggunakan template `Keterangan Belum Menikah.docx` pengguna, dengan kop dan tata letak A4 asli. Kewarganegaraan dan peruntukan diisi petugas; identitas, tanggal, nomor surat, dan penandatangan diambil dari data aplikasi. Nomor/tanggal pengantar RT opsional. Jika nomornya kosong, seluruh keterangan pengantar RT dihilangkan; jika diisi, tercetak `Nomor: ...`. Untuk menambahkannya pada database lokal yang sudah ada, jalankan `npx tsx scripts/check-belum-menikah-template.ts` lalu `node scripts/install-belum-menikah-template.mjs` saat server lokal berjalan.

Surat Keterangan Suami Istri menggunakan `Keterangan Suami Istri.docx` pengguna dengan tata letak A4 asli. Formulir dibagi menjadi data suami, data istri, dan keterangan pernikahan. Identitas pemohon mengisi bagian sesuai jenis kelamin dan tetap dapat diedit; identitas pasangan, kewarganegaraan, tanggal pernikahan, dan keterangan buku nikah/akta diisi petugas. Nomor pengantar RT opsional. Untuk memasang pada database lokal yang sudah ada, jalankan `npx tsx scripts/check-suami-istri-template.ts` lalu `node scripts/install-suami-istri-template.mjs` saat server lokal berjalan.

Pengantar Nikah (N1) juga membuat **Surat Pernyataan Belum Pernah Menikah** secara otomatis saat diterbitkan. Dokumen pendamping memakai template `Surat Pernyataan Nikah.docx` pengguna, mengambil identitas pemohon, nama ayah, alamat, agama, kewarganegaraan, kelurahan/kecamatan, tanggal surat, dan status jejaka/perawan dari snapshot N1 yang sama. PDF pendamping tersimpan bersama arsip N1 dan tersedia melalui tombol **Pernyataan Belum Menikah**.

Surat Keterangan Tidak Mampu (SKTM) menggunakan `SKTM.docx` pengguna dengan kop, logo, redaksi, tata letak A4, dan ruang tanda tangan asli. Template terbaru memuat kalimat DTSEN (Data Tunggal Sosial dan Ekonomi Nasional) dan kategori desil. Formulir memuat kewarganegaraan, kategori desil DTSEN wajib, peruntukan, serta nomor/tanggal pengantar RT/RW opsional. Kolom keterangan kondisi pemohon telah dihapus sesuai sumber terbaru. Desil diisi sesuai data pendukung dan tidak dihitung otomatis. Nomor pengantar kosong menghilangkan seluruh rujukan pengantar; nomor terisi dicetak dengan `Nomor: ...` dan tanggal bila tersedia. Template aktif dipasang melalui `npx tsx scripts/check-sktm-template.ts` lalu `node scripts/install-sktm-template.mjs` saat server berjalan. Instalasi baru juga memakai template ini.

Surat Keterangan Usaha (SKU) menggunakan `SKU.docx` pengguna dengan kop, redaksi, tata letak A4, dan ruang tanda tangan asli. Formulir memuat kewarganegaraan, jenis/nama usaha, serta alamat usaha lengkap yang terpisah dari alamat pemohon. Nomor/tanggal pengantar RT/RW opsional; nomor kosong menghilangkan seluruh rujukan pengantar, sedangkan nomor terisi dicetak dengan `Nomor: ...` dan tanggal bila tersedia. Untuk memasang pada database lokal yang sudah ada, jalankan `npx tsx scripts/check-sku-template.ts` lalu `node scripts/install-sku-template.mjs` saat server berjalan. Instalasi baru juga memakai template ini.

Surat Keterangan Umum menggunakan `UMUM.docx` pengguna dengan kop, redaksi keterangan tempat tinggal, tata letak A4, dan ruang tanda tangan asli. Identitas terisi dari penduduk; petugas mengisi kewarganegaraan dan peruntukan surat. Nomor/tanggal pengantar RT/RW opsional; nomor kosong menghilangkan seluruh rujukan pengantar, sedangkan nomor terisi dicetak dengan `Nomor: ...` dan tanggal bila tersedia. Instalasi baru memakai template ini. Untuk database lokal yang sudah ada, jalankan `npx tsx scripts/check-umum-template.ts` lalu `node scripts/install-umum-template.mjs` saat server berjalan.

Surat Pindah memakai formulir F-1.03 dari `Pindah.docx` pengguna pada kertas Legal (8,5 × 14 inci). Identitas dan alamat asal diambil dari penduduk/profil kelurahan. Petugas mengisi alamat tujuan, pilihan kepindahan yang dicetak sebagai kode angka, serta daftar anggota keluarga (NIK, nama, SHDK) melalui tombol tambah/hapus. Draft menyimpan seluruh anggota; nomor HP/email opsional. Bagian orang asing dan pindah luar negeri tetap kosong sesuai template layanan pindah dalam negeri. Nomor surat dan pejabat penanggung jawab disimpan untuk arsip; formulir tidak ditambahi nomor atau tanda tangan lurah. Jumlah halaman bertambah mengikuti panjang daftar keluarga. Instalasi pada database lama: `npx tsx scripts/check-pindah-template.ts` lalu `node scripts/install-pindah-template.mjs` saat server berjalan.
