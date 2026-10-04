"use client";
import { useState } from "react";
import { useApp } from "./workspace";
import { send, Alert } from "./common";
import { Button } from "./ui/button";
import { createRequirementId, missingRequirements, requirementsComplete, whatsappMissing, type Requirement } from "@/lib/requirements";
export function RequirementChecklist({ requirements = [], checks = {}, onChange }: { requirements?: Requirement[]; checks?: Record<string, unknown>; onChange?: (checks: Record<string, boolean>) => void }) {
 const missing = missingRequirements(requirements, checks);
 return <section className="stack" aria-label="Checklist persyaratan">
 <h3>Persyaratan layanan</h3>
 <p aria-live="polite">{requirements.length - missing.length} / {requirements.length} lengkap. {requirementsComplete(requirements, checks) ? "Persyaratan wajib lengkap." : "Persyaratan wajib belum lengkap."}</p>
 {!requirements.length && <p className="muted">Belum ada persyaratan yang dikonfigurasi admin.</p>}
 {requirements.map(r => <label className="row" key={r.id}><input type="checkbox" checked={checks[r.id] === true} disabled={!onChange} onChange={e => onChange?.({ ...Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v===true])), [r.id]: e.target.checked })} />{r.label} ({r.mandatory ? "Wajib" : "Opsional"})</label>)}
 </section>;
}
export function WhatsAppRequirements({ phone, name, type, requirements, checks }: { phone: string; name: string; type: string; requirements: Requirement[]; checks: Record<string, unknown> }) {
 let href = "", error = "";
 const missing = missingRequirements(requirements, checks);
 if (!missing.length) return null;
 try { href = whatsappMissing(phone, name, type, missing); } catch (e) { error = (e as Error).message; }
 return <div className="stack"><p className="muted">Pesan hanya memuat persyaratan yang kurang. Periksa dan kirim sendiri di WhatsApp; tidak dikirim otomatis.</p>{href ? <Button asChild variant="outline"><a href={href} target="_blank" rel="noopener noreferrer">Buka WhatsApp: Persyaratan Kurang</a></Button> : <p role="status">{error}</p>}</div>;
}
export function RequirementsAdmin() {
 const { types, user, reload, notify } = useApp();
 const [selected, setSelected] = useState(""), [list, setList] = useState<Requirement[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 if (!user.village_id) return <Alert>Pilih kelurahan untuk mengatur persyaratan layanan.</Alert>;
 return <section className="card card-body stack"><h2>Persyaratan Layanan per Jenis Surat</h2><p>Daftar ditetapkan admin untuk kelurahan aktif. Tidak ada persyaratan resmi yang ditambahkan otomatis. Perubahan memerlukan pratinjau baru; arsip terbit tetap tersimpan.</p><select aria-label="Jenis surat persyaratan" value={selected} onChange={e=>{ const id=e.target.value; setSelected(id); setList(types.find(t=>t.id===id)?.requirements || []); setError(""); }}><option value="">Pilih jenis surat</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
 {selected && <><Button type="button" variant="outline" onClick={()=>setList([...list,{ id: createRequirementId(), label: "", mandatory: true }])}>Tambah Persyaratan</Button>{list.map((r,i)=><div key={r.id} className="row" style={{ flexWrap: "wrap" }}><input aria-label={`Label persyaratan ${i+1}`} value={r.label} maxLength={200} onChange={e=>setList(list.map(x=>x.id===r.id?{...x,label:e.target.value}:x))}/><label className="row"><input type="checkbox" checked={r.mandatory} onChange={e=>setList(list.map(x=>x.id===r.id?{...x,mandatory:e.target.checked}:x))}/>Wajib</label><Button type="button" variant="outline" aria-label={`Hapus persyaratan ${i+1}`} onClick={()=>setList(list.filter(x=>x.id!==r.id))}>Hapus</Button></div>)}<Button disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await send(`types/${selected}/requirements`,{requirements:list},"PATCH");reload();notify("Persyaratan disimpan.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Simpan Persyaratan</Button></>}{error && <Alert kind="error">{error}</Alert>}</section>;
}
