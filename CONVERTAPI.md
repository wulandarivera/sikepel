# Converter sementara: ConvertAPI

SIKEPEL mendukung ConvertAPI sebagai pengganti Gotenberg melalui endpoint DOCX → PDF. Buat API token pada dashboard ConvertAPI, lalu isi environment server-only berikut di Vercel:

```dotenv
PDF_CONVERTER_PROVIDER=convertapi
PDF_CONVERTER_URL=https://v2.convertapi.com
PDF_CONVERTER_TOKEN=isi_token_di_Vercel
```

Token hanya digunakan pada server. Jangan memakai awalan `NEXT_PUBLIC_` atau menaruh token di source code. SIKEPEL mengirim `StoreFile=false`, sehingga respons mengembalikan PDF sebagai Base64 dan tidak memakai URL file sementara. ConvertAPI menyatakan akun baru mendapat 250 konversi trial; kuota dan ketentuan dapat berubah, jadi pantau dashboard sebelum penggunaan operasional.

Setelah environment diisi, jalankan build/deploy Vercel lalu uji pratinjau satu surat. Periksa juga N1 beserta dokumen pendamping dan template F-1.02/F-1.03. Pengujian lokal tetap memakai LibreOffice.
