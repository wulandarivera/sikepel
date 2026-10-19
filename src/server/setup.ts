import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { passwordSchema } from '../lib/password-policy';
import { type DB, one } from './db';
import { AppError, hashPassword, hashToken } from './security';
const account = z.object({name:z.string().trim().min(1).max(100),username:z.string().trim().regex(/^[a-zA-Z0-9._-]{3,100}$/).transform(s=>s.toLowerCase()),password:passwordSchema}).strict();
const schema = z.object({token:z.string().max(256),village:z.object({name:z.string().trim().min(1).max(100),code:z.string().trim().min(1).max(20),district:z.string().trim().min(1).max(100),city:z.string().trim().min(1).max(100),province:z.string().trim().min(1).max(100),address:z.string().trim().min(1).max(500),phone:z.string().max(100).optional(),email:z.string().max(100).optional(),postal_code:z.string().max(20).optional()}).strict(),superAdmin:account,admin:account,operator:account}).strict();
export async function initializeSetup(db:DB,token:string){
 await db.exec(`CREATE TABLE IF NOT EXISTS installation_setup (id integer PRIMARY KEY CHECK(id=1), token_hash text NOT NULL, completed_at timestamptz);`);
 // An existing installation is never eligible for unauthenticated setup.
 await db.query(`INSERT INTO installation_setup(id,token_hash,completed_at) VALUES(1,$1,CASE WHEN EXISTS(SELECT 1 FROM users) THEN now() ELSE NULL END) ON CONFLICT(id) DO NOTHING`,[hashToken(token)]);
}
// Explicit local recovery only: never reset completed or populated installations.
export async function rotatePendingSetupToken(db:DB,token:string){
 if(!token || token.length>256) throw new AppError(400,'Token penyiapan tidak valid.');
 return db.transaction(async tx=>{
  const state=await one(tx,'SELECT completed_at FROM installation_setup WHERE id=1 FOR UPDATE');
  if(!state || state.completed_at || await one(tx,'SELECT id FROM users LIMIT 1')) throw new AppError(409,'Penyiapan sudah selesai dan terkunci.');
  await tx.query('UPDATE installation_setup SET token_hash=$1 WHERE id=1',[hashToken(token)]);
 });
}
export async function setupPending(db:DB){
 const row=await one(db,'SELECT completed_at FROM installation_setup WHERE id=1');
 return !!row && !row.completed_at;
}
export async function completeSetup(db:DB,raw:unknown){
 const parsed=schema.safeParse(raw);
 if(!parsed.success) throw new AppError(400,'Isi seluruh kolom. Kata sandi minimal 6 karakter; username 3–100 huruf, angka, titik, garis bawah atau tanda hubung.');
 const input=parsed.data;
 if(new Set([input.superAdmin.username,input.admin.username,input.operator.username]).size!==3) throw new AppError(400,'Username setiap akun harus berbeda.');
 // Persistent global limiter cannot be bypassed by changing a username or header.
 const limit=await one(db,`INSERT INTO login_attempts(key,attempts,reset_at) VALUES('first-run',1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts`);
 if(limit.attempts>10) throw new AppError(429,'Terlalu banyak percobaan penyiapan. Coba lagi dalam 15 menit.');
 return db.transaction(async tx=>{
 const state=await one(tx,'SELECT token_hash,completed_at FROM installation_setup WHERE id=1 FOR UPDATE');
 if(!state || state.completed_at || await one(tx,'SELECT id FROM users LIMIT 1')) throw new AppError(409,'Penyiapan sudah selesai dan terkunci.');
 const supplied=Buffer.from(hashToken(input.token));
 if(!timingSafeEqual(supplied,Buffer.from(state.token_hash))) throw new AppError(403,'Token penyiapan tidak sesuai.');
 const villageId=randomUUID();
 const {name,code,...data}=input.village;
 await tx.query('INSERT INTO villages(id,name,code,data) VALUES($1,$2,$3,$4)',[villageId,name,code,JSON.stringify(data)]);
 for(const [a,role] of [[input.superAdmin,'SUPER_ADMIN'],[input.admin,'ADMIN'],[input.operator,'OPERATOR']] as const){
 await tx.query('INSERT INTO users(id,village_id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),role==='SUPER_ADMIN'?null:villageId,a.name,a.username,hashPassword(a.password),role]);
 }
 await tx.query('UPDATE installation_setup SET completed_at=now(),token_hash=$1 WHERE id=1',[hashToken(randomUUID())]);
 return {ok:true};
 });
}
