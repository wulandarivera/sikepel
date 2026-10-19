'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ReceiptDiagnostics}=require('./src/receipt-diagnostics.cjs');
test('revision correlation crosses fake notifier and socket without personal logging',async()=>{
 const events=[];const d=new ReceiptDiagnostics(e=>events.push(e));
 const requestId=d.begin();let passed;
 const receipt=await d.notify(requestId,async(id)=>{passed=id;return d.send(id,async()=>({key:{id:'fake-message-id'},message:{conversation:'PRIVATE_BODY'}}));});
 assert.equal(passed,requestId);assert.equal(receipt.stage,'socket_resolved');assert.equal(receipt.deduped,false);assert.ok(receipt.messageRef);
 d.ack({id:'fake-message-id',fromMe:true},3);d.ack({id:'fake-message-id',fromMe:true},4);
 assert.ok(events.some(e=>e.stage==='peer_ack'));assert.ok(events.some(e=>e.stage==='read_ack'));
 const text=JSON.stringify(events);for(const forbidden of ['fake-message-id','PRIVATE_BODY','delivered','decrypted'])assert.ok(!text.includes(forbidden));
 assert.equal(events.at(-1).requestId,requestId);
});
test('dedup is explicit and never invokes socket',async()=>{let sends=0;const e=[];const d=new ReceiptDiagnostics(x=>e.push(x));const id=d.begin();const r=await d.send(id,async()=>{sends++;},{deduped:true});assert.equal(sends,0);assert.equal(r.stage,'deduped');assert.equal(r.messageRef,null);});
test('unknown ACK and inbound ACK are not attributed',()=>{const e=[];const d=new ReceiptDiagnostics(x=>e.push(x));assert.equal(d.ack({id:'unknown',fromMe:true},3),false);assert.equal(e.length,0);});
test('failure payload is never logged and original failure propagates',async()=>{const e=[];const d=new ReceiptDiagnostics(x=>e.push(x));const id=d.begin();const err=new Error('PRIVATE_SECRET_URL');await assert.rejects(d.send(id,async()=>{throw err;}),x=>x===err);assert.ok(!JSON.stringify(e).includes('PRIVATE_SECRET_URL'));assert.equal(e.at(-1).stage,'socket_failed');});
test('invalid request IDs fail closed before socket',async()=>{const d=new ReceiptDiagnostics(()=>{});let called=false;await assert.rejects(d.send('PRIVATE_PHONE',async()=>{called=true;}));assert.equal(called,false);});
test('bounded store expires correlation and logging exceptions never trigger resend',async()=>{let now=0;let calls=0;const d=new ReceiptDiagnostics(()=>{throw Error('logger');},{maxEntries:1,ttlMs:10,now:()=>now});let id=d.begin();await d.send(id,async()=>{calls++;return {key:{id:'one'}};});id=d.begin();await d.send(id,async()=>{calls++;return {key:{id:'two'}};});assert.equal(d.ack({id:'one',fromMe:true},3),false);now=11;assert.equal(d.ack({id:'two',fromMe:true},3),false);assert.equal(calls,2);});

test('untrusted notifier fields cannot leak and ACK requires explicit outbound key',async()=>{const e=[];const d=new ReceiptDiagnostics(x=>e.push(x));const id=d.begin();await d.notify(id,async()=>({messageRef:'PRIVATE_BODY',deduped:true}));assert.ok(!JSON.stringify(e).includes('PRIVATE_BODY'));await d.send(id,async()=>({key:{id:'outbound'}}));assert.equal(d.ack({id:'outbound',fromMe:false},3),false);assert.equal(d.ack({id:'outbound',fromMe:true},3),true);});