import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import * as setup from '../src/server/setup';
import { hashToken } from '../src/server/security';
const input = {token:'replacement-token',village:{name:'Uji',code:'UJI',district:'Uji',city:'Uji',province:'Uji',address:'Uji'},superAdmin:{name:'Owner',username:'owner',password:'abcdef'},admin:{name:'Admin',username:'admin',password:'abcdef'},operator:{name:'Operator',username:'operator',password:'abcdef'}};
async function fixture(fn:(db:any,pg:PGlite)=>Promise<void>){
 const pg=new PGlite(); await pg.waitReady;
 const wrap=(client:any):any=>({query:(s:string,p:any[])=>client.query(s,p),exec:(s:string)=>client.exec(s),transaction:(f:any)=>client.transaction((tx:any)=>f(wrap(tx)))});
 try {await pg.exec(await fs.readFile('migrations/001_core.sql','utf8'));await setup.initializeSetup(wrap(pg),'original-token');await fn(wrap(pg),pg);} finally {await pg.close();}
}
test('explicit pending rotation synchronizes hash and rejects stale token',()=>fixture(async(db,pg)=>{
 const rotate=(setup as any).rotatePendingSetupToken;
 assert.equal(typeof rotate,'function','safe pending rotation must exist');
 await rotate(db,input.token);
 assert.equal((await pg.query<any>('SELECT token_hash FROM installation_setup')).rows[0].token_hash,hashToken(input.token));
 await assert.rejects(()=>setup.completeSetup(db,{...input,token:'original-token',superAdmin:{...input.superAdmin,password:'long-password'},admin:{...input.admin,password:'long-password'},operator:{...input.operator,password:'long-password'}}),/Token penyiapan tidak sesuai/);
}));
test('matching rotated token accepts six-character passwords, rejects five, and locks rotation after completion',()=>fixture(async(db,pg)=>{
 await setup.rotatePendingSetupToken(db,input.token);
 await assert.rejects(()=>setup.completeSetup(db,{...input,admin:{...input.admin,password:'abcde'}}),/minimal 6/);
 assert.deepEqual(await setup.completeSetup(db,input),{ok:true});
 const before=(await pg.query<any>('SELECT token_hash,completed_at FROM installation_setup')).rows[0];
 await assert.rejects(()=>setup.rotatePendingSetupToken(db,'new-token'),/terkunci/);
 assert.deepEqual((await pg.query<any>('SELECT token_hash,completed_at FROM installation_setup')).rows[0],before);
 await setup.initializeSetup(db,input.token);
 assert.equal(await setup.setupPending(db),false);
}));
test('rotation cannot reopen a pending row when accounts already exist',()=>fixture(async(db,pg)=>{
 await pg.exec("INSERT INTO users(id,name,username,password_hash,role) VALUES('00000000-0000-0000-0000-000000000001','Existing','existing','hash','SUPER_ADMIN')");
 await assert.rejects(()=>setup.rotatePendingSetupToken(db,'new-token'),/terkunci/);
 assert.equal((await pg.query<any>('SELECT token_hash FROM installation_setup')).rows[0].token_hash,hashToken('original-token'));
}));
