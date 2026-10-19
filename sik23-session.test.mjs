import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(process.env.SIK23_BUILT ? 'services/whatsapp-gateway/dist/session.js' : 'services/whatsapp-gateway/src/session.ts','utf8');
const body=source.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,'');
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
for(const trigger of ['init','connection','decrypt','reset','logout','retry']) test(trigger+' preserves auth and fails closed',async()=>{
 const dir=await fs.mkdtemp('/tmp/sik23-auth-');const bytes=Buffer.from('synthetic-credential-bytes');await fs.writeFile(dir+'/creds.json',bytes);await fs.writeFile(dir+'/sentinel','keep');
 const handlers={};let authCalls=0,end=0,logout=0;
 const sock={ev:{on:(k,v)=>handlers[k]=v},end:()=>end++,logout:async()=>logout++};
 globalThis.__fixture={fs,config:{sessionDir:dir},logger:{info(){},warn(){},error(){},child(){return this;}},ReceiptDiagnostics:class{ack(){}},DashboardLogs:class{list(){return []}clear(){}add(){}},cleanName:x=>x,qrDataUrl:()=>null,qrcode:{generate(){}},handleIncomingMessage:async()=>{},DisconnectReason:{badSession:500,loggedOut:401},proto:{WebMessageInfo:{StubType:{CIPHERTEXT:2}}},useMultiFileAuthState:async()=>{authCalls++;if(trigger==='init')throw Error('Bad MAC secret-content');return {state:{},saveCreds:async()=>{}}},fetchLatestBaileysVersion:async()=>({version:[1,2,3]}),makeWASocket:()=>sock};
 const prefix='const {fs,config,logger,ReceiptDiagnostics,DashboardLogs,cleanName,qrDataUrl,qrcode,handleIncomingMessage,DisconnectReason,proto,useMultiFileAuthState,fetchLatestBaileysVersion,makeWASocket}=globalThis.__fixture;';
 const {WhatsAppSessionManager}=await import('data:text/javascript;base64,'+Buffer.from(prefix+js+'\n//'+trigger).toString('base64'));const m=new WhatsAppSessionManager();
 try{await m.init();
 if(trigger==='connection')handlers['connection.update']({connection:'close',lastDisconnect:{error:Error('Bad MAC secret-content')}});
 if(trigger==='decrypt')await handlers['messages.upsert']({type:'append',messages:[1,2,3].map(i=>({key:{id:'synthetic'+i},messageStubType:2}))});
 if(trigger==='reset')await m.resetSession('untrusted-secret');
 if(trigger==='logout')await assert.rejects(m.logout());
 if(trigger==='retry'){for(let i=0;i<10;i++)m.schedule(m.generation,1);await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,30));
 assert.deepEqual(await fs.readFile(dir+'/creds.json'),bytes);assert.equal(await fs.readFile(dir+'/sentinel','utf8'),'keep');assert.equal(logout,0);
 if(trigger!=='retry'){assert.equal(m.getStatus().state,'blocked');assert.equal(m.getStatus().action,'operator_review_required');const n=authCalls;await m.init();await m.connect();assert.equal(authCalls,n);}
 else {assert.ok(authCalls<=4);assert.equal(m.getStatus().state,'blocked');}
 }finally{await m.disconnect();await fs.rm(dir,{recursive:true,force:true});}
});
