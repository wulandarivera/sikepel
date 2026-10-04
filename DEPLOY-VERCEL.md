# Deployment SIKEPEL ke Vercel

Persiapan kode tersedia. Belum ada deployment atau layanan cloud yang dibuat oleh langkah ini. Mode lokal tetap memakai `.data`, PGlite, dan LibreOffice.

## Layanan yang diperlukan

Belum memiliki layanan PDF? Ikuti [panduan menyiapkan Gotenberg di Cloud Run](SETUP-GOTENBERG.md). Tidak diperlukan akun Gotenberg terpisah.

Untuk sementara, ConvertAPI dapat digunakan tanpa menjalankan server converter. Buat token API di [dashboard ConvertAPI](https://www.convertapi.com/a/api-tokens), lalu isi `PDF_CONVERTER_PROVIDER=convertapi`, `PDF_CONVERTER_URL=https://v2.convertapi.com`, dan `PDF_CONVERTER_TOKEN`. ConvertAPI memproses DOCX secara in-memory saat `StoreFile=false`; perhatikan kuota dan kebijakan privasi dokumen.

1. Proyek Supabase khusus SIKEPEL: PostgreSQL dan Storage. Buat bucket **privat** bernama `sikepel`. Jangan membuat policy akses publik. Akun aplikasi tetap dikelola SIKEPEL, bukan Supabase Auth.
2. Layanan Gotenberg melalui HTTPS di Cloud Run atau server container lain. Gunakan autentikasi Basic bawaan Gotenberg: `API_ENABLE_BASIC_AUTH=true`, `GOTENBERG_API_BASIC_AUTH_USERNAME`, `GOTENBERG_API_BASIC_AUTH_PASSWORD`, dan `API_TIMEOUT=90s`. Gunakan nilai username/password yang sama pada Vercel. Port container Gotenberg adalah 3000. Jangan menaruh kredensial di URL.
3. Proyek Vercel untuk aplikasi Next.js. Konfigurasi memilih region `sin1` (Singapura); tempatkan database dan converter sedekat mungkin. Gunakan lingkungan Supabase/converter terpisah untuk Preview dan Production.

Cloud Run dengan IAM wajib memerlukan token identitas yang diperbarui otomatis. Adapter saat ini mendukung Basic melalui HTTPS atau gateway Bearer. Jangan mengisi `PDF_CONVERTER_TOKEN` dengan ID token Cloud Run yang akan kedaluwarsa. Untuk Basic, endpoint harus dapat dijangkau Vercel dan dilindungi autentikasi Gotenberg.

Font converter memengaruhi pagination. Template memakai antara lain Arial/Tahoma/Times New Roman. Siapkan font yang sama dengan izin penggunaan yang sesuai dan uji PDF di converter cloud; hasil LibreOffice Windows lokal belum membuktikan layout cloud identik.

## Environment

Gunakan `.env.vercel.example` sebagai daftar nilai. Isi semuanya di Vercel **Settings → Environment Variables**; jangan beri awalan `NEXT_PUBLIC_` pada kredensial.

| Nama | Isi |
|---|---|
| `DATABASE_URL` | URL PostgreSQL transaction pooler dari panel Connect Supabase, dengan `?sslmode=require` |
| `SUPABASE_URL` | URL proyek Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key server, bukan anon key |
| `SUPABASE_BUCKET` | `sikepel`, privat |
| `PDF_CONVERTER_URL` | Base URL HTTPS Gotenberg |
| `PDF_CONVERTER_USERNAME` | Username Basic Gotenberg |
| `PDF_CONVERTER_PASSWORD` | Password Basic Gotenberg |

`PDF_CONVERTER_TOKEN` hanya alternatif untuk gateway yang memvalidasi Bearer; bila diisi, nilainya didahulukan dari Basic. Salin URL pooler persis dari Supabase, jangan menebak hostname. Pool aplikasi dibatasi satu koneksi per instance Vercel. Gunakan role pemilik tabel untuk setup dan akses server dengan skema ini; isolasi kelurahan tetap diperiksa pada API SIKEPEL.

## Inisialisasi database cloud baru

Jalankan dari komputer tepercaya, bukan sebagai Build Command. Simpan environment cloud di `.env.cloud` (sudah diabaikan Git/Vercel), termasuk lima nilai sekali pakai: `SIKEPEL_ADMIN_NAME`, `SIKEPEL_ADMIN_USERNAME`, `SIKEPEL_ADMIN_PASSWORD` (minimal 12 karakter), `SIKEPEL_DISTRICT`, dan `SIKEPEL_CITY`. Jangan menggunakan akun contoh lokal. Nilai environment proses mengungguli berkas `.env*` lokal.

```powershell
node --env-file=.env.cloud --import tsx scripts/check-cloud.ts --services
node --env-file=.env.cloud --import tsx scripts/init-cloud.ts
```

Inisialisasi membuat skema, mengaktifkan RLS dan mencabut akses `anon`/`authenticated` ke tabel aplikasi, membuat satu super admin, serta mengunggah sembilan jenis surat dari template pengguna. Data penduduk, kelurahan, dan pejabat contoh tidak dimasukkan. Buat kelurahan, pejabat, serta akun petugas lewat aplikasi setelah login. Domisili/Penghasilan yang masih menggunakan template contoh lokal tidak otomatis dimasukkan ke cloud.

Perintah menolak database yang sudah berisi akun dan tidak mengganti password. Bila unggahan storage berhasil sebagian lalu transaksi database gagal, bisa ada objek template tanpa referensi; periksa bucket sebelum menghapusnya. Untuk database cloud yang sudah berjalan, terapkan SQL migrasi yang diperlukan secara terpisah setelah backup. Jangan menjalankan `npm run setup`: perintah itu khusus data contoh lokal dan kini menolak PostgreSQL eksternal.

Data lokal, arsip, counter surat, akun, serta versi template historis **tidak otomatis dimigrasikan**. Jika ingin memindahkannya, lakukan migrasi database dan seluruh storage secara konsisten setelah backup serta penghentian penulisan; jangan hanya menyalin template terbaru.

## Import ke Vercel

1. Masukkan kode ke repository Git privat. Sertakan `package-lock.json`, `templates`, `migrations`, `public/assets`, dan seluruh source/scripts. Jangan sertakan `.data`, `.tools`, atau `.env` berisi rahasia.
2. Import repository pada Vercel. Root Directory adalah folder dengan `package.json`; Framework Next.js; Node.js **22.x**. `vercel.json` mengatur install `npm ci` dan build `npm run vercel-build`. Output Directory gunakan default framework. Aktifkan Fluid Compute.
3. Isi environment terlebih dahulu. Build menghentikan deployment bila konfigurasi cloud tidak lengkap. Build tidak membuat akun, migrasi, atau menyentuh data cloud.
4. Deploy Preview memakai layanan uji yang terpisah. Setelah verifikasi berhasil, atur environment Production dan lakukan deployment Production dengan kredensial Production. Jangan mempromosikan build Preview yang masih menunjuk database uji sebagai Production.

Alternatif CLI setelah proyek Vercel dipilih: `npx vercel` untuk Preview dan `npx vercel --prod` untuk Production. Tidak ada perintah publish yang dijalankan dalam persiapan ini.

## Pemeriksaan

```powershell
npm run cloud:check -- --files-only
npm test
npm run build
```

Setelah deploy: login admin, isi profil kelurahan/pejabat, tambah satu data uji, buat pratinjau, terbitkan surat uji, buka PDF, dan uji N1 beserta dokumen pendamping. Pastikan pengguna kelurahan lain tidak bisa membaca arsip tersebut. Uji ulang PDF F-1.02/F-1.03 di kertas Legal dan template A4.

Vercel membatasi body request/response 4,5 MB. Template upload cloud dibatasi **4 MB** untuk menyisakan overhead multipart; hasil PDF cloud dibatasi **4 MB**. File lebih besar memerlukan alur upload/download bertanda tangan langsung ke storage sebelum dapat digunakan. Mode lokal tetap menerima template 10 MB dan PDF 20 MB. Durasi API diatur 300 detik untuk konversi utama + pendamping. Berkas pendamping N1 disertakan secara eksplisit dalam function bundle.

Autentikasi/session disimpan di PostgreSQL; cookie HTTPS bersifat Secure/HttpOnly. Secret service role hanya pada server. Jadwalkan backup PostgreSQL dan bucket sebelum penggunaan operasional. Pemeriksaan `--services` hanya memeriksa koneksi/health; uji konversi serta tampilan PDF harus dilakukan pada layanan cloud yang sebenarnya.

Referensi: [Vercel limits](https://vercel.com/docs/functions/limitations), [Node.js Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Supabase pooler](https://supabase.com/docs/guides/database/connecting-to-postgres), [Gotenberg configuration](https://gotenberg.dev/docs/configuration).
