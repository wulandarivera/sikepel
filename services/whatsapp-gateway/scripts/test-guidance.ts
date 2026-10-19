import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleIncomingMessage } from '../src/bot.js';
const incoming = (id:string, jid='fixture@s.whatsapp.net') => ({key:{id,remoteJid:jid,fromMe:false},message:{conversation:'halo'}} as any);
test('first greeting once per contact and ignores replay and groups', async()=>{
 const sent:string[]=[]; const sock={sendMessage:async(_jid:string, body:any)=>{sent.push(body.text); return {};}} as any;
 await handleIncomingMessage(sock,incoming('one'));
 await handleIncomingMessage(sock,incoming('one'));
 await handleIncomingMessage(sock,incoming('two'));
 await handleIncomingMessage(sock,incoming('group','fixture@g.us'));
 assert.equal(sent.length,1);
 assert.match(sent[0],/mandiri.sikepel.biz.id/);
 assert.ok(sent[0].length<600);
 assert.doesNotMatch(sent[0],/08.00|15.00/);
});

import { processMessageText } from '../src/bot.js';
test('ticket lookup directs authenticated portal without private data', async()=>{
 const text=await processMessageText('TIK-202610-ABCD1234');
 assert.match(text!,/lacak\?tiket=TIK-202610-ABCD1234/);
 assert.match(text!,/tanggal lahir/i);
 assert.doesNotMatch(text!,/tidak ditemukan|Pemohon:/i);
});
test('intent and concise fallback have no invented hours or requirements',async()=>{
 for(const input of ['status','persyaratan','bantuan','jam pelayanan','lokasi','mau ajukan surat','acak']){
  const text=await processMessageText(input);
  assert.ok(text && text.length<600);
  assert.doesNotMatch(text!,/08.00|15.00|Fotokopi|No. 1/);
 }
});
