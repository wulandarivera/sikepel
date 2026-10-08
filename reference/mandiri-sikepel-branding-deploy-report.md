# Laporan Verifikasi Deployment Portal Mandiri Berlogo SIKEPEL (t_bb9575be)

Tanggal: 2026-10-08
Task: t_bb9575be
Assignee: sikepel-backend

## Detail Rilis Produksi
- **Branch Rilis:** release/candidate-t_bb9575be
- **HEAD Commit:** 7ecde1b282eaef59462126e5d52b284d3f90dbd7
- **Komit Integrasi:**
  - 2f09a10 feat(mandiri): align citizen portal UI and branding with official SIKEPEL design system
  - 7ecde1b fix(deps): patch Next.js security advisories to 16.3.8
- **Release Directory:** /home/cibodas/apps/sikepel/releases/7ecde1b282eaef59462126e5d52b284d3f90dbd7
- **Node Runtime:** Node v22.23.3 (/usr/bin/node)
- **Next.js Version:** 16.3.8 (Turbopack)
- **BUILD_ID:** EjSBqVdppX-xOK0jkVNvY

## PM2 Service Status
- **Service Name:** sikepel (ID 4)
- **Mode:** fork
- **Binding:** 100.67.16.86:3000
- **Status:** online (0 restarts)
- **Layanan Lain:** dawara-preview, muron-server-monitor, omniroute tetap utuh tanpa modifikasi.

## Hasil Verifikasi Endpoint
- GET http://100.67.16.86:3000/login -> HTTP 200
- GET http://100.67.16.86:3000/mandiri -> HTTP 200 (Memuat /assets/logo.webp, /assets/icon.webp, judul SIKEPEL)
- GET http://100.67.16.86:3000/mandiri/ajukan -> HTTP 200
- GET http://100.67.16.86:3000/mandiri/lacak -> HTTP 200
- Zero decorative emoji.
