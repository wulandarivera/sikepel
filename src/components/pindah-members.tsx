"use client";
import { useState } from "react";
import type { MovingMember } from "@/lib/pindah";
import { Field } from "./common";
import { Button } from "./ui/button";

export function PindahMembers({ initial, resident, errors, onChange }: {
  initial?: MovingMember[]; resident: { nik: string; name: string };
  errors: Record<string, string>; onChange: () => void;
}) {
  const [members, setMembers] = useState<MovingMember[]>(() => initial ?? [{ nik: resident.nik, nama: resident.name, shdk: "" }]);
  function update(next: MovingMember[]) { setMembers(next); onChange(); }
  return <div className="full-width stack">
    <div><h3>Daftar keluarga yang pindah</h3><p className="muted">Cantumkan hanya anggota yang ikut pindah. SHDK adalah status hubungan dalam keluarga.</p></div>
    <input type="hidden" name="anggota_pindah" value={JSON.stringify(members)} />
    {errors.anggota_pindah && <p role="alert">{errors.anggota_pindah}</p>}
    {members.map((member, index) => <fieldset key={index} style={{ border: "1px solid #dbe6ef", borderRadius: 10, padding: 16 }}>
      <legend>Anggota {index + 1}</legend>
      <div className="form-grid">
        {([['nik', 'NIK'], ['nama', 'Nama lengkap'], ['shdk', 'SHDK']] as const).map(([key, label]) => {
          const id = `anggota_pindah.${index}.${key}`;
          return <Field key={key} name={id} label={label} required error={errors[id]}>
            <input id={id} value={member[key]} maxLength={key === "nik" ? 16 : 100} inputMode={key === "nik" ? "numeric" : undefined}
              onChange={event => update(members.map((m, i) => i === index ? { ...m, [key]: event.target.value } : m))} />
          </Field>;
        })}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => update(members.filter((_, i) => i !== index))}>Hapus anggota {index + 1}</Button>
    </fieldset>)}
    <div><Button type="button" variant="outline" disabled={members.length >= 20} onClick={() => update([...members, { nik: "", nama: "", shdk: "" }])}>Tambah anggota keluarga</Button></div>
  </div>;
}
