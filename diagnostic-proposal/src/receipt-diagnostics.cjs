'use strict';
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
class ReceiptDiagnostics {
 constructor(emit,{maxEntries=1000,ttlMs=86400000,now=Date.now}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isFinite(ttlMs)||ttlMs<=0)throw Error('Invalid diagnostic limits');
  this.emit=emit;this.maxEntries=maxEntries;this.ttlMs=ttlMs;this.now=now;this.secret=randomBytes(32);this.entries=new Map();
 }
 valid(id){if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw Error('Invalid diagnostic request ID');}
 record(requestId,stage,messageRef=null,deduped=false){
  const event={requestId,stage,messageRef,deduped};
  try{this.emit(Object.freeze(event));}catch{}
  return event;
 }
 begin(){const id=randomUUID();this.record(id,'revision_notification_requested');return id;}
 async notify(id,notifier){this.valid(id);try{const result=await notifier(id);this.record(id,'notifier_returned',typeof result?.messageRef==='string'&&/^[a-f0-9]{64}$/.test(result.messageRef)?result.messageRef:null,result?.deduped===true);return result;}catch(error){this.record(id,'notifier_failed');throw error;}}
 prune(){const now=this.now();for(const [k,v] of this.entries)if(v.until<=now)this.entries.delete(k);}
 async send(id,socketSend,{deduped=false}={}){
  this.valid(id);
  if(deduped)return this.record(id,'deduped',null,true);
  let sent;
  try{sent=await socketSend();}catch(error){this.record(id,'socket_failed');throw error;}
  let ref=null;
  if(typeof sent?.key?.id==='string'&&sent.key.id.length>0&&sent.key.id.length<=256){
   ref=createHmac('sha256',this.secret).update(sent.key.id).digest('hex');this.prune();
   if(!this.entries.has(ref)&&this.entries.size>=this.maxEntries)this.entries.delete(this.entries.keys().next().value);
   this.entries.set(ref,{id,until:this.now()+this.ttlMs,lastStatus:0});
  }
  return this.record(id,'socket_resolved',ref);
 }
 ack(key,status){
  if(key?.fromMe!==true)return false;const messageId=key.id;
  if(typeof messageId!=='string'||messageId.length>256)return false;
  const stages={2:'server_ack',3:'peer_ack',4:'read_ack',5:'played_ack'};
  if(!stages[status])return false;
  this.prune();const ref=createHmac('sha256',this.secret).update(messageId).digest('hex');const entry=this.entries.get(ref);
  if(!entry||status<=entry.lastStatus)return false;
  entry.lastStatus=status;this.record(entry.id,stages[status],ref);return true;
 }
}
module.exports={ReceiptDiagnostics};
