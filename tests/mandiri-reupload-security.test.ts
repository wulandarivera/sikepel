import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { DB } from "../src/server/db";
import { migrateMandiri } from "../src/server/mandiri-schema";
import { mandiriResponse } from "../src/server/mandiri";

test("reupload security regressions", async (t) => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"test-reupload-security-"));
 const oldData=process.env.SIKEPEL_DATA_DIR,oldVillage=process.env.MANDIRI_VILLAGE_ID;
 process.env.SIKEPEL_DATA_DIR=root;
 const pg=new PGlite();await pg.waitReady;
 const wrap=(c:any):DB=>({query:(s,p)=>c.query(s,p),exec:s=>c.exec(s),close:()=>pg.close(),transaction:fn=>c.transaction((tx:any)=>fn(wrap(tx)))});
 const db=wrap(pg), village=randomUUID(), other=randomUUID(),type=randomUUID(),id=randomUUID();
 const ticket="TIK-202610-11223344", dob="2000-01-01",origin="https://fixture.invalid";
 process.env.MANDIRI_VILLAGE_ID=village;
 const png=await sharp({create:{width:1,height:1,channels:3,background:"white"}}).png().toBuffer();
 const form=(birth:string|null=dob)=>{const f=new FormData();f.append("ticket",ticket);if(birth!==null)f.append("birth_date",birth);f.append("ktp",new Blob([png],{type:"image/png"}),"ktp.png");return f;};
 const call=(f:FormData)=>mandiriResponse(new Request(origin+"/api/mandiri/reupload",{method:"POST",headers:{origin},body:f}),"reupload",db);
 const reset=()=>db.query("DELETE FROM mandiri_attempts");
 try {
 await db.exec(await fs.readFile("migrations/001_core.sql","utf8"));await migrateMandiri(db);
 for(const [v,c] of [[village,"A"],[other,"B"]])await db.query("INSERT INTO villages(id,name,code) VALUES($1,$2,$3)",[v,"Synthetic",c]);
 await db.query("INSERT INTO letter_types(id,name,code,slug,category) VALUES($1,'Synthetic','S','synthetic','umum')",[type]);
 await db.query("INSERT INTO online_requests(id,ticket_code,type_id,village_id,form_data,contact_phone,tracking_token_hash,tracking_expires_at,status) VALUES($1,$2,$3,$4,$5,'0800000000','fixture',now()+interval '1 day','NEEDS_REVISION')",[id,ticket,type,village,JSON.stringify({resident:{birth_date:dob}})]);
 await t.test("birth date is mandatory and valid; ownership binds ticket and village",async()=>{
 for(const [birth,status] of [[null,400],["",400],["2000-02-30",400],["not-a-date",400],["2001-01-01",404]] as const){await reset();assert.equal((await call(form(birth))).status,status,`birth_date=${birth}`);}
 process.env.MANDIRI_VILLAGE_ID=other;await reset();assert.equal((await call(form())).status,404);process.env.MANDIRI_VILLAGE_ID=village;
 assert.equal((await db.query("SELECT attachments FROM online_requests WHERE id=$1",[id])).rows[0].attachments.length,0);
 assert.equal((await db.query("SELECT id FROM audit_logs")).rows.length,0);
 });
 await t.test("duplicate multipart fields fail closed",async()=>{
 for(const key of ["ktp","kk","surat_pendukung","file","attachments","ticket","birth_date"]){
 await reset();const f=form();const v=f.get(key);
 if(key==="ticket"||key==="birth_date")f.append(key,String(v));
 else {if(!v)f.append(key,new Blob([png],{type:"image/png"}),"one.png");f.append(key,new Blob([png],{type:"image/png"}),"two.png");}
 assert.equal((await call(f)).status,400,key);
 }
 });
 } finally {await pg.close();await fs.rm(root,{recursive:true,force:true});if(oldData===undefined)delete process.env.SIKEPEL_DATA_DIR;else process.env.SIKEPEL_DATA_DIR=oldData;if(oldVillage===undefined)delete process.env.MANDIRI_VILLAGE_ID;else process.env.MANDIRI_VILLAGE_ID=oldVillage;}
});
