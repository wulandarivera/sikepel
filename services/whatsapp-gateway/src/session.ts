import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import fs from "node:fs/promises";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { handleIncomingMessage } from "./bot.js";

export class WhatsAppSessionManager {
  private sock: WASocket | null = null;
  private currentQr: string | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  public getSocket(): WASocket | null {
    return this.sock;
  }

  public getQR(): string | null {
    return this.currentQr;
  }

  public getStatus(): { connected: boolean; hasQr: boolean; user: string | null } {
    return {
      connected: this.isConnected,
      hasQr: !!this.currentQr,
      user: this.sock?.user?.id || null,
    };
  }

  public async init(): Promise<void> {
    await this.ensureSessionDirectory();
    await this.connect();
  }

  private async ensureSessionDirectory(): Promise<void> {
    try {
      await fs.mkdir(config.sessionDir, { recursive: true, mode: 0o700 });
      await fs.chmod(config.sessionDir, 0o700);
      logger.info(
        { dir: config.sessionDir },
        "Direktori sesi terisolasi siap dengan izin 0700",
      );
    } catch (err: any) {
      logger.error(
        { error: err.message, dir: config.sessionDir },
        "Gagal menyiapkan izin direktori sesi",
      );
    }
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(
        config.sessionDir,
      );
      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1015901307] as [number, number, number],
      }));

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: "baileys" }) as any,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on(
        "connection.update",
        (update: Partial<ConnectionState>) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            this.currentQr = qr;
            logger.info("Kode QR WhatsApp diterima. Tampilan QR terminal:");
            console.log("\n--- PINDAI KODE QR WHATSAPP BERIKUT ---\n");
            qrcode.generate(qr, { small: true });
            console.log("\n---------------------------------------\n");
          }

          if (connection === "close") {
            this.isConnected = false;
            this.isConnecting = false;
            const statusCode = (lastDisconnect?.error as any)?.output
              ?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn(
              { statusCode, shouldReconnect },
              "Koneksi WhatsApp tertutup",
            );

            if (statusCode === DisconnectReason.loggedOut) {
              this.currentQr = null;
              logger.warn(
                "Sesi WhatsApp telah keluar (logged out). Hapus sesi lama jika ingin login ulang.",
              );
            } else if (shouldReconnect) {
              if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
              this.reconnectTimer = setTimeout(() => {
                this.connect();
              }, 5000);
            }
          } else if (connection === "open") {
            this.isConnected = true;
            this.isConnecting = false;
            this.currentQr = null;
            logger.info(
              { user: this.sock?.user?.id },
              "Koneksi WhatsApp aktif dan siap melayani hotline",
            );
          }
        },
      );

      this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages) {
          if (this.sock) {
            await handleIncomingMessage(this.sock, msg);
          }
        }
      });
    } catch (err: any) {
      this.isConnecting = false;
      logger.error(
        { error: err.message },
        "Kesalahan saat menginisialisasi socket Baileys",
      );
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, 7000);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.sock) {
      try {
        await this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }
}
