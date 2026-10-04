import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const host = process.env.SIKEPEL_BROWSER_HOST || '100.67.16.86';
const base = `http://${host}:3098`;
const root = path.resolve('.data/test-requirements-editor-' + Date.now());
const env = {...process.env, SIKEPEL_DATA_DIR:root, SIKEPEL_TEST_FIXTURES:'1', DATABASE_URL:'', SUPABASE_URL:'', PDF_CONVERTER_URL:''};
execFileSync(process.execPath, ['--import','tsx','tests/seed-fixtures.ts'], {env,stdio:'pipe'});
execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {getDB} from './src/server/db.ts'; import {initializeSetup} from './src/server/setup.ts'; const db=await getDB(); await initializeSetup(db,'isolated-fixture-only'); await db.close();"],{env,stdio:'pipe'});
const access = await fs.readFile(path.join(root,'AKSES-LOKAL.txt'),'utf8');
const password = access.match(/Kata sandi semua akun contoh: (.+)/)[1];
const server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname',host,'--port','3098'],{env,stdio:'pipe'});
let serverOutput='';
server.stdout.on('data',d=>{serverOutput+=d;});server.stderr.on('data',d=>{serverOutput+=d;});
let browser;
const report = {base, passed:false, cases:[]};
try {
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,300));}
 assert.ok(ready,'isolated server ready: '+serverOutput);
 browser=await chromium.launch({headless:true});
 for(const role of ['ADMIN','SUPER_ADMIN']) for(const viewport of [{width:1440,height:1050},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});
  assert.equal((await context.request.post(base+'/api/login',{headers:{origin:base},data:{username:role==='ADMIN'?'admin.kelurahan':'admin',password}})).status(),200);
  let boot=await(await context.request.get(base+'/api/bootstrap')).json();
  if(role==='SUPER_ADMIN') {
   assert.equal((await context.request.post(base+'/api/scope',{headers:{origin:base},data:{village_id:boot.villages.find(v=>v.name==='Sukamaju').id}})).status(),200);
   boot=await(await context.request.get(base+'/api/bootstrap')).json();
  }
  const type=boot.types.find(t=>t.slug==='domisili');
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+(role==='ADMIN'?'/app/kelurahan':'/app/jenis-surat'));
  await page.getByLabel('Jenis surat persyaratan').selectOption(type.id);
  const runtime=await page.evaluate(()=>({secure:window.isSecureContext,randomUUID:typeof crypto.randomUUID,getRandomValues:typeof crypto.getRandomValues}));
  assert.equal(runtime.secure,false,'must exercise non-secure HTTP, not localhost');
  const labels=page.locator('input[aria-label^="Label persyaratan "]');
  const initial=await labels.count();
  await page.getByRole('button',{name:'Tambah Persyaratan',exact:true}).click();
  try {await labels.nth(initial).waitFor({timeout:3000});}catch{throw new Error(`Add failed: ${JSON.stringify({role,viewport,runtime,errors})}`);}
  await labels.nth(initial).fill('Persyaratan HTTP '+role+' '+viewport.width);
  await page.getByRole('button',{name:'Simpan Persyaratan',exact:true}).click();
  await page.getByText('Persyaratan disimpan.',{exact:true}).waitFor();
  const saved=(await(await context.request.get(base+'/api/bootstrap')).json()).types.find(t=>t.id===type.id).requirements;
  const added=saved.at(-1);assert.ok(added.id);assert.equal(added.label,'Persyaratan HTTP '+role+' '+viewport.width);
  await page.reload();await page.getByLabel('Jenis surat persyaratan').selectOption(type.id);
  await labels.nth(initial).fill('Label diubah');
  await page.getByRole('button',{name:'Tambah Persyaratan',exact:true}).click();
  await labels.nth(initial+1).fill('Sementara');
  await page.getByRole('button',{name:`Hapus persyaratan ${initial+2}`,exact:true}).click();
  assert.equal(await labels.count(),initial+1);
  await page.getByRole('button',{name:'Simpan Persyaratan',exact:true}).click();await page.getByText('Persyaratan disimpan.',{exact:true}).waitFor();
  await page.reload();await page.getByLabel('Jenis surat persyaratan').selectOption(type.id);await labels.nth(initial).waitFor();
  assert.equal(await labels.nth(initial).inputValue(),'Label diubah');
  const reloaded=(await(await context.request.get(base+'/api/bootstrap')).json()).types.find(t=>t.id===type.id).requirements;
  assert.equal(reloaded.at(-1).id,added.id,'editing preserves ID');assert.equal(reloaded.length,initial+1);assert.deepEqual(errors,[]);
  report.cases.push({role,viewport,runtime,checks:['add','edit','remove','save','reload','stable ID'],pageErrors:errors});
  await context.close();
 }
 report.passed=true;console.log(JSON.stringify(report,null,2));
} catch(e) {report.error=e.message;throw e;}
finally {
 await fs.mkdir('reference/verification',{recursive:true});await fs.writeFile('reference/verification/requirements-editor-browser.json',JSON.stringify(report,null,2));
 await browser?.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await fs.rm(root,{recursive:true,force:true});
}
