import {randomBytes,createHmac} from 'node:crypto';
export const validRequestId=(id:unknown):id is string => typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export type Receipt={requestId:string;stage:string;messageRef:string|null;deduped:boolean;at:number};
export class ReceiptDiagnostics {
 private secret=randomBytes(32);
 private entries=new Map<string,{id:string;until:number;last:number}>();
 private early=new Map<string,{status:number;until:number}>();
 private inFlight=0;
 private maxEntries:number;private ttlMs:number;private now:()=>number;
 constructor(private emit:(event:Receipt)=>void,{maxEntries=1000,ttlMs=86400000,now=Date.now}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isFinite(ttlMs)||ttlMs<=0)throw Error('Invalid diagnostic limits');
  this.maxEntries=maxEntries;this.ttlMs=ttlMs;this.now=now;
 }
 private ref(id:string){return createHmac('sha256',this.secret).update(id).digest('hex');}
 private prune(){for(const map of [this.entries,this.early])for(const [k,v] of map)if(v.until<=this.now())map.delete(k);}
 private cap(map:Map<string,unknown>,key:string){if(!map.has(key)&&map.size>=this.maxEntries)map.delete(map.keys().next().value!);}
 private record(id:string,stage:string,ref:string|null=null,deduped=false):Receipt {
  const event=Object.freeze({requestId:id,stage,messageRef:ref,deduped,at:this.now()});try{this.emit(event);}catch{}return event;
 }
 dedup(id:string){if(!validRequestId(id))throw Error('Invalid request ID');return this.record(id,'deduped',null,true);}
 async send(id:string,send:()=>Promise<any>):Promise<Receipt>{
  if(!validRequestId(id))throw Error('Invalid request ID');this.inFlight++;
  try{
   const sent=await send();let ref:string|null=null;
   if(typeof sent?.key?.id==='string'&&sent.key.id.length>0&&sent.key.id.length<=256){
    ref=this.ref(sent.key.id);this.prune();this.cap(this.entries,ref);this.entries.set(ref,{id,until:this.now()+this.ttlMs,last:0});
   }
   const receipt=this.record(id,'socket_resolved',ref);
   if(ref){const pending=this.early.get(ref);this.early.delete(ref);if(pending)this.accept(ref,pending.status);}
   return receipt;
  }catch(error){this.record(id,'socket_failed');throw error;}
  finally{this.inFlight--;if(!this.inFlight)this.early.clear();}
 }
 private accept(ref:string,status:number){
  const stages:Record<number,string>={2:'server_ack',3:'peer_ack',4:'read_ack',5:'played_ack'};
  const entry=this.entries.get(ref);if(!entry||status<=entry.last)return false;
  entry.last=status;this.record(entry.id,stages[status],ref);return true;
 }
 ack(key:{id?:string|null;fromMe?:boolean|null},status:number|null|undefined){
  if(key?.fromMe!==true||typeof key.id!=='string'||!key.id.length||key.id.length>256||!Number.isInteger(status)||![2,3,4,5].includes(status!))return false;
  this.prune();const ref=this.ref(key.id);
  if(this.entries.has(ref))return this.accept(ref,status!);
  if(this.inFlight){const old=this.early.get(ref);this.cap(this.early,ref);this.early.set(ref,{status:Math.max(old?.status||0,status!),until:this.now()+this.ttlMs});}
  return false;
 }
}
