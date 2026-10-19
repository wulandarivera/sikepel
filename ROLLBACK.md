# Git lokal dan rollback SIKEPEL

Repository: `/home/cibodas/apps/sikepel`. Git lokal saja, tidak diunggah ke GitHub.
Baseline awal diberi tag `baseline-20261003`. Baseline menyimpan keadaan sekarang, bukan riwayat sebelum Git dipasang dan bukan persetujuan semua fitur oleh pemilik.

## Pengembangan
1. Periksa `git status`.
2. Buat branch: `git switch -c feature/nama-fitur` atau `fix/nama-bug`.
3. Kerjakan satu perubahan yang bisa dibatalkan secara terpisah; tes, typecheck dan build.
4. Commit hasilnya; minta pemilik menilai sebelum merge ke main.
5. Catat commit yang benar-benar dideploy; tag rilis setelah diterima.

## Membatalkan fitur
Gunakan `git log --oneline --decorate` untuk memilih perubahan. Di branch yang memuat perubahan, gunakan `git revert <commit>` agar riwayat dipertahankan. Perubahan dependensi memerlukan `npm ci` dan persiapan aset kembali. Jalankan tes dan build sebelum restart `systemctl --user restart sikepel`.

Untuk memeriksa versi lama tanpa mengubah aplikasi aktif:
`git worktree add --detach /lokasi/salinan-uji baseline-20261003`
Jangan jalankan salinan dengan database produksi. Salinan Git tidak berisi .env, .data, LibreOffice atau node_modules.

## Data dan pemulihan
Git hanya menyimpan kode, template sumber dan konfigurasi non-rahasia. .data, password/token, .env, runtime tools dan backup dikecualikan. Rollback kode tidak membatalkan perubahan database. Sebelum migrasi, hentikan server dan backup seluruh .data/database/storage bersama. Pemulihan data lama memerlukan izin pemilik karena dapat menghilangkan transaksi baru.

Jangan gunakan git reset --hard atau git clean pada aplikasi aktif tanpa persetujuan dan backup. Repository lokal tetap bisa hilang jika disk rusak; bundle Git di /home/cibodas/backups/sikepel adalah salinan tambahan pada disk yang sama, bukan backup offsite.
