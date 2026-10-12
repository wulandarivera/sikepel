import { chromium } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ui-'));
const artifacts = path.resolve(process.env.WA_QA_ARTIFACTS || 'reference/wa-verification');
await fs.mkdir(artifacts,{recursive:true});
const village = '00000000-0000-4000-8000-000000000001';
const pg = new PGlite(path.join(root,'postgres')); await pg.waitReady;
await pg.exec(await fs.readFile('migrations/001_core.sql','utf8'));
await pg.query("INSERT INTO villages(id,name,code) VALUES($1,'Fixture','TEST')",[village]);
for (const [name,role,scope] of [['operator','OPERATOR',village],['wrong','PIMPINAN',village]]) {
 const id = name==='operator'?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000003';
 await pg.query('INSERT INTO users(id,village_id,name,username,password_hash,role) VALUES($1,$2,$3,$3,$4,$5)',[id,scope,name,'unused',role]);
 await pg.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update('fixture-'+name).digest('hex'),id]);
}
await pg.close();
let connected=true, sends=0, logouts=0, unavailable=false;
let replies=[{id:'rep-1', keyword:'syarat domisili', match_type:'CONTAINS', reply_text:'Fotokopi KTP dan KK', is_active:true}];
const qr='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><text x="30" y="120">TEST FIXTURE ONLY</text></svg>').toString('base64');
const gateway=http.createServer(async(req,res)=>{
 if(unavailable){res.writeHead(503);res.end();return;}
 assert.equal(req.headers.authorization,'Bearer fixture-only');
 if(req.url==='/send'){sends++;} if(req.url==='/logout'){logouts++;connected=false;}
 if(req.url==='/auto-replies' && req.method==='GET'){
   res.setHeader('Content-Type','application/json');
   res.end(JSON.stringify({ok:true, data:replies}));
   return;
 }
 if(req.url==='/auto-replies' && req.method==='POST'){
   res.setHeader('Content-Type','application/json');
   res.writeHead(201);
   res.end(JSON.stringify({ok:true, data:{id:'rep-2', keyword:'jam buka', match_type:'EXACT', reply_text:'Buka jam 8', is_active:true}}));
   return;
 }
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify(req.url==='/status'?{connected,hasQr:!connected,qrDataUrl:connected?null:qr,profile:{phone:connected?'628000000000':null,name:connected?'Fixture Operator':null,startedAt:connected?'2026-10-09T00:00:00.000Z':null},logs:[{id:'1',at:'2026-10-09T00:00:00.000Z',direction:'in',recipient:'[redacted]',summary:'Fixture activity',status:'received'}]}:{ok:true}));
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
const port=3287, base=`http://127.0.0.1:${port}`;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,SIKEPEL_DATA_DIR:root,WA_GATEWAY_VILLAGE_ID:village,WA_GATEWAY_SECRET:'fixture-only',WA_GATEWAY_URL:`http://127.0.0.1:${gateway.address().port}`},stdio:['ignore','pipe','pipe']});
let output='';app.stdout.on('data',d=>output+=d);app.stderr.on('data',d=>output+=d);
let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch(base+'/wa/login')).ok)break;}catch{} await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/wa');await page.waitForURL('**/wa/login');assert.equal((await context.request.get(base+'/api/wa/status')).status(),401);console.log('PASS anonymous page/API');
 await context.addCookies([{name:'sikepel_session',value:'fixture-wrong',url:base}]);await page.goto(base+'/wa');await page.getByRole('heading',{name:'Akses dashboard dibatasi'}).waitFor();assert.equal((await context.request.get(base+'/api/wa/status')).status(),403);console.log('PASS forbidden role');
 await context.addCookies([{name:'sikepel_session',value:'fixture-operator',url:base}]);await page.goto(base+'/wa');await page.getByText('Terhubung',{exact:true}).waitFor();await page.getByText('Fixture activity').waitFor();
 await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
 await page.getByLabel('Nomor tujuan').fill('081234567890');await page.getByLabel('Pesan uji').fill('Uji fixture');await page.getByRole('button',{name:'Kirim pesan uji',exact:true}).click();await page.getByText('Pesan uji berhasil dikirim.').waitFor();assert.equal(sends,1);console.log('PASS profile/logs/test-send fixture');
 await page.getByRole('tab', { name: 'Template Respon' }).click();
 await page.getByText('Manajemen Template Balasan Otomatis').waitFor();
 await page.getByText('syarat domisili').waitFor();
 await page.getByRole('button', { name: 'Tambah Template Baru' }).click();
 await page.getByRole('heading', { name: 'Tambah Template Balasan Baru' }).waitFor();
 await page.locator('#wa-input-keyword').fill('lokasi kantor');
 await page.locator('#wa-textarea-reply').fill('Halo {nama}, kantor berlokasi di Cibodas.');
 await page.getByText('Halo Budi Santoso, kantor berlokasi di Cibodas.').waitFor();
 await page.screenshot({ path: path.join(artifacts, 'template-respon-preview.png') });
 await page.getByRole('button', { name: 'Batal', exact: true }).click();
 await page.getByRole('tab', { name: 'Koneksi & Status' }).click();
 console.log('PASS template respon tab/modal/live preview/zero emoji');
 await page.getByRole('tab',{name:'Sapaan awal',exact:true}).click();
 await page.getByRole('heading',{name:'Sapaan awal',exact:true}).waitFor();
 assert.ok((await page.getByLabel('Teks sapaan').inputValue()).includes('mandiri.sikepel.biz.id'));
 for(const width of [360,390,768,1440]){
 await page.setViewportSize({width,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(artifacts,`greeting-${width}.png`),fullPage:true});
 }
 await page.getByRole('tab',{name:'Notifikasi progres',exact:true}).click();
 await page.getByText('Preview contoh, bukan data warga').waitFor();
 await page.getByText('NEEDS_REVISION',{exact:true}).click();
 await page.getByText(/Permohonan perlu perbaikan/).waitFor();
 for(const width of [360,390,768,1440]){
 await page.setViewportSize({width,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(artifacts,`progression-${width}.png`),fullPage:true});
 }
 await page.getByRole('tab',{name:'Koneksi & Status'}).click();
 console.log('PASS greeting/progression previews responsive 360/390/768/1440');

 assert.equal((await context.request.post(base+'/api/wa/logout',{headers:{Origin:'https://evil.test'},data:{confirm:true}})).status(),403);assert.equal(logouts,0);console.log('PASS CSRF');
 await page.getByRole('button',{name:'Putus koneksi / Ganti nomor'}).click();await page.getByRole('button',{name:'Batal',exact:true}).click();assert.equal(logouts,0);
 await page.getByRole('button',{name:'Putus koneksi / Ganti nomor'}).click();await page.getByRole('button',{name:'Ya, putus sesi'}).click();await page.getByText('Menunggu Scan QR',{exact:true}).waitFor();await page.getByAltText('QR penghubung WhatsApp privat').waitFor();assert.equal(logouts,1);assert.equal(await page.getByRole('button',{name:'Kirim pesan uji',exact:true}).isDisabled(),true);console.log('PASS logout cancellation/new QR/send disabled');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'mobile-qr-fixture.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS mobile overflow');
 unavailable=true;await page.getByRole('button',{name:'Perbarui status'}).click();await page.getByRole('alert').waitFor();await page.getByAltText('QR penghubung WhatsApp privat').waitFor({state:'detached'});console.log('PASS unavailable clears QR');
 assert.equal(errors.length,0);assert.equal(/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(await page.locator('body').innerText()),false);
 for(const route of ['/setup','/api/users','/mandiri','/wa/other'])assert.equal((await context.request.get(base+route,{headers:{'x-forwarded-host':'wa.sikepel.biz.id'}})).status(),404);
 const hostRoot=await context.request.get(base+'/',{headers:{'x-forwarded-host':'wa.sikepel.biz.id'}});assert.equal(hostRoot.status(),200);assert.ok((await hostRoot.text()).includes('Dashboard WhatsApp'));console.log('PASS host isolation/root rewrite/zero emoji/no browser errors');
} finally {if(browser)await browser.close();app.kill('SIGTERM');gateway.close();await fs.writeFile(path.join(artifacts,'server.log'),output);}
