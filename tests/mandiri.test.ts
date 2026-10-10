import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DB } from "../src/server/db";
import { migrateMandiri } from "../src/server/mandiri-schema";
import { mandiriResponse } from "../src/server/mandiri";
import { proxy } from "../src/proxy";
import { NextRequest } from "next/server";

test("mandiri: private proposals, token tracking, uploads, tenant isolation and throttling", async () => {
  const root = path.resolve(".data", "test-mandiri-" + randomUUID());
  process.env.SIKEPEL_DATA_DIR = root;
  const pg = new PGlite();
  await pg.waitReady;
  const wrap = (client: any): DB => ({ query: (s,p) => client.query(s,p), exec: s => client.exec(s), close: () => pg.close(), transaction: fn => client.transaction((tx: any) => fn(wrap(tx))) });
  const db = wrap(pg);
  const village = randomUUID(), other = randomUUID(), type = randomUUID(), resident = randomUUID();
  const origin = "https://mandiri.sikepel.biz.id";
  process.env.MANDIRI_VILLAGE_ID = village;
  async function call(route: string, method = "GET", body?: unknown, token?: string, headers?: Record<string, string>) {
    const req = new Request(origin + "/api/mandiri/" + route, { method, headers: { origin, ...(token ? {authorization: "Bearer " + token} : {}), ...(headers || {}) }, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });
    return mandiriResponse(req, route, db);
  }
  try {
    await db.exec(await fs.readFile("migrations/001_core.sql", "utf8"));
    await migrateMandiri(db); await migrateMandiri(db);
    await db.query("INSERT INTO villages(id,name,code) VALUES($1,'A','A'),($2,'B','B')", [village,other]);
    await db.query("INSERT INTO letter_types(id,name,code,slug,category) VALUES($1,'Surat','S','surat','umum')", [type]);
    await db.query("INSERT INTO residents(id,village_id,nik,name,data) VALUES($1,$2,'1234567890123456','Rahasia',$3)", [resident,village,JSON.stringify({birth_date:'2000-01-01',phone:'0811111111'})]);
    const fields = [{key:'negara_pemohon',label:'Negara',type:'text',required:false}, {key:'purpose',label:'Keperluan',type:'textarea',required:true}];
    await db.query('UPDATE letter_types SET fields=$1 WHERE id=$2',[JSON.stringify(fields),type]);
    const hidden = randomUUID();
    await db.query("INSERT INTO letter_types(id,name,code,slug,category,active) VALUES($1,'Nonaktif','N','nonaktif','umum',false)",[hidden]);
    const requirements = [{id:randomUUID(),label:'KTP',mandatory:true}];
    await db.query('INSERT INTO settings(id,data) VALUES($1,$2),($3,$4),($5,$6)',[
      `requirements:${village}:${type}`,JSON.stringify({requirements,private_setting:'secret'}),
      `requirements:${other}:${type}`,JSON.stringify({requirements:[{id:randomUUID(),label:'Other private',mandatory:true}]}),
      'private-setting',JSON.stringify({secret:'Never disclose'})]);
    const catalog = await call('types'); assert.equal(catalog.status,200); assert.equal(catalog.headers.get('cache-control'),'no-store');
    assert.deepEqual(await catalog.json(),{types:[{id:type,name:'Surat',code:'S',slug:'surat',category:'umum',description:'',fields,defaults:{negara_pemohon:'Indonesia'},requirements}]});
    process.env.MANDIRI_VILLAGE_ID = other;
    const otherCatalog = await (await call('types')).json();
    assert.equal(otherCatalog.types[0].requirements[0].label,'Other private');
    process.env.MANDIRI_VILLAGE_ID = village;
    for (const input of [{nik:'1234567890123456',birth_date:'2000-01-01'}, {nik:'1234567890123456',birth_date:'1999-01-01'}, {nik:'9999999999999999',birth_date:'2000-01-01'}]) {
      const r = await call('check-nik','POST',input);
      assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'no-store');
      assert.deepEqual(await r.json(),{manual_entry:true});
    }
    const input = {type_id:type,resident:{nik:'1234567890123456',name:'Usulan',birth_date:'2000-01-01',birth_place:'Tangerang',gender:'Laki-laki',religion:'Islam',marital_status:'Kawin',occupation:'Wiraswasta',address:'Alamat baru',rt:'001',rw:'002'},contact_phone:'0822222222',form_data:{purpose:'Pengajuan'}};
    const r = await call('request','POST',input); assert.equal(r.status,201);
    const ticket = await r.json(); assert.match(ticket.ticket,/^TIK-\d{6}-[A-F0-9]{8}$/); assert.equal(ticket.tracking_token.length,64);
    assert.ok(ticket.wa_url, "wa_url is returned on submission");
    assert.match(ticket.wa_url, /^https:\/\/wa\.me\/62822222222\?text=/);
    assert.match(decodeURIComponent(ticket.wa_url), new RegExp(ticket.ticket));
    assert.ok(ticket.whatsapp_url?.includes('wa.me/62822222222'));
    assert.ok(ticket.whatsapp_message?.includes(ticket.ticket));
    assert.ok(ticket.whatsapp_message?.includes('Tanggal Lahir'));
    assert.ok(ticket.whatsapp_message?.includes('https://mandiri.sikepel.biz.id/lacak?tiket=' + ticket.ticket));
    assert.equal((await db.query("SELECT name,data FROM residents WHERE id=$1",[resident])).rows[0].name,'Rahasia');
    assert.equal((await db.query("SELECT data FROM residents WHERE id=$1",[resident])).rows[0].data.phone,'0811111111');
    const row = (await db.query('SELECT * FROM online_requests')).rows[0];
    assert.equal(row.resident_id,null); assert.notEqual(row.tracking_token_hash,ticket.tracking_token); assert.equal(row.form_data.resident.name,'Usulan');
    assert.equal((await call('track/'+ticket.ticket)).status,404);
    const wrongRes = await call('track/'+ticket.ticket,'GET',undefined,'wrong');
    assert.equal(wrongRes.status,404);
    assert.equal((await wrongRes.json()).error, 'Nomor tiket atau tanggal lahir tidak sesuai.');
    // Birth date tracking via query parameter
    const trackedBirthQuery = await call('track/'+ticket.ticket+'?birth_date=2000-01-01');
    assert.equal(trackedBirthQuery.status, 200);
    assert.deepEqual(Object.keys(await trackedBirthQuery.json()).sort(),['created_at','status','ticket','type_name']);
    // Birth date tracking via header
    const trackedBirthHeader = await call('track/'+ticket.ticket,'GET',undefined,undefined,{'x-birth-date':'2000-01-01'});
    assert.equal(trackedBirthHeader.status, 200);
    // Birth date tracking via POST body
    const trackedBirthPost = await call('track/'+ticket.ticket,'POST',{birth_date:'2000-01-01'});
    assert.equal(trackedBirthPost.status, 200);
    // Wrong birth date
    const wrongBirth = await call('track/'+ticket.ticket+'?birth_date=1999-12-31');
    assert.equal(wrongBirth.status, 404);
    assert.equal((await wrongBirth.json()).error, 'Nomor tiket atau tanggal lahir tidak sesuai.');
    const tracked = await call('track/'+ticket.ticket,'GET',undefined,ticket.tracking_token);
    assert.deepEqual(Object.keys(await tracked.json()).sort(),['created_at','status','ticket','type_name']);
    assert.equal((await call('track/TIK-202610-DEADBEEF','GET',undefined,ticket.tracking_token)).status,404);
    process.env.MANDIRI_VILLAGE_ID = other;
    assert.equal((await call('track/'+ticket.ticket,'GET',undefined,ticket.tracking_token)).status,404);
    process.env.MANDIRI_VILLAGE_ID = village;
    await db.query("UPDATE online_requests SET tracking_expires_at=now()-interval '1 second'");
    assert.equal((await call('track/'+ticket.ticket,'GET',undefined,ticket.tracking_token)).status,404);
    const newInput = {...input,resident:{...input.resident,nik:'9999999999999999'}};
    const form = new FormData(); form.set('data',JSON.stringify(newInput));
    form.append('attachments',new Blob([Buffer.from('%PDF-1.4\nfixture\n%%EOF')],{type:'application/pdf'}),'../../private.pdf');
    const uploaded = await call('request','POST',form); assert.equal(uploaded.status,201);
    const second = await uploaded.json(); assert.notEqual(second.ticket,ticket.ticket);
    assert.equal((await db.query('SELECT count(*) FROM residents')).rows[0].count,1);
    const files = await fs.readdir(path.join(root,'attachments')); assert.equal(files.length,1); assert.match(files[0],/^[a-f0-9-]+\.pdf$/);
    const bad = new FormData(); bad.set('data',JSON.stringify(input)); bad.append('attachments',new Blob(['script'],{type:'application/pdf'}),'fake.pdf');
    assert.equal((await call('request','POST',bad)).status,400);
    assert.equal((await call('request','POST',{...input,village_id:other})).status,400);
    const large = new FormData(); large.set('data',JSON.stringify(input)); large.append('attachments',new Blob([Buffer.alloc(2*1024*1024+1)],{type:'application/pdf'}),'large.pdf');
    assert.equal((await call('request','POST',large)).status,400);
    const many = new FormData(); many.set('data',JSON.stringify(input)); for(let i=0;i<4;i++) many.append('attachments',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'a.pdf');
    assert.equal((await call('request','POST',many)).status,400);
    const cross = new Request(origin+'/api/mandiri/request',{method:'POST',headers:{origin:'https://attacker.invalid'},body:JSON.stringify(input)});
    assert.equal((await mandiriResponse(cross,'request',db)).status,403);
    await assert.rejects(db.query("UPDATE online_requests SET status='UNKNOWN'"));
    await assert.rejects(db.query('UPDATE online_requests SET ticket_code=$1 WHERE ticket_code=$2',[ticket.ticket,second.ticket]));
    assert.equal((await fs.stat(path.join(root,'attachments',files[0]))).mode & 0o777,0o600);
    delete process.env.MANDIRI_VILLAGE_ID; assert.equal((await call('check-nik','POST',input)).status,503);
    process.env.MANDIRI_VILLAGE_ID = village;
    for(let i=0;i<12;i++) await call('check-nik','POST',{nik:'5555555555555555',birth_date:'2000-01-01'});
    assert.equal((await call('check-nik','POST',{nik:'5555555555555555',birth_date:'2000-01-01'})).status,429);
    assert.equal(proxy(new NextRequest(origin+'/api/login')).status,404);
    assert.equal(proxy(new NextRequest(origin+'/app')).status,404);
    assert.equal(proxy(new NextRequest(origin+'/setup')).status,404);
    assert.equal(proxy(new NextRequest(origin+'/api/mandiri/check-nik')).headers.get('x-middleware-next'),'1');
  } finally { await pg.close(); await fs.rm(root,{recursive:true,force:true}); delete process.env.MANDIRI_VILLAGE_ID; }
});
