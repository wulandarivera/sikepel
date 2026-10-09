import makeWASocket, {
  DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion,
  type WASocket, type ConnectionState,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import fs from "node:fs/promises";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { handleIncomingMessage } from "./bot.js";
import { cleanName, DashboardLogs, qrDataUrl } from "./dashboard.js";

export class WhatsAppSessionManager {
  private sock: WASocket | null = null;
  private currentQr: string | null = null;
  private isConnecting = false;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private generation = 0;
  private stopped = false;
  private replacing = false;
  private startedAt: string | null = null;
  private credentialWrites: Promise<void> = Promise.resolve();
  public readonly logs = new DashboardLogs();

  public getSocket() { return this.sock; }
  public getQR() { return this.currentQr; }
  public getStatus() {
    return { connected: this.isConnected, hasQr: !!this.currentQr, user: this.sock?.user?.id || null };
  }
  public getDashboardStatus() {
    return {
      connected: this.isConnected, hasQr: !!this.currentQr, qrDataUrl: qrDataUrl(this.currentQr),
      profile: {
        phone: this.isConnected ? this.sock?.user?.id?.split(":")[0]?.split("@")[0] || null : null,
        name: this.isConnected ? cleanName(this.sock?.user?.name) : null,
        startedAt: this.startedAt,
      },
      logs: this.logs.list(),
    };
  }
  public async init() {
    this.stopped = false;
    await this.ensureSessionDirectory(); await this.connect();
  }
  private async ensureSessionDirectory() {
    await fs.mkdir(config.sessionDir, { recursive: true, mode: 0o700 });
    await fs.chmod(config.sessionDir, 0o700);
  }
  private schedule(generation: number, delay: number) {
    if (this.stopped || generation !== this.generation) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped && generation === this.generation) void this.connect();
    }, delay);
  }
  public async connect(): Promise<void> {
    if (this.isConnecting || this.stopped || this.replacing) return;
    this.isConnecting = true;
    const generation = ++this.generation;
    const active = () => generation === this.generation && !this.stopped;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] as [number, number, number] }));
      if (!active()) return;
      const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger: logger.child({ module: "baileys" }) as any, syncFullHistory: false, markOnlineOnConnect: false });
      this.sock = sock;
      sock.ev.on("creds.update", () => {
        this.credentialWrites = this.credentialWrites.then(async () => { if (active()) await saveCreds(); }).catch(() => { logger.error("Gagal menyimpan sesi WhatsApp"); });
      });
      sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        if (!active()) return;
        const { connection, lastDisconnect, qr } = update;
        if (qr) { this.currentQr = qr; qrcode.generate(qr, { small: true }); }
        if (connection === "close") {
          this.isConnected = false; this.isConnecting = false; this.currentQr = null; this.startedAt = null;
          const code = (lastDisconnect?.error as any)?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut) this.schedule(generation, 5000);
          else this.stopped = true;
        } else if (connection === "open") {
          this.isConnected = true; this.isConnecting = false; this.currentQr = null;
          this.startedAt = new Date().toISOString();
          logger.info("Koneksi WhatsApp aktif");
        }
      });
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (!active() || type !== "notify") return;
        for (const msg of messages) {
          if (!active()) break;
          if (!msg.key.fromMe) this.logs.add("in", "received");
          // Capture bot replies too, without storing recipient or message content.
          try { await handleIncomingMessage(sock, msg); }
          catch { logger.warn("Pemrosesan pesan WhatsApp gagal"); }
        }
      });
      sock.ev.on("messages.update", (updates) => {
        if (!active()) return;
        for (const update of updates) if (update.key.fromMe && update.update.status) this.logs.add("out", "sent");
      });
    } catch {
      if (!active()) return;
      this.isConnecting = false;
      logger.error("Inisialisasi WhatsApp gagal"); this.schedule(generation, 7000);
    }
  }
  public async disconnect(endSocket = true) {
    this.stopped = true; ++this.generation;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const sock = this.sock; this.sock = null;
    this.isConnected = false; this.isConnecting = false; this.currentQr = null; this.startedAt = null;
    try { if (endSocket) sock?.end(undefined); } catch { /* Already closed. */ }
    await this.credentialWrites;
  }
  public async logout() {
    if (this.replacing) throw new Error("Penggantian sesi sedang berlangsung");
    this.replacing = true;
    const old = this.sock;
    try {
      await this.disconnect(false);
      if (old) {
        // Logout failures must not reuse old credentials locally.
        try { await Promise.race([old.logout(), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Timeout")), 5000); timer.unref(); })]); } catch { logger.warn("Sesi lama ditutup lokal"); }
      }
      try { old?.end(undefined); } catch { /* Already logged out. */ }
      await fs.rm(config.sessionDir, { recursive: true, force: true });
      await this.ensureSessionDirectory(); this.logs.clear();
      this.stopped = false;
    } finally { this.replacing = false; }
    await this.connect();
  }
}
