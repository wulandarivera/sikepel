import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const output='/tmp/sikepel-frontend-t_471f5634';
await mkdir(output,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {PermohonanMandiriDetail,PermohonanMandiriList} from './src/components/permohonan-mandiri';
window.mount=(mode)=>{window.fixtureReactRoot??=createRoot(document.getElementById('root'));window.fixtureReactRoot.render(mode==='list'?<PermohonanMandiriList/>:<PermohonanMandiriDetail id='fixture-request'/>)};window.mount('detail');`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture-boundaries',setup(b){
 b.onResolve({filter:/^\.\/workspace$/},()=>({path:'workspace',namespace:'fixture'}));
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:a.path==='workspace'?`export const useApp=()=>({notify:s=>{document.getElementById('toast').textContent=s},reloadCounter:()=>{}});`:a.path==='next/link'?`import React from 'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}`:`export const usePathname=()=>'/app/permohonan-mandiri/fixture-request';export const useRouter=()=>({push:()=>{}});`}));
}}]});
const css=await readFile('src/app/globals.css','utf8');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];const results=[];
try {
 for(const width of [360,390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
  await page.route('**/*',r=>r.abort()); // No network or production API access.
  await page.setContent('<html><body><div id="toast" role="status"></div><div id="root"></div></body></html>');
  await page.addStyleTag({content:css});
  await page.evaluate(()=>{
   window.fixtureStatus='COMPLETED';
   window.fetch=async(url,options)=>{
    if(options?.method==='POST') return new Response(JSON.stringify({ok:true,status:'NEEDS_REVISION'}),{status:200});
    const item={id:'fixture-request',ticket_code:'TIK-FIXTURE',nama_pemohon:'Fixture sintetis',nik:'',jenis_surat:'Layanan fixture',status:window.fixtureStatus,created_at:'2026-10-13T00:00:00Z',contact_phone:''};
    return new Response(JSON.stringify(String(url).includes('?')?{items:[item],total:1,page:1,limit:10}:{...item,type_name:'Layanan fixture',pemohon:{name:'Fixture sintetis'},form_data:{keperluan:'Pengujian UI tanpa data warga'},attachments:[],letter:null,riwayat:[{id:'fixture-audit',actor:'Petugas fixture',action:'ONLINE_REQUEST_NEEDS_REVISION',metadata:{revision_note:'Catatan fixture terlihat'},created_at:'2026-10-13T00:00:00Z'}]}),{status:200});
   };
  });
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByText('Catatan fixture terlihat',{exact:false}).waitFor();
  await page.getByText('Bukti pengiriman WhatsApp belum tersedia',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit Data / Sesuaikan Redaksi'}).count(),0);
  await page.screenshot({path:path.join(output,`detail-${width}.png`),fullPage:true});
  await page.evaluate(()=>{window.mount('list')});
  await page.getByRole('button',{name:'Selesai',exact:true}).click();
  await page.getByRole('link',{name:'Periksa',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,`list-${width}.png`),fullPage:true});
  await page.evaluate(()=>{window.fixtureStatus='PENDING_VERIFICATION';window.mount('detail')});
  await page.getByRole('button',{name:'Edit Data / Sesuaikan Redaksi'}).click();
  await page.getByRole('dialog').waitFor();
  const columns=await page.locator('.mandiri-edit-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(columns,width<=600?1:2);
  await page.screenshot({path:path.join(output,`edit-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Batal',exact:true}).click();
  await page.getByRole('button',{name:'Minta Perbaikan',exact:true}).click();
  await page.getByRole('dialog').locator('textarea').fill('Catatan fixture');
  await page.getByRole('button',{name:'Kirim Permintaan Perbaikan'}).click();
  await page.getByRole('status').filter({hasText:'Catatan perbaikan berhasil disimpan.'}).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,`page overflow ${width}`);
  results.push({width,history:true,deliveryUnavailable:true,completedEditHidden:true,completedFilter:true,modalColumns:columns,truthfulToast:true,pageOverflow:overflow});
  await page.close();
 }
 assert.deepEqual(errors,[]);
 const report={fixtureOnly:true,networkBlocked:true,results,pageErrors:errors};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));console.log('artifacts '+output);
} finally {await browser.close();}
