import React from "react";
import { requirementDetail } from "@/lib/requirements";

export function RequirementDetail({ letter }: { letter: Parameters<typeof requirementDetail>[0] }) {
  const detail = requirementDetail(letter);
  return <section className="card card-body stack section-gap" aria-label="Kelengkapan Berkas">
    <h2>Kelengkapan Berkas</h2>
    <p className="muted">{detail.source === "current" ? "Berdasarkan persyaratan kelurahan saat ini dan checklist draft yang tersimpan." : "Berdasarkan snapshot saat nomor surat dialokasikan; perubahan persyaratan saat ini tidak diterapkan."}</p>
    {detail.complete === null ? <p role="status">Persyaratan belum ditetapkan/tidak ada data persyaratan.</p> : <>
      <p>{detail.completed} / {detail.requirements.length} berkas lengkap. Wajib: {detail.mandatoryCompleted} / {detail.mandatoryTotal} lengkap.</p>
      <p role="status">{detail.complete ? "Seluruh persyaratan wajib sudah lengkap" : "Persyaratan wajib belum lengkap"}</p>
      {detail.missing.length > 0 && <div className="stack"><h3>Berkas yang belum lengkap</h3><ul style={{ paddingLeft: 24, overflowWrap: "anywhere" }}>{detail.missing.map(r => <li key={r.id}>{r.label} <strong>({r.mandatory ? "Wajib" : "Opsional"})</strong></li>)}</ul></div>}
    </>}
  </section>;
}
