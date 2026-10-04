import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {NextRequest} from 'next/server';
process.env.SIKEPEL_DATA_DIR=path.resolve('.data','test-'+randomUUID());
delete process.env.DATABASE_URL;
test('fresh setup has templates without users; endpoint rejects cross-origin and limits attempts',async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/setup.ts'],{env:process.env,stdio:'pipe'});
 const {getDB}=await import('../src/server/db'); const db=await getDB();
 const route=await import('../src/app/api/[...path]/route');
 const request=(method:string,origin='http://localhost:3000',body?:unknown)=>route[method as 'GET'|'POST'](new NextRequest('http://localhost:3000/api/setup',{method,headers:{origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),{params:Promise.resolve({path:['setup']})});
 try{
 assert.equal((await db.query<any>('SELECT count(*)::int n FROM users')).rows[0].n,0);
 assert.equal((await db.query<any>('SELECT count(*)::int n FROM residents')).rows[0].n,0);
 assert.equal((await db.query<any>('SELECT count(*)::int n FROM templates')).rows[0].n,11);
 assert.equal((await request('GET')).status,200);
 assert.equal((await request('POST','http://evil.test',{})).status,403);
 const body={token:'invalid',village:{name:'Uji',code:'UJI',district:'Uji',city:'Uji',province:'Uji',address:'Uji'},superAdmin:{name:'S',username:'sup',password:'test-password-123'},admin:{name:'A',username:'adm',password:'test-password-123'},operator:{name:'O',username:'opr',password:'test-password-123'}};
 for(let i=0;i<10;i++) assert.equal((await request('POST',undefined,body)).status,403);
 assert.equal((await request('POST',undefined,body)).status,429);
 }finally{await db.close();await fs.rm(process.env.SIKEPEL_DATA_DIR!,{recursive:true,force:true});}
});
