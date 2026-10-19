import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
process.env.SIKEPEL_DATA_DIR=path.resolve('.data','test-password-'+randomUUID());
delete process.env.DATABASE_URL;
test('create, managed reset, self-change, and login enforce coherent six-character policy',async()=>{
 const {getDB}=await import('../src/server/db');const db=await getDB();
 const {initializeSetup,completeSetup}=await import('../src/server/setup');
 const route=await import('../src/app/api/[...path]/route');
 const origin='http://localhost:3000';
 async function req(url:string,method:string,data:unknown,cookie=''){
  return (route as any)[method](new NextRequest(origin+'/api/'+url,{method,headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(data)}),{params:Promise.resolve({path:url.split('/')})});
 }
 try{
 await db.exec(await fs.readFile('migrations/001_core.sql','utf8'));
 await initializeSetup(db,'test-token');
 const account=(username:string)=>({name:username,username,password:'abcdef'});
 await completeSetup(db,{token:'test-token',village:{name:'Uji',code:'UJI',district:'Uji',city:'Uji',province:'Uji',address:'Uji'},superAdmin:account('owner'),admin:account('admin'),operator:account('operator')});
 const login=await req('login','POST',{username:'owner',password:'abcdef'});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')!.split(';')[0];
 const user={name:'New',username:'new.user',role:'SUPER_ADMIN',active:true,password:'abcde'};
 assert.equal((await req('users','POST',user,cookie)).status,400);
 const created=await req('users','POST',{...user,password:'abcdef'},cookie);assert.equal(created.status,200);
 const id=(await db.query<any>("SELECT id FROM users WHERE username='new.user'")).rows[0].id;
 assert.equal((await req('users/'+id,'PATCH',{...user,password:'abcde'},cookie)).status,400);
 assert.equal((await req('users/'+id,'PATCH',{...user,password:'ghijkl'},cookie)).status,200);
 assert.equal((await req('profile','PATCH',{name:'Owner',current_password:'abcdef',new_password:'abcde'},cookie)).status,400);
 assert.equal((await req('profile','PATCH',{name:'Owner',current_password:'abcdef',new_password:'ghijkl'},cookie)).status,200);
 assert.equal((await req('login','POST',{username:'owner',password:'ghijkl'})).status,200);
 }finally{await db.close();await fs.rm(process.env.SIKEPEL_DATA_DIR!,{recursive:true,force:true});}
});
