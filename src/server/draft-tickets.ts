import { randomBytes } from "node:crypto";
import type { DB } from "./db";
export const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export async function reserveDraftTicket(db: DB, id: string, type: {id:string;slug:string;name:string}, expires: Date, random = () => randomBytes(8).toString("hex").toUpperCase()) {
  const prefix = type.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32) || "SURAT";
  for (let attempt=0; attempt<20; attempt++) {
    const ticket = `${prefix}-${random()}`;
    const result=await db.query("INSERT INTO draft_ticket_registry(ticket,letter_id,type_id,type_name,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ticket) DO NOTHING RETURNING ticket", [ticket,id,type.id,type.name,expires]);
    if(result.rows.length) return ticket;
  }
  throw new Error("Draft ticket collision limit reached");
}
export async function migrateDraftTickets(db: DB, now = new Date()) {
  return db.transaction(async tx => {
    const exists = await tx.query("SELECT to_regclass('letters') AS name");
    if (!exists.rows[0]?.name) return 0;
    await tx.exec(`ALTER TABLE letters ADD COLUMN IF NOT EXISTS draft_ticket text;
      ALTER TABLE letters ADD COLUMN IF NOT EXISTS draft_type_name text;
      ALTER TABLE letters ADD COLUMN IF NOT EXISTS draft_expires_at timestamptz;
      CREATE UNIQUE INDEX IF NOT EXISTS letters_draft_ticket_unique ON letters(draft_ticket);
      CREATE TABLE IF NOT EXISTS draft_ticket_registry(ticket text PRIMARY KEY,letter_id text UNIQUE NOT NULL,type_id text NOT NULL,type_name text NOT NULL,expires_at timestamptz NOT NULL,expired_at timestamptz);
      CREATE INDEX IF NOT EXISTS letters_draft_expiry ON letters(draft_expires_at) WHERE status IN ('DRAFT','PREVIEW');`);
    const rows = (await tx.query("SELECT l.id,t.id AS type_id,t.slug,t.name FROM letters l JOIN letter_types t ON t.id=l.type_id WHERE l.status IN ('DRAFT','PREVIEW') AND l.draft_ticket IS NULL FOR UPDATE OF l")).rows;
    for (const row of rows) {
      const expires=new Date(now.getTime()+DRAFT_LIFETIME_MS);
      const ticket=await reserveDraftTicket(tx,row.id,{id:row.type_id,slug:row.slug,name:row.name},expires);
      await tx.query("UPDATE letters SET draft_ticket=$2,draft_type_name=$3,draft_expires_at=$4 WHERE id=$1",[row.id,ticket,row.name,expires]);
    }
    return rows.length;
  });
}
export async function cleanupExpiredDrafts(db:DB, now=new Date()) {
  const exists=await db.query("SELECT to_regclass('draft_ticket_registry') AS name");
  if (!exists.rows[0]?.name) return 0;
  return db.transaction(async tx=> {
    const deleted=(await tx.query("DELETE FROM letters WHERE status IN ('DRAFT','PREVIEW') AND draft_expires_at <= $1 RETURNING draft_ticket",[now])).rows;
    for(const row of deleted) await tx.query("UPDATE draft_ticket_registry SET expired_at=$2 WHERE ticket=$1",[row.draft_ticket,now]);
    return deleted.length;
  });
}
export function startDraftCleanup(db:DB, options:{intervalMs?:number;now?:()=>Date}={}) {
  let running=false;
  const timer=setInterval(async()=> {
    if(running) return;
    running=true;
    try { await cleanupExpiredDrafts(db,options.now?.() ?? new Date()); }
    catch { console.error("Draft cleanup failed; will retry"); }
    finally { running=false; }
  },options.intervalMs??300000);
  timer.unref();
  return ()=>clearInterval(timer);
}
