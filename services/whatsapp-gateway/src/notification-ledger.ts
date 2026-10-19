import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {config} from './config.js';
export class NotificationLedger {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private file=path.join(config.sessionDir,'notification-ledger.json')){}
 run(key:string,status:string,send:()=>Promise<void>):Promise<boolean>{
 const job=this.queue.then(async()=>{
  let entries:Record<string,string>={};
  try{entries=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const hash=createHash('sha256').update(key).digest('hex');
  if(entries[hash]===status)return false;
  await send();
  entries[hash]=status;
  await fs.mkdir(path.dirname(this.file),{recursive:true});
  await fs.writeFile(this.file+'.tmp',JSON.stringify(entries),{mode:0o600});
  await fs.rename(this.file+'.tmp',this.file);
  return true;
 });
 this.queue=job.catch(()=>{});return job;
 }
}
