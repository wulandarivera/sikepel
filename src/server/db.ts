import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs/promises";
import { assertCloudConfig } from "./cloud-config";
import { migrateDraftTickets, cleanupExpiredDrafts, startDraftCleanup } from "./draft-tickets";
async function initializeDrafts(db: DB) {
  const count=await migrateDraftTickets(db);
  console.info(`Draft tickets migration: ${count} legacy drafts assigned`);
  await cleanupExpiredDrafts(db);
  startDraftCleanup(db);
  return db;
}
export interface DB {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<any>;
  close(): Promise<void>;
}
export const dataRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.SIKEPEL_DATA_DIR || ".data",
  );
const globalDB = globalThis as typeof globalThis & { sikepelDB?: Promise<DB> };
export async function getDB(): Promise<DB> {
  assertCloudConfig();
  if (!globalDB.sikepelDB)
    globalDB.sikepelDB = (async () => {
      if (process.env.DATABASE_URL) {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: process.env.VERCEL === "1" ? 1 : 8,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 20000,
          allowExitOnIdle: true,
        });
        pool.on("error", () => console.error("SIKEPEL database idle connection error"));
        const wrap = (client: any): DB => ({
          query: (s, p) => client.query(s, p),
          exec: (s) => client.query(s),
          close: () => pool.end(),
          transaction: async (fn) => {
            const c = await pool.connect();
            try {
              await c.query("BEGIN");
              const result = await fn(wrap(c));
              await c.query("COMMIT");
              return result;
            } catch (e) {
              await c.query("ROLLBACK");
              throw e;
            } finally {
              c.release();
            }
          },
        });
        return initializeDrafts(wrap(pool));
      }
      await fs.mkdir(dataRoot(), { recursive: true });
      const pgDir = path.join(dataRoot(), "postgres");
      try {
        await fs.rm(path.join(pgDir, "postmaster.pid"), { force: true });
      } catch {}
      const pg = new PGlite(pgDir);
      await pg.waitReady;
      const wrap = (client: any): DB => ({
        query: (s, p) => client.query(s, p),
        exec: (s) => client.exec(s),
        transaction: (fn) => client.transaction((tx: any) => fn(wrap(tx))),
        close: () => pg.close(),
      });
      return initializeDrafts(wrap(pg));
    })();
  return globalDB.sikepelDB;
}
export async function one<T = any>(
  db: DB,
  sql: string,
  params: any[] = [],
): Promise<T | undefined> {
  return (await db.query<T>(sql, params)).rows[0];
}
