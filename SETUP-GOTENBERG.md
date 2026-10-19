# Menyiapkan Gotenberg untuk SIKEPEL

Gotenberg adalah layanan konversi DOCX ke PDF. Tidak perlu membuat akun Gotenberg: jalankan image resminya pada penyedia container. Aplikasi lokal tetap memakai LibreOffice yang sudah tersedia. Untuk deployment Vercel, adapter SIKEPEL memerlukan endpoint converter HTTPS.

## Pilihan: Google Cloud Run

Siapkan proyek Google Cloud dengan billing aktif dan akses membuat Cloud Run serta secret. Hosting dapat menimbulkan biaya; panduan ini belum membuat resource apa pun.

1. Buka Google Cloud Console → Cloud Run → Deploy container.
2. Pilih image `gotenberg/gotenberg:8-libreoffice-cloudrun`. Varian ini sesuai kebutuhan DOCX SIKEPEL. Untuk produksi, catat digest image revisi yang sudah diuji agar pembaruan berikutnya terkontrol.
3. Beri nama `sikepel-pdf` dan pilih region Singapura (`asia-southeast1`).
4. Sebagai konfigurasi awal SIKEPEL, gunakan 1 CPU, RAM 1 GiB, concurrency 1, request timeout 120 detik, minimum instances 0, maximum instances 2, dan request-based billing. Nilai ini titik awal pengujian, bukan jaminan kapasitas. Minimum 0 memungkinkan cold start pada permintaan pertama.
5. Gunakan container port 8080. Varian `cloudrun` membaca environment `PORT` yang diberikan Cloud Run.
6. Isi environment berikut **sebelum deployment pertama**:

   | Nama | Nilai |
   |---|---|
   | `API_ENABLE_BASIC_AUTH` | `true` |
   | `GOTENBERG_API_BASIC_AUTH_USERNAME` | `sikepel` |
   | `API_TIMEOUT` | `90s` |
   | `API_BODY_LIMIT` | `10MB` |
   | `API_DISABLE_DOWNLOAD_FROM` | `true` |

7. Buat secret password acak yang kuat di Secret Manager, berikan service account Cloud Run akses ke secret tersebut, dan pasang sebagai environment `GOTENBERG_API_BASIC_AUTH_PASSWORD`. Simpan salinannya di pengelola password untuk konfigurasi Vercel.
8. Pilih ingress yang mengizinkan akses dari internet dan **Allow public access** pada autentikasi Cloud Run. Autentikasi permintaan konversi tetap dilakukan oleh Basic Auth Gotenberg yang diaktifkan pada langkah sebelumnya. Adapter SIKEPEL saat ini belum mengambil token IAM Google secara otomatis. Jika kebijakan organisasi mewajibkan IAM, integrasi token harus ditambahkan dahulu.
9. Deploy dan salin URL HTTPS layanan yang dihasilkan.

Dokumentasi resmi: [instalasi Gotenberg di Cloud Run](https://gotenberg.dev/docs/getting-started/installation#cloud-run), [konfigurasi Gotenberg](https://gotenberg.dev/docs/configuration), dan [deployment container Cloud Run](https://docs.cloud.google.com/run/docs/deploying).

## Hubungkan ke Vercel

Isi environment server aplikasi:

```dotenv
PDF_CONVERTER_URL=https://URL-LAYANAN-CLOUD-RUN
PDF_CONVERTER_USERNAME=sikepel
PDF_CONVERTER_PASSWORD=PASSWORD-DARI-SECRET-MANAGER
```

Hapus `PDF_CONVERTER_TOKEN` jika sebelumnya diisi: adapter memprioritaskan Bearer token dibanding Basic. Jangan beri awalan `NEXT_PUBLIC_`. Redeploy aplikasi setelah environment diubah.

Setelah Supabase juga tersedia, jalankan pemeriksaan dari komputer tepercaya dengan kredensial pada `.env.cloud`:

```powershell
node --env-file=.env.cloud --import tsx scripts/check-cloud.ts --services
```

Pemeriksaan health belum membuktikan konversi. Uji pratinjau SIKEPEL, terbitkan surat uji, lalu periksa N1 beserta pendamping, tabel F-1.02/F-1.03, dan posisi tanda tangan. Pastikan permintaan konversi tanpa kredensial ditolak. Sesuaikan font converter dengan font template yang berlisensi; hasil di Linux perlu dibandingkan dengan PDF lokal.

Lanjutkan inisialisasi dan deployment aplikasi melalui [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). Jangan gunakan endpoint demo publik untuk dokumen penduduk.
