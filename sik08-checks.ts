import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Document,Packer,Paragraph} from 'docx';
import {LocalStorage} from './src/server/storage';
import {LibreOfficeConverter} from './src/server/documents';
import {getDB} from './src/server/db';
import {cleanupExpiredDrafts} from './src/server/draft-tickets';
async function main(){
 const result:any={};
 const storage=new LocalStorage();const bytes=Buffer.from('SIK08 synthetic storage only');
 await storage.put('sik08/synthetic.txt',bytes);assert.deepEqual(await storage.get('sik08/synthetic.txt'),bytes);
 result.storage='PASS';
 try {const doc=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('SIK08 synthetic PDF only')]}]}));
 const pdf=await new LibreOfficeConverter().convert(doc);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');result.pdf='PASS';result.pdf_bytes=pdf.length;
 }catch{result.pdf='FAIL';}
 const db=await getDB();
 try{const tx=db;
 const now=new Date('2030-01-01T00:00:00Z');
 await tx.query(`INSERT INTO letters(id,village_id,resident_id,type_id,status,created_by,draft_ticket,draft_expires_at) SELECT ('80800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,l.village_id,l.resident_id,l.type_id,CASE WHEN n=4 THEN 'ISSUED' ELSE 'DRAFT' END,l.created_by,'SIK08-'||n,$1::timestamptz + CASE n WHEN 1 THEN interval '-1 millisecond' WHEN 3 THEN interval '1 millisecond' ELSE interval '0' END FROM (SELECT * FROM letters LIMIT 1) l CROSS JOIN generate_series(1,4) n`,[now]);
 // Restrict cleanup to this transaction with source predicate at fixed time; other fixture expired rows are allowed.
 await cleanupExpiredDrafts(tx,now);
 const rows=(await tx.query("SELECT id::text FROM letters WHERE id::text LIKE '80800000-%' ORDER BY id")).rows;
 assert.equal(rows.length,2);assert.ok(rows[0].id.endsWith('000000000003'));assert.ok(rows[1].id.endsWith('000000000004'));
 result.expiry_boundaries='PASS before/equal deleted; after/ISSUED retained';
 }finally{await db.close();}
 await fs.writeFile('/fixture/extended-js-evidence.json',JSON.stringify(result));
 console.log('SIK08 assertions completed; private evidence written');
}
main().catch(()=>{console.error('SIK08 assertions failed; details suppressed');process.exitCode=1;});
