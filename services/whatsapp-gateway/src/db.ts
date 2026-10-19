import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";
const { Pool } = pg;
let pool: pg.Pool | null = null;
if (config.databaseUrl) {
 pool = new Pool({connectionString:config.databaseUrl,max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
 pool.on('error',()=>logger.warn('Database pool idle error'));
}
export function getPool(): pg.Pool | null {return pool;}
export interface MinimalTicketStatus {ticket_code:string;status:string}
// Single owner/scope policy lives in the application, including PGlite runtimes.
export async function findTicketByCode(ticketCode:string,senderPhone=''):Promise<MinimalTicketStatus|null> {
 const village=process.env.WA_GATEWAY_VILLAGE_ID||'';
 if(!config.secret || !village || !/^\+?(?:628|08)\d{7,12}$/.test(senderPhone)) return null;
 const ticket=ticketCode.trim().toUpperCase();
 if(!/^TIK-\d{6}-[A-Z0-9]{4,16}$/.test(ticket)) return null;
 try {
 const url=new URL('/api/internal/wa-bot/ticket-status',config.sikepelInternalUrl);
 url.searchParams.set('ticket',ticket);url.searchParams.set('sender',senderPhone);
 const response=await fetch(url,{headers:{Authorization:`Bearer ${config.secret}`,'X-WA-Village-ID':village},signal:AbortSignal.timeout(4000)});
 if(!response.ok) return null;
 const row=await response.json() as MinimalTicketStatus;
 if(row.ticket_code!==ticket || !['PENDING_VERIFICATION','APPROVED','NEEDS_REVISION','REJECTED','COMPLETED','SIAP_DIAMBIL'].includes(row.status)) return null;
 return {ticket_code:row.ticket_code,status:row.status};
 } catch {logger.warn('Status lookup unavailable');return null;}
}
