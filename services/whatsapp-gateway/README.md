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
   - Pemberitahuan: Surat fisik diambil langsung di loket pelayanan kantor kelurahan.

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
- `GET /status` : Kontrak dashboard, QR SVG data URL lokal, profil nyata dan maksimal 100 log metadata.
- `POST /logout` : Body `{confirm:true}`. Invalidasi callback/timer lama, tunggu penulisan kredensial, logout socket lama, hapus sesi lama, mulai pairing baru.

Semua endpoint internal membutuhkan `Authorization: Bearer <WA_GATEWAY_SECRET>`; secret kosong menolak semua akses. `/status` dan `/logout` wajib `X-WA-Village-ID` cocok dengan `WA_GATEWAY_VILLAGE_ID`. Jika header scope disertakan pada endpoint lain, nilainya juga wajib cocok. Jangan expose port daemon ke publik.

## API dashboard same-origin

Konfigurasi backend SIKEPEL: `WA_GATEWAY_URL` (default `http://127.0.0.1:3001`), `WA_GATEWAY_SECRET`, `WA_GATEWAY_VILLAGE_ID`. Daemon menggunakan secret dan village ID sama. Village ID adalah UUID kelurahan gateway, bukan pilihan browser. Belum ada nilai deployment ditetapkan.

- `GET /api/wa/status`: `{connected:boolean,hasQr:boolean,qrDataUrl:string|null,profile:{phone:string|null,name:string|null,startedAt:string|null},logs:Array<{id:string,at:string,direction:'in'|'out',recipient:string,summary:string,status:string}>}`.
- `POST /api/wa/send`: `{to:string,text:string}`. Nomor Indonesia digit-only (boleh +62); teks 1–2000 karakter, tanpa emoji.
- `POST /api/wa/logout`: `{confirm:true}`. UI harus meminta konfirmasi eksplisit.
- POST sukses: `{ok:true}`. Error: `{error:string}`; 400 validasi, 401 sesi, 403 role/scope/Origin, 413 body >8192 byte, 429 limit, 503 konfigurasi/daemon.

Cookie `sikepel_session` wajib; tidak menerima bearer browser. Role OPERATOR/ADMIN/SUPER_ADMIN; scope sesi wajib sama dengan kelurahan gateway, termasuk SUPER_ADMIN. Semua response no-store. POST membutuhkan Content-Type JSON dan Origin same-origin. Rate limit per user per proses: 10 POST/menit, 120 GET/menit, map bounded. Audit status read dan request/result POST tanpa nomor/konten pesan. Untuk multi-instance, rate limit perlu shared store pada integrasi deployment.

QR dihasilkan encoder lokal qrcode-terminal menjadi SVG base64 (tidak ada gambar pihak ketiga). Browser boleh menampilkan melalui img; jangan decode SVG ke innerHTML. Profile null saat tidak terhubung. startedAt adalah waktu koneksi terbuka pada proses aktif, bukan waktu historis yang direka. Logs in-memory, bounded 100, kosong setelah restart/logout; recipient selalu `[redacted]`, summary hanya jenis aktivitas. Tidak menyimpan teks, tiket, atau nomor warga. Tidak ada pagination/history persisten.

Frontend ownership: host whitelist `/api/login` existing dan `/api/wa/**`, UI `/wa/**`; jangan mengubah redirect login. Backend tidak mengubah proxy/UI. Tidak ada deployment pada task ini.

Verifikasi adapter: `npx tsx --test src/server/wa-dashboard.test.ts` dari root. Verifikasi daemon: `npm test --prefix services/whatsapp-gateway`. Mock socket dan DB test tidak membuktikan pairing WhatsApp live; pairing/kirim live tetap perlu operator berotorisasi.
