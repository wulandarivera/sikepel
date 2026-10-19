"use client";
import React, {useEffect, useRef, useState} from 'react';
import {Building2, Check, ChevronRight, LockKeyhole, ShieldCheck} from 'lucide-react';
import {getSetupStepError} from './setup-validation';
import styles from './setup-wizard.module.css';
const identity=[['name','Nama Kelurahan'],['code','Kode Kelurahan'],['district','Kecamatan'],['city','Kota / Kabupaten'],['province','Provinsi'],['address','Alamat Kantor']] as const;
const roles=[['superAdmin','Super Admin','Mengelola sistem dan seluruh kelurahan.'],['admin','Admin Kelurahan','Mengelola data, petugas, dan pelayanan kelurahan ini.'],['operator','Operator Kelurahan','Menangani pendataan dan pelayanan harian kelurahan ini.']] as const;
const steps=[['Akses & pengelola','Verifikasi pemilik sistem'],['Identitas kelurahan','Data wilayah dan kantor'],['Petugas kelurahan','Akun Admin dan Operator'],['Tinjau & aktifkan','Periksa sebelum menyimpan']];
export function SetupWizard(){
 const [step,setStep]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [review,setReview]=useState<Record<string,string>>({});
 const heading=useRef<HTMLHeadingElement>(null), firstRender=useRef(true);
 useEffect(()=>{if(firstRender.current){firstRender.current=false;return;}heading.current?.focus();},[step]);
 function changeStep(next:number){setError('');setStep(next);}
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget;const f=new FormData(form);
  const validation=getSetupStepError(f,step);if(validation){setError(validation);return;}
  if(step<4){
   if(step===3){const values:Record<string,string>={};for(const [key,value] of f.entries()){if(key.startsWith('village.')||key.endsWith('.name')||key.endsWith('.username'))values[key]=String(value);}setReview(values);}
   changeStep(step+1);return;
  }
  setBusy(true);setError('');
  const account=(key:string)=>Object.fromEntries(['name','username','password'].map(k=>[k,f.get(key+'.'+k)]));
  try{
   const response=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:f.get('token'),village:Object.fromEntries(identity.map(([key])=>[key,f.get('village.'+key)])),superAdmin:account('superAdmin'),admin:account('admin'),operator:account('operator')})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Penyiapan gagal.');
   window.location.assign('/login');
  }catch(e){setError(e instanceof Error?e.message:'Tidak dapat terhubung. Periksa koneksi lalu coba kembali.');}finally{setBusy(false);}
 }
 return <div className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><Building2 size={28} aria-hidden="true"/><div><strong>SIKEPEL</strong><span>Sistem Informasi Pelayanan Kelurahan</span></div></div><span className={styles.headerTag}><LockKeyhole size={16} aria-hidden="true"/>Penyiapan awal</span></header>
  <div className={styles.layout}>
   <aside className={styles.sidebar}><p className={styles.eyebrow}>KONFIGURASI SISTEM</p><h2>Siapkan layanan kelurahan</h2><p className={styles.sideIntro}>Lengkapi akses pengelola, identitas wilayah, dan akun petugas sebelum menggunakan SIKEPEL.</p>
    <nav aria-label="Tahapan penyiapan"><ol className={styles.steps}>{steps.map(([title,description],index)=><li key={title} aria-current={step===index+1?'step':undefined} className={step===index+1?styles.active:step>index+1?styles.complete:''}><span className={styles.stepNumber}>{step>index+1?<Check size={16} aria-label="Selesai"/>:String(index+1).padStart(2,'0')}</span><div><strong>{title}</strong><span>{description}</span></div></li>)}</ol></nav>
    <div className={styles.security}><ShieldCheck size={20} aria-hidden="true"/><div><strong>Akses terkontrol</strong><p>Penyiapan hanya dapat dilakukan dengan token pemilik. Setelah aktivasi, akses penyiapan akan dikunci.</p></div></div>
   </aside>
   <main className={styles.main}><div className={styles.formHeader}><p className={styles.eyebrow}>LANGKAH {step} DARI 4</p><h1 ref={heading} tabIndex={-1}>{steps[step-1][0]}</h1><p>{step===1?'Verifikasi akses Anda dan buat akun pengelola utama sistem.':step===2?'Gunakan identitas resmi kelurahan untuk administrasi pelayanan.':step===3?'Siapkan dua akun dengan tanggung jawab yang berbeda.': 'Pastikan identitas dan akun sudah benar sebelum mengaktifkan sistem.'}</p></div>
    <form onSubmit={submit}>
     <fieldset hidden={step!==1} disabled={busy} className={styles.fieldset}><legend className={styles.srOnly}>Akses pemilik dan Super Admin</legend>
      <section className={styles.group}><h2>Verifikasi pemilik</h2><p className={styles.description}>Token memastikan hanya pemilik sistem yang dapat melakukan penyiapan.</p><label htmlFor="setup-token">Token penyiapan <span className={styles.required}>*</span></label><input id="setup-token" name="token" type="password" required={step===1} autoComplete="off" aria-describedby="token-help"/><p id="token-help" className={styles.help}>Token bersifat rahasia. Jangan membagikannya kepada pihak lain.</p><details className={styles.details}><summary>Di mana saya mendapatkan token?</summary><p>Hubungi pengelola instalasi untuk memperoleh token penyiapan. Pada server, token tersimpan dalam berkas lokal <code>.data/SETUP-TOKEN.txt</code>. Jangan menyalinnya ke ruang publik.</p></details></section>
      <Account prefix="superAdmin" label="Super Admin" description={roles[0][2]} required={step===1}/>
     </fieldset>
     <fieldset hidden={step!==2} disabled={busy} className={styles.fieldset}><legend className={styles.srOnly}>Identitas kelurahan</legend><section className={styles.group}><h2>Data wilayah & kantor</h2><p className={styles.description}>Semua kolom wajib diisi sesuai data kelurahan.</p><div className={styles.grid}>{identity.map(([key,label])=><div key={key} className={key==='address'?styles.full:''}><label htmlFor={'village-'+key}>{label} <span className={styles.required}>*</span></label><input id={'village-'+key} name={'village.'+key} required={step===2} maxLength={key==='address'?500:key==='code'?20:100}/></div>)}</div></section></fieldset>
     <fieldset hidden={step!==3} disabled={busy} className={styles.fieldset}><legend className={styles.srOnly}>Petugas kelurahan</legend><p className={styles.notice}>Admin dan Operator hanya dapat mengakses kelurahan ini. Gunakan username yang berbeda untuk ketiga akun.</p>{roles.slice(1).map(([key,label,description])=><Account key={key} prefix={key} label={label} description={description} required={step===3}/>)}</fieldset>
     {step===4&&<div><section className={styles.group}><div className={styles.reviewHeading}><h2>Identitas kelurahan</h2><button type="button" className={styles.edit} disabled={busy} onClick={()=>changeStep(2)}>Ubah identitas</button></div><dl className={styles.review}>{identity.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{review['village.'+key]}</dd></div>)}</dl></section><section className={styles.group}><div className={styles.reviewHeading}><h2>Akun pengelola & petugas</h2><button type="button" className={styles.edit} disabled={busy} onClick={()=>changeStep(1)}>Ubah akun</button></div><dl className={styles.review}>{roles.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{review[key+'.name']}<span className={styles.help}>Username: {review[key+'.username']}</span></dd></div>)}</dl><p className={styles.help}>Kata sandi dan token tidak ditampilkan demi keamanan.</p></section><p className={styles.notice}><strong>Aktivasi mengunci penyiapan awal.</strong> Setelah berhasil, masuk menggunakan akun Super Admin. Data yang telah ada tetap dipertahankan.</p></div>}
     {error&&<div className={styles.error} role="alert"><strong>Penyiapan belum dapat dilanjutkan</strong><p>{error}</p></div>}
     <div className={styles.actions}><span className={styles.actionHint}>{step===4?'Periksa kembali sebelum aktivasi.':'Kolom bertanda * wajib diisi.'}</span><div>{step>1&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>changeStep(step-1)}>Kembali</button>}<button type="submit" className={styles.primary} disabled={busy}>{busy?'Menyimpan…':step===4?'Aktifkan & kunci penyiapan':'Lanjutkan'}<ChevronRight size={18} aria-hidden="true"/></button></div></div>
    </form>
   </main>
  </div><footer className={styles.footer}>SIKEPEL · Administrasi dan pelayanan kelurahan</footer>
 </div>;
}
function Account({prefix,label,description,required}:{prefix:string,label:string,description:string,required:boolean}){
 const [visible,setVisible]=useState(false);
 return <section className={styles.group}><h2>{label}</h2><p className={styles.description}>{description}</p><div className={styles.grid}><div><label htmlFor={prefix+'-name'}>Nama lengkap <span className={styles.required}>*</span></label><input id={prefix+'-name'} name={prefix+'.name'} required={required} maxLength={100} autoComplete="off"/></div><div><label htmlFor={prefix+'-username'}>Username <span className={styles.required}>*</span></label><input id={prefix+'-username'} name={prefix+'.username'} required={required} pattern="[a-zA-Z0-9._\-]{3,100}" minLength={3} maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby={prefix+'-username-help'}/><p id={prefix+'-username-help'} className={styles.help}>3–100 karakter: huruf, angka, titik, _ atau -.</p></div><div><label htmlFor={prefix+'-password'}>Kata sandi <span className={styles.required}>*</span></label><input id={prefix+'-password'} name={prefix+'.password'} type={visible?'text':'password'} required={required} minLength={6} maxLength={256} autoComplete="new-password" aria-describedby={prefix+'-password-help'}/><p id={prefix+'-password-help'} className={styles.help}>Minimal 6 karakter. Gunakan kata sandi yang unik.</p></div><div><label htmlFor={prefix+'-confirm'}>Konfirmasi kata sandi <span className={styles.required}>*</span></label><input id={prefix+'-confirm'} name={prefix+'.confirm'} type={visible?'text':'password'} required={required} minLength={6} maxLength={256} autoComplete="new-password"/></div></div><button type="button" className={styles.visibility} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'Sembunyikan':'Tampilkan'} kata sandi {label}</button></section>;
}
