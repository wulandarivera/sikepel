import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000';
const password=(await fs.readFile('.data/AKSES-LOKAL.txt','utf8')).match(/Kata sandi semua akun contoh: (.+)/)[1];
const result=JSON.parse(await fs.readFile('.data/template-ktp/browser-result.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const c=await browser.newContext({viewport:{width:1440,height:1080}}),p=await c.newPage();
 await p.goto(base+'/login');await p.getByLabel('Username',{exact:true}).fill('operator');await p.getByLabel('Kata sandi',{exact:true}).fill(password);await p.getByRole('button',{name:'Masuk',exact:true}).click();await p.waitForURL('**/app/dashboard');
 const d=await(await c.request.get(base+'/api/letters/'+result.letter_id)).json();
 await p.goto(base+`/app/pelayanan/baru/form?type=${d.type_id}&resident=${d.resident_id}`);
 await p.getByRole('heading',{name:'Persyaratan yang dilampirkan',exact:true}).waitFor();
 assert.equal(await p.getByRole('checkbox').count(),16);
 await p.getByRole('heading',{name:'Formulir KTP',exact:true}).waitFor();
 await p.screenshot({path:'.data/template-ktp/form-final.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.ok((await(await c.request.get(base+`/api/letters/${result.letter_id}/pdf`)).body()).equals(await fs.readFile('.data/template-ktp/application.pdf')));
 console.log('PASS final form layout, 16 checkboxes, mobile width, archived PDF retained after restart.');
} finally {await browser.close();}
