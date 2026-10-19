import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Pool} from 'pg';
import {cleanupExpiredDrafts} from './src/server/draft-tickets';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const wrap=(client:any):any=>({query:(s:string,p?:any[])=>client.query(s,p),transaction:async(fn:any)=>{const c=await pool.connect();try{await c.query('BEGIN');const v=await fn(wrap(c));await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}});
async function main(){
 const now=new Date('2030-01-01T00:00:00.000Z');
 await pool.query(`INSERT INTO letters(id,village_id,resident_id,type_id,status,created_by,draft_ticket,draft_expires_at) SELECT ('90900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,l.village_id,l.resident_id,l.type_id,CASE WHEN n=4 THEN 'ISSUED' WHEN n=2 THEN 'PREVIEW' ELSE 'DRAFT' END,l.created_by,'SIK09-BOUNDARY-'||n,$1::timestamptz+CASE n WHEN 1 THEN interval '-1 millisecond' WHEN 3 THEN interval '1 millisecond' ELSE interval '0' END FROM (SELECT * FROM letters LIMIT 1) l CROSS JOIN generate_series(1,4) n`,[now]);
 await cleanupExpiredDrafts(wrap(pool),now);
 const rows=(await pool.query("SELECT id::text FROM letters WHERE id::text LIKE '90900000-%' ORDER BY id")).rows;
 assert.deepEqual(rows.map((r:any)=>r.id.slice(-1)),['3','4']);
 await fs.writeFile('/fixture/boundary-evidence.json',JSON.stringify({status:'PASS',clock:'simulated explicit now 2030-01-01T00:00:00.000Z',before_ms:-1,equal_ms:0,after_ms:1,before_deleted:true,equal_preview_deleted:true,after_retained:true,issued_equal_retained:true}));
}
main().catch(()=>{console.error('Boundary assertion failed; details suppressed');process.exitCode=1;}).finally(()=>pool.end());
