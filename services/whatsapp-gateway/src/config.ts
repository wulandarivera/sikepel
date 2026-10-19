import path from "node:path";

export interface GatewayConfig {
  port: number;
  host: string;
  secret: string;
  sessionDir: string;
  databaseUrl?: string;
  sikepelInternalUrl: string;
  portalAjukanUrl: string;
  portalLacakUrl: string;
}

const defaultSessionDir = process.env.WA_SESSION_DIR
  ? path.resolve(process.env.WA_SESSION_DIR)
  : path.resolve(
      process.env.SIKEPEL_DATA_DIR ||
        path.join(process.cwd(), "..", "..", ".data"),
      "wa-session",
    );

export const config: GatewayConfig = {
  port: parseInt(process.env.WA_GATEWAY_PORT || "3001", 10),
  host: process.env.WA_GATEWAY_HOST || "127.0.0.1",
  secret: process.env.WA_GATEWAY_SECRET || "",
  sessionDir: defaultSessionDir,
  databaseUrl: process.env.DATABASE_URL,
  sikepelInternalUrl:
    process.env.SIKEPEL_INTERNAL_URL || "http://127.0.0.1:3000",
  portalAjukanUrl: "https://mandiri.sikepel.biz.id",
  portalLacakUrl: "https://mandiri.sikepel.biz.id/lacak",
};
