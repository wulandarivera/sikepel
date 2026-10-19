import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processMessageText} from '../src/bot.js';
const code='TIK-202610-ABCD1234';
test('bot exposes status only after sender-bound lookup',async()=>{
 let args:any[]=[];
 const reply=await processMessageText(code,{phone:'6281234567890'},async(...values)=>{args=values;return {ticket_code:code,status:'APPROVED'};});
 assert.deepEqual(args,[code,'6281234567890']);
 assert.match(reply!,/disetujui/i);assert.doesNotMatch(reply!,/Pemohon:|Jenis Surat:|KTP/);
});
test('bot denial and unavailable lookup preserve identical portal response',async()=>{
 const denied=await processMessageText(code,{phone:'6289999999999'},async()=>null);
 const failed=await processMessageText(code,{phone:'6289999999999'},async()=>{throw Error('fixture');});
 assert.equal(failed,denied);assert.match(denied!,/tanggal lahir/);
});
