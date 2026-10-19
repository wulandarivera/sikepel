import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='/candidate/sik25-browser-evidence'; await mkdir(out,{recursive:true,mode:0o700});
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{WaDashboard}from'./src/components/wa-dashboard';createRoot(document.getElementById('root')).render(<WaDashboard/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic'});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
const report=[];
try{for(const width of [360,390,768,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.route('http://fixture.invalid/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));await page.goto('http://fixture.invalid/');
 await page.addStyleTag({content:(await readFile('src/app/globals.css','utf8')).replace(/@import[^;]+;/g,'')});
 await page.evaluate(()=>{
 window.calls=[];window.mode='blocked';window.http=200;
 window.fetch=async(url,opts={})=>{window.calls.push({url,method:opts.method||'GET'});
 if(String(url).includes('auto-replies'))return new Response('{"data":[]}',{status:200});
 return new Response(JSON.stringify(window.http===200?{connected:true,hasQr:false,qrDataUrl:null,profile:{phone:null,name:null,startedAt:null},logs:[],...(window.mode==='blocked'?{state:'blocked',action:'operator_review_required',retryable:false}:{})}:{error:'PRIVATE UPSTREAM',state:'blocked',action:'operator_review_required',retryable:false}),{status:window.http});};
 });
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const banner=page.getByRole('alert').filter({hasText:'Pemeriksaan operator diperlukan'});
 await banner.waitFor({timeout:5000});assert.equal(await page.getByRole('button',{name:'Putus koneksi / Ganti nomor',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Kirim pesan uji',exact:true}).isDisabled(),true);
 await page.evaluate(()=>{document.querySelector('.wa-send').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await page.waitForTimeout(5200);assert.equal(await page.evaluate(()=>calls.filter(c=>c.url==='/api/wa/status').length),1);
 for(const http of [403,503]){await page.evaluate(h=>window.http=h,http);await page.getByRole('button',{name:'Perbarui status'}).click();await page.getByRole('alert').filter({hasText:http===403?'Akses gateway ditolak':'Gateway tidak tersedia'}).waitFor();await banner.waitFor();}
 assert.equal(await page.evaluate(()=>calls.some(c=>c.method!=='GET')),false);
 assert.equal(await page.getByText('PRIVATE UPSTREAM').count(),0);
 await page.screenshot({path:`${out}/blocked-${width}.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>{window.http=200;window.mode='legacy'});await page.getByRole('button',{name:'Perbarui status'}).click();await page.getByText('Terhubung',{exact:true}).waitFor();assert.equal(await banner.count(),0);
 await page.evaluate(()=>{window.http=409});
 await page.getByLabel('Nomor tujuan',{exact:true}).fill('081234567890');await page.getByLabel('Pesan uji',{exact:true}).fill('Synthetic fixture only');await page.getByRole('button',{name:'Kirim pesan uji',exact:true}).click();await banner.waitFor();
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.method==='POST').length),1);
 await page.evaluate(()=>{window.http=200});await page.getByRole('tab',{name:'Template Respon',exact:true}).click();await page.waitForTimeout(100);assert.equal(await banner.count(),1,'tab changes must not auto-clear block');
 await page.getByRole('tab',{name:'Koneksi & Status',exact:true}).click();await page.getByRole('button',{name:'Perbarui status'}).click();await page.getByText('Terhubung',{exact:true}).waitFor();
 await page.route('**/wa/login',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>Fixture sign-in</h1>'}));
 await page.evaluate(()=>window.http=401);await page.getByRole('button',{name:'Perbarui status'}).click();await page.getByRole('heading',{name:'Fixture sign-in'}).waitFor();
 assert.deepEqual(errors,[]);report.push({width,blocked:true,noMutation:true,noPolling:true,legacy:true,error403:true,error503:true,error401:true,error409:true,noRetry:true,noOverflow:true});await page.close();
}await writeFile(out+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));}finally{await browser.close();}
