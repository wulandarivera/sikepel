'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { attachmentError, portalFetch, type PortalType } from '../../../lib/mandiri-ui';

type Receipt={ticket:string;tracking_token:string;tracking_expires_at:string};
const initial={nik:'',birth_date:'',name:'',birth_place:'',gender:'',religion:'',marital_status:'',occupation:'',address:'',rt:'',rw:''};
const residentFields=[['name','Nama lengkap'],['birth_place','Tempat lahir'],['gender','Jenis kelamin'],['religion','Agama'],['marital_status','Status perkawinan'],['occupation','Pekerjaan'],['address','Alamat'],['rt','RT'],['rw','RW']] as const;
export default function ApplyPage(){
  const [step,setStep]=useState(1),[resident,setResident]=useState(initial),[contact,setContact]=useState(''),[checked,setChecked]=useState(false);
  const [types,setTypes]=useState<PortalType[]>([]),[typeId,setTypeId]=useState(''),[fields,setFields]=useState<Record<string,string>>({}),[files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[receipt,setReceipt]=useState<Receipt|null>(null),[consent,setConsent]=useState(false);
  const title=useRef<HTMLHeadingElement>(null),lock=useRef(false);
  const selected=types.find(t=>t.id===typeId);
  async function loadTypes(){setLoading(true);setError('');try{const data=await portalFetch<{types:PortalType[]}>('/api/mandiri/types');setTypes(data.types);}catch(e){setError(e instanceof Error?e.message:'Portal belum tersedia.');}finally{setLoading(false);}}
  useEffect(()=>{void loadTypes();},[]);
  useEffect(()=>{title.current?.focus();},[step,receipt]);
  async function checkIdentity(){
    if(!/^\d{16}$/.test(resident.nik)||!resident.birth_date){setError('Isi NIK 16 digit dan tanggal lahir.');return;}
    setBusy(true);setError('');setChecked(false);
    try{const result=await portalFetch<{manual_entry:boolean}>('/api/mandiri/check-nik',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nik:resident.nik,birth_date:resident.birth_date})});if(!result.manual_entry)throw new Error('Verifikasi belum tersedia.');setChecked(true);}catch(e){setError(e instanceof Error?e.message:'Pemeriksaan gagal.');}finally{setBusy(false);}
  }
  function next(){setError('');if(step===1&&!checked){setError('Tekan Cek NIK sebelum melanjutkan.');return;}if(step===2&&!selected){setError('Pilih jenis surat.');return;}if(step===3){const issue=attachmentError(files);if(issue){setError(issue);return;}}setStep(step+1);}
  async function submit(){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{const body=new FormData();body.set('data',JSON.stringify({type_id:typeId,resident,contact_phone:contact,form_data:fields}));files.forEach(file=>body.append('attachments',file));setReceipt(await portalFetch<Receipt>('/api/mandiri/request',{method:'POST',body}));setResident(initial);setContact('');setFields({});setFiles([]);}catch(e){setError(e instanceof Error?e.message:'Pengiriman gagal.');}finally{lock.current=false;setBusy(false);}
  }
  function saveReceipt(){if(!receipt)return;const text=`Akses privat permohonan Kelurahan Cibodas\nNomor tiket: ${receipt.ticket}\nKode akses: ${receipt.tracking_token}\nBerlaku sampai: ${receipt.tracking_expires_at}\nSimpan rahasia. Gunakan tiket dan kode akses di /mandiri/lacak.\n`;const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='akses-permohonan.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if (receipt) {
    return (
      <section className="receipt-card">
        <h1 ref={title} tabIndex={-1} style={{ color: 'var(--color-primary)', marginBottom: '8px' }}>
          Permohonan Berhasil Dikirim!
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '20px' }}>
          Permohonan Anda telah masuk dalam antrean verifikasi petugas Kelurahan Cibodas.
        </p>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Nomor Tiket Anda
          </div>
          <div className="receipt-ticket">{receipt.ticket}</div>
        </div>

        <div style={{ textAlign: 'left', background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '6px' }}>
            Kode Akses Pelacakan Rahasia:
          </div>
          <div className="receipt-token-box">{receipt.tracking_token}</div>
          <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: '6px' }}>
            Masa berlaku kode akses sampai: <strong>{new Date(receipt.tracking_expires_at).toLocaleString('id-ID')}</strong>
          </small>
        </div>

        <p className="notice" style={{ textAlign: 'left' }}>
          <strong>Penting:</strong> Simpan atau unduh nomor tiket dan kode akses ini sebelum menutup halaman. Anda membutuhkan keduanya untuk memeriksa status verifikasi di menu Lacak Permohonan. Siapa pun yang memegang tiket dan kode akses dapat melacak permohonan Anda. Jangan bagikan kode akses.
        </p>
        <p className="notice">
          Status permohonan bukan bukti surat telah diterbitkan atau siap diambil. Pengambilan surat fisik mengikuti arahan petugas; unduhan PDF surat tidak tersedia.
        </p>

        <div className="actions" style={{ justifyContent: 'center' }}>
          <button type="button" onClick={saveReceipt}>Unduh Catatan Tiket</button>
          <Link className="button secondary" href="/mandiri/lacak">
            Ke Halaman Lacak
          </Link>
        </div>
      </section>
    );
  }
  return (
    <>
      <div className="stepper-container">
        <ol className="stepper" aria-label="Tahap pengajuan">
          {['Identitas', 'Jenis surat', 'Berkas', 'Konfirmasi'].map((label, i) => (
            <li
              key={label}
              className={`stepper-item ${step >= i + 1 ? 'active' : ''} ${step > i + 1 ? 'completed' : ''}`}
              aria-current={step === i + 1 ? 'step' : undefined}
            >
              <span className="stepper-num">{i + 1}</span>
              <span className="stepper-label">{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <h1 ref={title} tabIndex={-1}>Ajukan Permohonan Surat</h1>
      {error && <div role="alert">{error}</div>}
      <form className="panel" onSubmit={e => { e.preventDefault(); if (step === 4) void submit(); else next(); }}>
    {step===1&&<><h2>Identitas dan kontak</h2><p>Identitas akan diverifikasi petugas. NIK dan tanggal lahir tidak membuka data pribadi tersimpan.</p><div className="grid"><label>NIK<input required inputMode="numeric" pattern="[0-9]{16}" maxLength={16} autoComplete="off" value={resident.nik} onChange={e=>{setResident({...resident,nik:e.target.value});setChecked(false);}}/></label><label>Tanggal lahir<input required type="date" value={resident.birth_date} onChange={e=>{setResident({...resident,birth_date:e.target.value});setChecked(false);}}/></label></div><button type="button" disabled={busy} onClick={()=>void checkIdentity()}>{busy?'Memeriksa…':'Cek NIK'}</button>{checked&&<><p className="notice" role="status">Silakan isi data secara manual. Pemeriksaan ini tidak memastikan NIK terdaftar atau identitas terverifikasi. Perubahan data dan kontak merupakan usulan menunggu verifikasi operator.</p><div className="grid">{residentFields.map(([key,label])=><label key={key}>{label}{key==='name'||key==='address'?' (wajib)':' (opsional)'}{key==='address'?<textarea required maxLength={500} value={resident[key]} onChange={e=>setResident({...resident,[key]:e.target.value})}/>:key==='gender'?<select value={resident[key]} onChange={e=>setResident({...resident,[key]:e.target.value})}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select>:<input required={key==='name'} maxLength={500} value={resident[key]} onChange={e=>setResident({...resident,[key]:e.target.value})}/>}</label>)}</div><label>WhatsApp aktif (wajib)<input required type="tel" inputMode="tel" pattern="\+?[0-9]{8,15}" placeholder="081234567890" value={contact} onChange={e=>setContact(e.target.value)}/></label><p>Nomor 8–15 digit, boleh diawali +. Data KK dilampirkan sebagai berkas, bukan perubahan otomatis master warga.</p></> }</>}
    {step===2&&<><h2>Pilih jenis surat</h2>{loading?<p role="status">Memuat jenis surat…</p>:types.length===0?<><p>Jenis surat belum tersedia.</p><button type="button" onClick={()=>void loadTypes()}>Muat ulang</button></>:<><label>Jenis surat<select aria-label="Jenis surat" required value={typeId} onChange={e=>{setTypeId(e.target.value);setFields(types.find(t=>t.id===e.target.value)?.defaults||{});}}><option value="">Pilih jenis surat</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{selected?.description&&<p>{selected.description}</p>}<p>Isian surat berikut opsional. Kewarganegaraan memakai nilai bawaan bila tersedia.</p>{selected?.fields.map(f=><label key={f.key}>{f.label} (opsional){f.type==='textarea'?<textarea maxLength={2000} value={fields[f.key]||''} onChange={e=>setFields({...fields,[f.key]:e.target.value})}/>:f.type==='select'?<select aria-label={`${f.label} (opsional)`} value={fields[f.key]||''} onChange={e=>setFields({...fields,[f.key]:e.target.value})}><option value="">Pilih</option>{f.options?.map(o=><option key={o}>{o}</option>)}</select>:f.type==='checkbox'?<input type="checkbox" checked={fields[f.key]==='true'} onChange={e=>setFields({...fields,[f.key]:String(e.target.checked)})}/>:<input type={f.type} maxLength={2000} value={fields[f.key]||''} onChange={e=>setFields({...fields,[f.key]:e.target.value})}/>}</label>)}</>}</>}
    {step===3&&<><h2>Berkas persyaratan</h2>{selected?.requirements.length?<ul>{selected.requirements.map(r=><li key={r.id}>{r.label} ({r.mandatory?'Wajib':'Opsional'})</li>)}</ul>:<p className="notice">Persyaratan belum ditetapkan. Ini tidak berarti berkas sudah lengkap. Petugas akan memeriksa kelengkapan.</p>}<p>Lampirkan KTP, KK, pengantar RT/RW atau berkas sesuai daftar. Maksimal tiga berkas PDF, PNG, JPEG; 2 MB per berkas. Pengunggahan tidak menjamin kelengkapan.</p><label>Lampiran<input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={e=>{const nextFiles=Array.from(e.target.files||[]);const issue=attachmentError(nextFiles);setError(issue);if(issue){e.target.value='';setFiles([]);}else setFiles(nextFiles);}}/></label><ul>{files.map((f,i)=><li key={i}>{f.name} ({Math.ceil(f.size/1024)} KB)</li>)}</ul>{files.length>0&&<button type="button" className="secondary" onClick={()=>setFiles([])}>Hapus lampiran</button>}</>}
    {step===4&&<><h2>Konfirmasi permohonan</h2><dl><dt>Nama</dt><dd>{resident.name}</dd><dt>NIK</dt><dd>{resident.nik}</dd><dt>Tanggal lahir</dt><dd>{resident.birth_date}</dd><dt>Alamat</dt><dd>{resident.address}</dd><dt>WhatsApp</dt><dd>{contact}</dd><dt>Jenis surat</dt><dd>{selected?.name}</dd><dt>Lampiran</dt><dd>{files.length?files.map(f=>f.name).join(', '):'Belum dilampirkan'}</dd>{selected?.fields.map(f=><div key={f.key} style={{display:'contents'}}><dt>{f.label}</dt><dd>{fields[f.key]||'Tidak diisi'}</dd></div>)}</dl><label className="consent"><input required type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Saya menyatakan data benar dan memahami data ini merupakan usulan untuk diverifikasi petugas.</label><p>Jangan kirim ulang setelah berhasil. Simpan kode akses rahasia pada halaman berikutnya.</p></>}
    <div className="actions">{step>1&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setError('');setStep(step-1);}}>Kembali</button>}<button type="submit" disabled={busy||(step===1&&!checked)||(step===2&&(loading||!selected))}>{busy?'Memproses…':step===4?'Kirim Permohonan':'Lanjut'}</button></div>
  </form>
  </>
  );
}
