import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatNotificationMessage} from '../src/formatters.js';
import {formatWhatsAppMessage} from '../../../src/server/whatsapp.ts';
import {createHttpServer} from '../src/server.js';
import {config} from '../src/config.js';
test('canonical notices exclude private fields and match app formatter',()=>{
 for(const status of ['SUBMITTED','PENDING_VERIFICATION','APPROVED','NEEDS_REVISION','REJECTED','COMPLETED','SIAP_DIAMBIL']){
 const p:any={to:'081234567890',ticket:'TIK-202610-TEST1234',status,type_name:'PRIVATE TYPE',resident_name:'PRIVATE NAME',note:'PRIVATE NOTE'};
 const text=formatNotificationMessage(p);
 assert.doesNotMatch(text,/PRIVATE|KTP elektronik asli|berkas persyaratan asli/);
 assert.match(text,/lacak/); assert.equal(text,formatWhatsAppMessage(p));
 }
});
test('notify dedupes concurrent repeated transition and accepts later transition',async()=>{
 config.secret='fixture-only';config.sessionDir=await (await import('node:fs/promises')).mkdtemp('/tmp/wa-ledger-fixture-');let sent=0;
 const manager:any={getStatus:()=>({connected:true}),getSocket:()=>({sendMessage:async()=>{sent++;return {key:{id:'fixture'}}}})};
 const server=createHttpServer(manager);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try {
 const url=`http://127.0.0.1:${(server.address() as any).port}/notify`;
 const post=(status:string)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-only'},body:JSON.stringify({to:'081234567890',ticket:'TIK-202610-DEDU1234',status,type_name:'Fixture',resident_name:'PRIVATE',message:'PRIVATE'})});
 const results=await Promise.all([post('APPROVED'),post('APPROVED')]);
 assert.ok(results.every(r=>r.ok));assert.equal(sent,1);
 assert.ok((await post('COMPLETED')).ok);assert.equal(sent,2);
 assert.equal((await post('UNKNOWN')).status,400);
 } finally {server.close();}
});
