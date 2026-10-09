# SIKEPEL Local WhatsApp Gateway & Hotline Service (Baileys)

Layanan WhatsApp Gateway dan Hotline Warga mandiri lokal berbasis Node.js dan `@whiskeysockets/baileys` untuk Kelurahan Cibodas.

## Fitur Utama

1. **Engine Mandiri (Full Local)**:
   - Berjalan sebagai service daemon mandiri di host lokal tanpa ketergantungan pihak ketiga (seperti Fonnte, Twilio, Wablas).
   - Pengelolaan proses via PM2 (`sikepel-wa-gateway`).

2. **Autentikasi & Sesi Aman (0700)**:
   - Sesi Baileys disimpan di direktori privat `/home/cibodas/apps/sikepel/.data/wa-session` dengan izin mode `0700`.
   - Kode QR ditampilkan langsung di terminal log saat startup atau melalui CLI helper.

3. **Hotline Bot Pelayanan Warga**:
   - Menu otomatis saat warga mengirim sapaan atau kata kunci bantuan.
   - Tautan resmi pengajuan surat mandiri: `https://mandiri.sikepel.biz.id/ajukan`.
   - Fitur cek status permohonan mandiri secara otomatis dengan format nomor tiket `TIK-YYYYMM-XXXXXXXX`.

4. **Dispatcher Notifikasi Status**:
   - Menerima dispatch internal dari backend SIKEPEL saat operator menyetujui, meminta perbaikan, menolak, atau menandai surat siap diambil.
   - Klausul wajib: Surat fisik diambil langsung di kantor kelurahan (JANGAN PERNAH mengirimkan file PDF).

5. **Kebijakan Ketat**:
   - ZERO EMOJI di seluruh pesan teks notifikasi, sapaan bot, log, dan komentar kode.

## Menjalankan Layanan

### 1. Kompilasi TypeScript
```bash
npm run build
```

### 2. Menjalankan via PM2
```bash
pm2 start ecosystem.config.cjs
```

Untuk melihat log dan scan QR:
```bash
pm2 logs sikepel-wa-gateway
```

### 3. Pindai Kode QR via CLI Helper
Jika ingin melihat QR langsung atau menghubungkan nomor baru:
```bash
npm run qr
```

### 4. Menjalankan Pengujian Mock
```bash
npm run test
```

## Spesifikasi API Internal (Port 3001)

- `GET /health` : Memeriksa status kesehatan gateway dan koneksi WhatsApp.
- `GET /qr` : Memeriksa string QR code terbaru jika belum terhubung.
- `POST /notify` : Mengirimkan notifikasi perubahan status permohonan mandiri ke pemohon.
- `POST /send` : Mengirimkan pesan teks kustom ke nomor WhatsApp tujuan.
