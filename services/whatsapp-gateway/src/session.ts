import { ReceiptDiagnostics } from "./receipt-diagnostics.js";
import makeWASocket, {
  DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion,
  proto,
  type WASocket, type ConnectionState, type CacheStore,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import fs from "node:fs/promises";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { handleIncomingMessage } from "./bot.js";
import { cleanName, DashboardLogs, qrDataUrl } from "./dashboard.js";

export class InMemoryCacheStore implements CacheStore {
  private cache = new Map<string, any>();
  public get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }
  public set<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }
  public del(key: string): void {
    this.cache.delete(key);
  }
  public flushAll(): void {
    this.cache.clear();
  }
}

export class MessageMemoryStore {
  private messages = new Map<string, { message: proto.IMessage; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000, maxEntries = 5000) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  public set(id: string, message: proto.IMessage): void {
    if (!id || !message) return;
    const now = Date.now();
    if (this.messages.size >= this.maxEntries) {
      this.prune(now);
      if (this.messages.size >= this.maxEntries) {
        const oldestKey = this.messages.keys().next().value;
        if (oldestKey) this.messages.delete(oldestKey);
      }
    }
    this.messages.set(id, { message, expiresAt: now + this.ttlMs });
  }

  public get(id: string): proto.IMessage | undefined {
    if (!id) return undefined;
    const entry = this.messages.get(id);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.messages.delete(id);
      return undefined;
    }
    return entry.message;
  }

  public has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  public size(): number {
    return this.messages.size;
  }

  public clear(): void {
    this.messages.clear();
  }

  public prune(now = Date.now()): void {
    for (const [key, entry] of this.messages.entries()) {
      if (now > entry.expiresAt) {
        this.messages.delete(key);
      }
    }
  }
}

export class WhatsAppSessionManager {
  public readonly diagnostics = new ReceiptDiagnostics(event => logger.info(event, "WA receipt"));
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
  public readonly messageStore = new MessageMemoryStore();
  public readonly retryCache = new InMemoryCacheStore();
  private consecutiveBadMacCount = 0;
  private blocked = false;
  private reconnectAttempts = 0;

  private handleMessageUpdates(updates: Array<{ key: { fromMe?: boolean | null; id?: string | null; remoteJid?: string | null }; update: { status?: number | null } }>) {
    for (const update of updates) {
      this.diagnostics.ack(update.key, update.update.status);
      if (update.key.fromMe && update.update.status && update.key.id && update.key.remoteJid) this.logs.add("out", "sent", update.key);
    }
  }
  public getSocket() { return this.sock; }
  public getQR() { return this.currentQr; }
  public getStatus() {
    return { state: this.blocked ? "blocked" : "active", action: this.blocked ? "operator_review_required" : null, connected: this.isConnected, hasQr: !!this.currentQr, user: this.sock?.user?.id || null };
  }
  public getDashboardStatus() {
    return {
      state: this.blocked ? "blocked" : "active", action: this.blocked ? "operator_review_required" : null,
      connected: this.isConnected, hasQr: !!this.currentQr, qrDataUrl: qrDataUrl(this.currentQr),
      profile: {
        phone: this.isConnected ? this.sock?.user?.id?.split(":")[0]?.split("@")[0] || null : null,
        name: this.isConnected ? cleanName(this.sock?.user?.name) : null,
        startedAt: this.startedAt,
      },
      logs: this.logs.list(),
    };
  }

  public async getMessage(key: proto.IMessageKey | string): Promise<proto.IMessage | undefined> {
    const id = typeof key === "string" ? key : key?.id;
    if (!id) return undefined;
    return this.messageStore.get(id);
  }

  public storeMessage(id: string, message: proto.IMessage): void {
    this.messageStore.set(id, message);
  }

  public isFatalSessionCorruption(error: any): boolean {
    if (!error) return false;
    const code = error?.output?.statusCode;
    if (code === DisconnectReason.badSession) return true;
    const text = String(error?.message || error?.stack || error || "").toLowerCase();
    return (
      text.includes("bad mac") ||
      text.includes("failed to decrypt message with any known session") ||
      text.includes("no matching sessions found") ||
      text.includes("session error") ||
      text.includes("corrupted")
    );
  }

  public isDecryptionFailure(msg: proto.IWebMessageInfo): boolean {
    if (msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT) return true;
    if (Array.isArray(msg.messageStubParameters)) {
      return msg.messageStubParameters.some((param) =>
        typeof param === "string" &&
        /bad mac|failed to decrypt|session error|no matching session/i.test(param)
      );
    }
    return false;
  }

  public async init() {
    if (this.blocked) return;
    this.stopped = false;
    await this.ensureSessionDirectory(); await this.connect();
  }
  private async ensureSessionDirectory() {
    await fs.mkdir(config.sessionDir, { recursive: true, mode: 0o700 });
    await fs.chmod(config.sessionDir, 0o700);
  }
  private schedule(generation: number, delay: number) {
    if (this.stopped || this.blocked || generation !== this.generation) return;
    if (++this.reconnectAttempts > 3) { void this.resetSession("retry_limit"); return; }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped && generation === this.generation) void this.connect();
    }, delay);
  }
  public async connect(): Promise<void> {
    if (this.blocked || this.isConnecting || this.stopped || this.replacing) return;
    this.isConnecting = true;
    const generation = ++this.generation;
    const active = () => generation === this.generation && !this.stopped;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] as [number, number, number] }));
      if (!active()) return;
      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: "baileys" }) as any,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: false,
        msgRetryCounterCache: this.retryCache,
        getMessage: async (key) => this.getMessage(key),
      });
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
          const error = lastDisconnect?.error as any;
          const code = error?.output?.statusCode;
          if (this.isFatalSessionCorruption(error)) {
            logger.error("Session blocked; operator review required");
            void this.resetSession("fatal_connection_corruption");
            return;
          }
          if (code !== DisconnectReason.loggedOut) this.schedule(generation, 5000);
          else this.stopped = true;
        } else if (connection === "open") {
          this.isConnected = true; this.isConnecting = false; this.currentQr = null;
          this.consecutiveBadMacCount = 0;
          this.startedAt = new Date().toISOString();
          logger.info("Koneksi WhatsApp aktif");
        }
      });
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (!active()) return;
        for (const msg of messages) {
          if (msg.key?.id && msg.message) {
            this.messageStore.set(msg.key.id, msg.message);
          }
          if (this.isDecryptionFailure(msg)) {
            this.consecutiveBadMacCount++;
            logger.warn(
              { count: this.consecutiveBadMacCount },
              "Gagal mendekripsi pesan WhatsApp karena Bad MAC atau sesi tidak cocok",
            );
            if (this.consecutiveBadMacCount >= 3) {
              logger.error("Session blocked; authentication preserved");
              void this.resetSession("consecutive_bad_mac_failures");
            }
          } else if (msg.message) {
            this.consecutiveBadMacCount = 0;
          }
        }

        if (type !== "notify") return;
        for (const msg of messages) {
          if (!active()) break;
          if (!msg.key.fromMe) this.logs.add("in", "received");
          // Capture bot replies too, without storing recipient or message content.
          try {
            await handleIncomingMessage(sock, msg, (id, message) => {
              this.messageStore.set(id, message);
            });
          } catch {
            logger.warn("Pemrosesan pesan WhatsApp gagal");
          }
        }
      });
      sock.ev.on("messages.update", (updates) => {
        if (!active()) return;
        this.handleMessageUpdates(updates);
      });
    } catch (err: any) {
      if (!active()) return;
      this.isConnecting = false;
      if (this.isFatalSessionCorruption(err)) {
        logger.error("Session initialization blocked; authentication preserved");
        void this.resetSession("fatal_init_corruption");
        return;
      }
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
  public async resetSession(_reason = "session_error"): Promise<void> {
    this.blocked = true;
    await this.disconnect();
    logger.error("Session blocked; authentication preserved; operator review required");
  }
  public async logout(): Promise<void> {
    await this.resetSession();
    throw new Error("Destructive session operations disabled; operator review required");
  }
}
