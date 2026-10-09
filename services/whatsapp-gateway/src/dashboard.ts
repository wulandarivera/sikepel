import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
// Reuse the installed local QR encoder, no remote image service.
const QRCode = require("qrcode-terminal/vendor/QRCode/index.js");
export function qrDataUrl(value: string | null): string | null {
  if (!value) return null;
  const qr = new QRCode(-1, 1); qr.addData(value); qr.make();
  const n = qr.getModuleCount(); const paths: string[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) paths.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><path fill="white" d="M0 0h${n + 8}v${n + 8}H0z"/><path fill="black" d="${paths.join("")}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
export function cleanName(value?: string | null): string | null {
  return value?.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3\p{Cc}]/gu, "").slice(0, 100) || null;
}
export class DashboardLogs {
  private entries: Array<{ id: string; at: string; direction: "in" | "out"; recipient: string; summary: string; status: string }> = [];
  add(direction: "in" | "out", status: "received" | "sent" | "failed") {
    this.entries.push({ id: randomUUID(), at: new Date().toISOString(), direction, recipient: "[redacted]", summary: direction === "in" ? "Pesan masuk" : "Pesan keluar", status });
    if (this.entries.length > 100) this.entries.shift();
  }
  list() { return this.entries.map((entry) => ({ ...entry })); }
  clear() { this.entries = []; }
}
