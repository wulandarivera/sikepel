import qrcode from "qrcode-terminal";
import { config } from "../config.js";
import { WhatsAppSessionManager } from "../session.js";

async function main() {
  console.log("=== HELPER PEMINDAI KODE QR WHATSAPP SIKEPEL ===\n");

  // 1. Coba hubungi daemon gateway yang sedang berjalan
  try {
    const healthUrl = `http://${config.host}:${config.port}/health`;
    const headers = { Authorization: `Bearer ${config.secret}` };
    const res = await fetch(healthUrl, { headers, signal: AbortSignal.timeout(2000) });
    if (res.status === 401) throw new Error("WA_GATEWAY_SECRET wajib cocok dengan daemon");
    if (res.ok) {
      const data: any = await res.json();
      if (data.connected) {
        console.log("Status: Gateway sudah terhubung dengan nomor WhatsApp aktif.");
        console.log(`Akun WhatsApp: ${data.user || "Terhubung"}`);
        process.exit(0);
      }

      const qrUrl = `http://${config.host}:${config.port}/qr`;
      const qrRes = await fetch(qrUrl, { headers, signal: AbortSignal.timeout(2000) });
      if (qrRes.status === 401) throw new Error("WA_GATEWAY_SECRET wajib cocok dengan daemon");
      if (qrRes.ok) {
        const qrData: any = await qrRes.json();
        if (qrData.qr) {
          console.log("Kode QR aktif dari daemon gateway:\n");
          qrcode.generate(qrData.qr, { small: true });
          console.log("\nSilakan pindai kode QR di atas menggunakan aplikasi WhatsApp di ponsel.");
          process.exit(0);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("WA_GATEWAY_SECRET")) throw err;
  }

  // 2. Jika daemon belum berjalan, jalankan inisialisasi sesi interaktif
  console.log("Daemon gateway tidak terdeteksi aktif pada port " + config.port + ".");
  console.log("Memulai inisialisasi sesi langsung pada direktori: " + config.sessionDir + "\n");

  const manager = new WhatsAppSessionManager();
  await manager.init();

  console.log("Menunggu kode QR dari server WhatsApp... (Tekan Ctrl+C untuk keluar)\n");
}

main().catch((err) => {
  console.error("Gagal menjalankan helper QR:", err.message);
  process.exit(1);
});
