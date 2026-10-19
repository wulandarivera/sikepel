import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=path.resolve('.data','test-tickets-'+randomUUID()); process.env.SIKEPEL_DATA_DIR=root; delete process.env.DATABASE_URL;
test('saved ticket is immutable and expired retrieval/edit/issuance blocked before counter allocation',async()=> {
 execFileSync(process.execPath,['--import','tsx','tests/seed-fixtures.ts'],{env:{...process.env,SIKEPEL_TEST_FIXTURES:'1'},stdio:'pipe'});
 const {getDB}=await import('../src/server/db'); const db=await getDB();
 const {saveDraft,letterById,allocateLetter}=await import('../src/server/letters');
 try {
 const user=(await db.query("SELECT * FROM users WHERE username='operator'")).rows[0];
 const resident=(await db.query('SELECT id FROM residents WHERE village_id=$1 LIMIT 1',[user.village_id])).rows[0];
 const type=(await db.query("SELECT id FROM letter_types WHERE slug='domisili'")).rows[0];
 const input={resident_id:resident.id,type_id:type.id,form_data:{}};
 const parallel:any[]=await Promise.all(Array.from({length:8},()=>saveDraft(user,input))); assert.equal(new Set(parallel.map(x=>x.draft_ticket)).size,8);
 const other=(await db.query("SELECT * FROM users WHERE username='operator.b'")).rows[0];
 await assert.rejects(letterById(db,other,parallel[0].id));
 const l:any=await saveDraft(user,input); assert.match(l.draft_ticket,/^DOMISILI-[A-F0-9]{16}$/);
 assert.equal(new Date(l.draft_expires_at).getTime()-new Date(l.created_at).getTime(),604800000);
 const others=(await db.query('SELECT id FROM letter_types WHERE id<>$1 LIMIT 1',[type.id])).rows;
 await assert.rejects(saveDraft(user,{...input,type_id:others[0].id},l.id),/jenis surat/);
 const edit:any=await saveDraft(user,{...input,form_data:{catatan:'test'}},l.id); assert.equal(edit.draft_ticket,l.draft_ticket); assert.equal(new Date(edit.draft_expires_at).getTime(),new Date(l.draft_expires_at).getTime());
 await db.query("UPDATE letters SET draft_expires_at=now()-interval '1 second',status='PREVIEW' WHERE id=$1",[l.id]);
 await assert.rejects(letterById(db,user,l.id),/kedaluwarsa/);
 await assert.rejects(saveDraft(user,input,l.id),/kedaluwarsa/);
 const before=(await db.query('SELECT count(*)::int AS n FROM counters')).rows[0].n;
 await assert.rejects(allocateLetter(user,l.id),/kedaluwarsa/); assert.equal((await db.query('SELECT count(*)::int AS n FROM counters')).rows[0].n,before);
 }finally {await db.close(); await fs.rm(root,{recursive:true,force:true});}
});
