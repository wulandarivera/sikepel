import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {dataRoot,getDB,one} from '../src/server/db';
import {rotatePendingSetupToken} from '../src/server/setup';
import {hashToken} from '../src/server/security';
async function main(){
 if(process.env.DATABASE_URL || process.env.VERCEL==='1') throw new Error('Local installations only.');
 // PGlite must not be opened by two processes. Refuse the managed service while live.
 const active=execFileSync('systemctl',['--user','show','sikepel','--property=ActiveState','--value'],{encoding:'utf8'}).trim();
 if(!['inactive','failed'].includes(active)) throw new Error('Stop sikepel before synchronizing the token.');
 const tokenPath=path.join(dataRoot(),'SETUP-TOKEN.txt');
 const stat=await fs.lstat(tokenPath); if(!stat.isFile() || stat.isSymbolicLink()) throw new Error('Token must be a regular private file.');
 await fs.chmod(tokenPath,0o600);
 const token=(await fs.readFile(tokenPath,'utf8')).trim();
 const db=await getDB();
 try{
  const before=await one(db,'SELECT token_hash FROM installation_setup WHERE id=1');
  await rotatePendingSetupToken(db,token);
  const state=await one(db,'SELECT token_hash,completed_at FROM installation_setup WHERE id=1');
  const users=await one(db,'SELECT count(*)::int n FROM users');
  if(state.token_hash!==hashToken(token) || state.completed_at || users.n!==0) throw new Error('Pending setup verification failed.');
  console.log(JSON.stringify({previousHashMatched:before?.token_hash===hashToken(token),fileHashMatchesDatabase:true,pending:true,users:users.n,tokenFileMode:'600',tokenPreserved:true}));
 }finally{await db.close();}
}
main().catch(()=>{console.error('Token synchronization failed; check service and pending installation state. No secrets logged.');process.exitCode=1;});
