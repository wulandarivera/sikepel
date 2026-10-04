import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import { verifyPassword, authorizeRow } from '../src/server/security';
const input = { token: 'a'.repeat(64), village: {name:'Kelurahan Uji',code:'UJI',district:'Kecamatan Uji',city:'Kota Uji',province:'Banten',address:'Alamat Uji'}, superAdmin:{name:'Pemilik',username:'pemilik',password:'Strong-test-123!'}, admin:{name:'Admin',username:'admin.uji',password:'Other-test-123!'}, operator:{name:'Operator',username:'operator.uji',password:'Operator-test-123!'} };
test('setup assigns fixed roles and tenant, hashes passwords, locks repeat and concurrent bootstrap', async () => {
 const mod = await import('../src/server/setup').catch(()=>null);
 assert.ok(mod, 'setup feature must exist');
 const pg = new PGlite(); await pg.waitReady;
 const wrap = (client:any):any => ({query:(s:string,p:any[])=>client.query(s,p),exec:(s:string)=>client.exec(s),transaction:(f:any)=>client.transaction((tx:any)=>f(wrap(tx)))});
 const db = wrap(pg);
 try {
 await pg.exec(await fs.readFile('migrations/001_core.sql','utf8'));
 await mod.initializeSetup(db,input.token);
 await assert.rejects(()=>mod.completeSetup(db,{...input,token:'wrong'}));
 const results=await Promise.allSettled([mod.completeSetup(db,input),mod.completeSetup(db,input)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const users=(await pg.query<any>('SELECT * FROM users ORDER BY role')).rows;
 assert.deepEqual(users.map(u=>u.role),['ADMIN','OPERATOR','SUPER_ADMIN']);
 const village=(await pg.query<any>('SELECT id FROM villages')).rows[0].id;
 for(const u of users){ assert.equal(u.village_id,u.role==='SUPER_ADMIN'?null:village); const account=u.role==='ADMIN'?input.admin:u.role==='OPERATOR'?input.operator:input.superAdmin; assert.notEqual(u.password_hash,account.password); assert.ok(verifyPassword(account.password,u.password_hash)); }
 assert.throws(()=>authorizeRow(users[0],{id:'other-row',village_id:'other'}));
 await assert.rejects(()=>mod.completeSetup(db,input));
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM residents')).rows[0].n,0);
 } finally {await pg.close();}
});
