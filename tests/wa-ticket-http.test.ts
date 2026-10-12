import {test} from 'node:test';
import assert from 'node:assert/strict';
import { ticketStatusResponse } from '../src/server/wa-ticket-status';
const village='11111111-1111-4111-8111-111111111111';
const request=(auth='Bearer fixture-secret',scope=village)=>new Request('http://fixture/api/internal/wa-bot/ticket-status?ticket=TIK-202610-ABCD1234&sender=6281234567890',{headers:{authorization:auth,'X-WA-Village-ID':scope}});
test('internal status refuses missing secret and mismatched scope before DB access',async()=>{
 let reads=0; const lookup=async()=>{reads++;return null;};
 for(const config of [{secret:'',villageId:village},{secret:'fixture-secret',villageId:village}]){
 const response=await ticketStatusResponse(request(''),config,lookup);
 assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.equal((await ticketStatusResponse(request('Bearer fixture-secret','other'),{secret:'fixture-secret',villageId:village},lookup)).status,403);
 assert.equal(reads,0);
});
test('internal status authenticates gateway and forwards owner plus scope without PII',async()=>{
 let args:any[]=[];
 const response=await ticketStatusResponse(request(),{secret:'fixture-secret',villageId:village},async(...values)=>{args=values;return {ticket_code:'TIK-202610-ABCD1234',status:'APPROVED',resident_name:'PRIVATE'} as any;});
 assert.deepEqual(args,['TIK-202610-ABCD1234','6281234567890',village]);
 assert.deepEqual(await response.json(),{ticket_code:'TIK-202610-ABCD1234',status:'APPROVED'});
});
test('missing ticket and unavailable owner return identical minimal denial',async()=>{
 const config={secret:'fixture-secret',villageId:village};
 assert.deepEqual(await (await ticketStatusResponse(request(),config,async()=>null)).json(),{error:'Status tidak tersedia. Gunakan portal pelacakan.'});
});
