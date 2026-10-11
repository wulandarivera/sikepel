'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  attachmentError,
  portalFetch,
  type PortalField,
  type PortalType,
} from '../../../lib/mandiri-ui';

type Receipt = {
  ticket: string;
  tracking_token?: string;
  tracking_expires_at?: string;
  created_at?: string;
  tracking_url?: string;
  whatsapp_url?: string;
  whatsapp_message?: string;
};

const initial = {
  nik: '',
  birth_date: '',
  name: '',
  birth_place: '',
  gender: '',
  religion: '',
  marital_status: '',
  occupation: '',
  address: '',
  rt: '',
  rw: '',
};

const COMMON_DROPDOWN_OPTIONS: Record<string, string[]> = {
  keperluan: [
    'Melengkapi persyaratan administrasi pekerjaan',
    'Melengkapi persyaratan beasiswa / pendidikan',
    'Pengajuan bantuan sosial',
    'Administrasi perbankan / pinjaman',
    'Persyaratan pendaftaran sekolah',
  ],
  jenis_usaha: [
    'Perdagangan / Toko Kelontong',
    'Kuliner / Makanan dan Minuman',
    'Jasa / Bengkel / Servis',
    'Pertanian / Peternakan',
    'Industri Kecil / Konveksi',
  ],
  negara: ['Indonesia'],
  negara_pemohon: ['Indonesia'],
};

function cleanFieldLabel(field: PortalField): string {
  if (field.key === 'catatan' || field.label.toLowerCase().includes('catatan petugas') || field.label.toLowerCase() === 'catatan') {
    return 'Catatan Untuk Petugas';
  }
  return field.label.replace(/\s*\(opsional\)/gi, '').replace(/\bopsional\b/gi, '').trim();
}

function DynamicLetterField({
  field,
  value,
  onChange,
}: {
  field: PortalField;
  value: string;
  onChange: (val: string) => void;
}) {
  const label = cleanFieldLabel(field);
  const presetOptions =
    COMMON_DROPDOWN_OPTIONS[field.key] ||
    (field.options && field.options.length > 0 ? field.options : null);

  const [isOther, setIsOther] = useState(
    presetOptions ? Boolean(value && !presetOptions.includes(value)) : false
  );

  useEffect(() => {
    if (presetOptions && value && !presetOptions.includes(value)) {
      setIsOther(true);
    }
  }, [value, presetOptions]);

  if (field.key === 'catatan' || label === 'Catatan Untuk Petugas') {
    return (
      <label htmlFor={`field-${field.key}`}>
        {label}
        <textarea
          id={`field-${field.key}`}
          aria-label={label}
          maxLength={2000}
          placeholder="Tuliskan catatan atau keterangan tambahan untuk petugas (jika ada)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (presetOptions) {
    const selectValue = isOther
      ? 'Lainnya'
      : presetOptions.includes(value)
      ? value
      : '';

    return (
      <div className="dynamic-field-group">
        <label htmlFor={`field-${field.key}`}>
          {label}
          <select
            id={`field-${field.key}`}
            aria-label={label}
            value={selectValue}
            onChange={(e) => {
              const selected = e.target.value;
              if (selected === 'Lainnya') {
                setIsOther(true);
                if (presetOptions.includes(value)) {
                  onChange('');
                }
              } else {
                setIsOther(false);
                onChange(selected);
              }
            }}
          >
            <option value="">Pilih {label.toLowerCase()}</option>
            {presetOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value="Lainnya">Lainnya</option>
          </select>
        </label>
        {isOther && (
          <label className="sub-field" htmlFor={`field-${field.key}-custom`}>
            {`Keterangan ${label} Lainnya`}
            <input
              id={`field-${field.key}-custom`}
              aria-label={`Keterangan ${label} Lainnya`}
              type="text"
              maxLength={500}
              placeholder={`Tuliskan ${label.toLowerCase()}...`}
              value={presetOptions.includes(value) ? '' : value}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
        )}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label htmlFor={`field-${field.key}`}>
        {label}
        <textarea
          id={`field-${field.key}`}
          aria-label={label}
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (field.type === 'date') {
    return (
      <label htmlFor={`field-${field.key}`}>
        {label}
        <input
          id={`field-${field.key}`}
          aria-label={label}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (field.type === 'number') {
    return (
      <label htmlFor={`field-${field.key}`}>
        {label}
        <input
          id={`field-${field.key}`}
          aria-label={label}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  return (
    <label htmlFor={`field-${field.key}`}>
      {label}
      <input
        id={`field-${field.key}`}
        aria-label={label}
        type="text"
        maxLength={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function ApplyPage() {
  const [step, setStep] = useState(1);
  const [resident, setResident] = useState(initial);
  const [contact, setContact] = useState('');
  const [checked, setChecked] = useState(false);
  const [types, setTypes] = useState<PortalType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [consent, setConsent] = useState(false);

  const title = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false);

  const selected = types.find((t) => t.id === typeId);

  // Filter out jabatan_detail or any jabatan field for citizens
  const letterFields = (selected?.fields || []).filter(
    (f) =>
      f.key !== 'jabatan_detail' &&
      f.key !== 'jabatan' &&
      !f.label.toLowerCase().includes('jabatan')
  );

  async function loadTypes() {
    setLoading(true);
    setError('');
    try {
      const data = await portalFetch<{ types: PortalType[] }>(
        '/api/mandiri/types'
      );
      setTypes(data.types);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Portal belum tersedia.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTypes();
  }, []);

  useEffect(() => {
    title.current?.focus();
  }, [step, receipt]);

  async function checkIdentity() {
    if (!/^\d{16}$/.test(resident.nik) || !resident.birth_date) {
      setError('Isi NIK 16 digit dan tanggal lahir.');
      return;
    }
    setBusy(true);
    setError('');
    setChecked(false);
    try {
      const result = await portalFetch<{ manual_entry: boolean }>(
        '/api/mandiri/check-nik',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nik: resident.nik,
            birth_date: resident.birth_date,
          }),
        }
      );
      if (!result.manual_entry) {
        throw new Error('Verifikasi belum tersedia.');
      }
      setChecked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pemeriksaan gagal.');
    } finally {
      setBusy(false);
    }
  }

  function validateStep1(): boolean {
    if (!checked) {
      setError('Tekan Cek NIK sebelum melanjutkan.');
      return false;
    }
    if (!/^\d{16}$/.test(resident.nik)) {
      setError('Isi NIK 16 digit angka.');
      return false;
    }
    if (!resident.birth_date) {
      setError('Tanggal lahir wajib diisi.');
      return false;
    }
    if (!resident.name.trim()) {
      setError('Nama lengkap wajib diisi.');
      return false;
    }
    if (!resident.birth_place.trim()) {
      setError('Tempat lahir wajib diisi.');
      return false;
    }
    if (!resident.gender) {
      setError('Jenis kelamin wajib dipilih.');
      return false;
    }
    if (!resident.religion) {
      setError('Agama wajib dipilih.');
      return false;
    }
    if (!resident.marital_status) {
      setError('Status perkawinan wajib dipilih.');
      return false;
    }
    if (!resident.occupation.trim()) {
      setError('Pekerjaan wajib diisi.');
      return false;
    }
    if (!resident.address.trim()) {
      setError('Alamat wajib diisi.');
      return false;
    }
    if (!resident.rt.trim()) {
      setError('RT wajib diisi.');
      return false;
    }
    if (!resident.rw.trim()) {
      setError('RW wajib diisi.');
      return false;
    }
    if (!contact.trim()) {
      setError('Nomor WhatsApp aktif wajib diisi.');
      return false;
    }
    if (!/^\+?[0-9]{8,15}$/.test(contact.trim())) {
      setError('Format nomor WhatsApp tidak valid (8-15 digit).');
      return false;
    }
    return true;
  }

  function next() {
    setError('');
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!selected) {
        setError('Pilih jenis surat.');
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      const issue = attachmentError(files);
      if (issue) {
        setError(issue);
        return;
      }
      setStep(4);
      return;
    }
  }

  function prev() {
    setError('');
    if (step > 1) {
      setStep(step - 1);
    }
  }

  async function submit() {
    if (lock.current) return;
    if (!consent) {
      setError('Beri tanda centang pada pernyataan persetujuan.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');

    try {
      const body = new FormData();
      body.set(
        'data',
        JSON.stringify({
          type_id: typeId,
          resident,
          contact_phone: contact,
          form_data: fields,
        })
      );
      files.forEach((file) => body.append('attachments', file));

      const res = await portalFetch<Receipt>('/api/mandiri/request', {
        method: 'POST',
        body,
      });

      setReceipt(res);
      setResident(initial);
      setContact('');
      setFields({});
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pengiriman gagal.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function saveReceipt() {
    if (!receipt) return;
    const dateStr = receipt.created_at ? new Date(receipt.created_at).toLocaleString('id-ID') : new Date().toLocaleString('id-ID');
    const text = `Bukti Permohonan Surat Kelurahan Cibodas\n` +
      `Nomor Tiket: ${receipt.ticket}\n` +
      `Tanggal Pengajuan: ${dateStr}\n` +
      `Petunjuk Lacak: Gunakan Nomor Tiket dan Tanggal Lahir pemohon untuk memeriksa status.\n` +
      `Tautan Pelacakan: https://mandiri.sikepel.biz.id/lacak?tiket=${receipt.ticket}\n`;
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `bukti-permohonan-${receipt.ticket}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (receipt) {
    const trackingLink = `/mandiri/lacak?tiket=${encodeURIComponent(receipt.ticket)}`;
    return (
      <section className="panel">
        <h1 ref={title} tabIndex={-1}>
          Permohonan diterima
        </h1>
        <p>Menunggu verifikasi petugas. Ini bukan bukti surat telah diterbitkan.</p>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Nomor Tiket Anda
          </div>
          <div className="receipt-ticket">{receipt.ticket}</div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Tanggal Pengajuan
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-main)', marginTop: '4px' }}>
            {new Date(receipt.created_at || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div style={{ textAlign: 'left', background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '6px' }}>
            Petunjuk Lacak:
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
            Gunakan Nomor Tiket dan Tanggal Lahir pemohon untuk memeriksa status.
          </p>
        </div>

        <p className="notice" style={{ textAlign: 'left' }}>
          <strong>Penting:</strong> Simpan nomor tiket ini. Untuk melacak status permohonan, gunakan Tanggal Lahir pemohon yang didaftarkan saat pengajuan.
        </p>

        <div className="actions" style={{ justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" onClick={saveReceipt}>
            Unduh Bukti
          </button>
          <Link className="button secondary" href={trackingLink}>
            Lacak Permohonan
          </Link>
        </div>
        <p>
          Pengambilan surat fisik di Kelurahan Cibodas mengikuti konfirmasi petugas.
          Belum ada jadwal pengambilan atau unduhan PDF pada tahap ini.
        </p>
      </section>
    );
  }

  const stepLabels = ['Identitas', 'Jenis surat', 'Berkas', 'Konfirmasi'];

  return (
    <>
      <div className="stepper-container">
        <ol className="stepper" aria-label="Tahap pengajuan">
          {stepLabels.map((label, i) => (
            <li
              key={label}
              className={`stepper-item ${step >= i + 1 ? 'active' : ''} ${
                step > i + 1 ? 'completed' : ''
              }`}
              aria-current={step === i + 1 ? 'step' : undefined}
            >
              <span className="stepper-num">{i + 1}</span>
              <span className="stepper-label">{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <h1 ref={title} tabIndex={-1}>
        Ajukan Permohonan Surat
      </h1>
      {error && <div role="alert">{error}</div>}

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 4) void submit();
          else next();
        }}
      >
        {/* LANGKAH 1: IDENTITAS & DATA PEMOHON/WARGA (WAJIB SEMUA) */}
        {step === 1 && (
          <>
            <h2>Identitas dan kontak</h2>
            <p>
              Masukkan NIK 16 digit dan tanggal lahir sesuai KTP, lalu tekan Cek NIK.
              Pemeriksaan tidak membuka data pribadi tersimpan atau memastikan NIK terdaftar.
              Setelah pemeriksaan selesai, isi seluruh data pemohon; identitas akan diverifikasi petugas.
            </p>
            <div className="grid">
              <label>
                NIK (wajib)
                <input
                  required
                  aria-label="NIK"
                  inputMode="numeric"
                  pattern="[0-9]{16}"
                  maxLength={16}
                  autoComplete="off"
                  value={resident.nik}
                  onChange={(e) => {
                    setResident({ ...resident, nik: e.target.value });
                    setChecked(false);
                  }}
                />
              </label>
              <label>
                Tanggal lahir (wajib)
                <input
                  required
                  aria-label="Tanggal lahir"
                  type="date"
                  value={resident.birth_date}
                  onChange={(e) => {
                    setResident({ ...resident, birth_date: e.target.value });
                    setChecked(false);
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void checkIdentity()}
            >
              {busy ? 'Memeriksa...' : 'Cek NIK'}
            </button>

            {checked && (
              <>
                <p className="notice" role="status">
                  Silakan isi data secara manual. Pemeriksaan ini tidak memastikan NIK terdaftar atau identitas terverifikasi. Perubahan data dan kontak merupakan usulan menunggu verifikasi operator.
                </p>
                <div className="grid">
                  <label>
                    Nama lengkap (wajib)
                    <input
                      required
                      aria-label="Nama lengkap (wajib)"
                      maxLength={500}
                      value={resident.name}
                      onChange={(e) =>
                        setResident({ ...resident, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tempat lahir (wajib)
                    <input
                      required
                      aria-label="Tempat lahir (wajib)"
                      maxLength={500}
                      value={resident.birth_place}
                      onChange={(e) =>
                        setResident({
                          ...resident,
                          birth_place: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Jenis kelamin (wajib)
                    <select
                      required
                      aria-label="Jenis kelamin (wajib)"
                      value={resident.gender}
                      onChange={(e) =>
                        setResident({ ...resident, gender: e.target.value })
                      }
                    >
                      <option value="">Pilih jenis kelamin</option>
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </select>
                  </label>
                  <label>
                    Agama (wajib)
                    <select
                      required
                      aria-label="Agama (wajib)"
                      value={resident.religion}
                      onChange={(e) =>
                        setResident({ ...resident, religion: e.target.value })
                      }
                    >
                      <option value="">Pilih agama</option>
                      <option value="Islam">Islam</option>
                      <option value="Kristen">Kristen</option>
                      <option value="Katolik">Katolik</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Buddha">Buddha</option>
                      <option value="Konghucu">Konghucu</option>
                      <option value="Kepercayaan">Kepercayaan</option>
                    </select>
                  </label>
                  <label>
                    Status perkawinan (wajib)
                    <select
                      required
                      aria-label="Status perkawinan (wajib)"
                      value={resident.marital_status}
                      onChange={(e) =>
                        setResident({
                          ...resident,
                          marital_status: e.target.value,
                        })
                      }
                    >
                      <option value="">Pilih status perkawinan</option>
                      <option value="Belum Kawin">Belum Kawin</option>
                      <option value="Kawin">Kawin</option>
                      <option value="Cerai Hidup">Cerai Hidup</option>
                      <option value="Cerai Mati">Cerai Mati</option>
                    </select>
                  </label>
                  <label>
                    Pekerjaan (wajib)
                    <input
                      required
                      aria-label="Pekerjaan (wajib)"
                      maxLength={500}
                      value={resident.occupation}
                      onChange={(e) =>
                        setResident({
                          ...resident,
                          occupation: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Alamat (wajib)
                    <textarea
                      required
                      aria-label="Alamat (wajib)"
                      maxLength={500}
                      value={resident.address}
                      onChange={(e) =>
                        setResident({ ...resident, address: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    RT (wajib)
                    <input
                      required
                      aria-label="RT (wajib)"
                      maxLength={10}
                      value={resident.rt}
                      onChange={(e) =>
                        setResident({ ...resident, rt: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    RW (wajib)
                    <input
                      required
                      aria-label="RW (wajib)"
                      maxLength={10}
                      value={resident.rw}
                      onChange={(e) =>
                        setResident({ ...resident, rw: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  WhatsApp aktif (wajib)
                  <input
                    required
                    aria-label="WhatsApp aktif (wajib)"
                    type="tel"
                    inputMode="tel"
                    pattern="\+?[0-9]{8,15}"
                    placeholder="081234567890"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </label>
              </>
            )}

            <div className="actions">
              <p id="identity-next-help" role="status">
                {!checked
                  ? 'Lanjut aktif setelah pemeriksaan NIK selesai. Isi NIK dan tanggal lahir, lalu tekan Cek NIK.'
                  : 'Lengkapi seluruh data pemohon dan nomor WhatsApp sebelum menekan Lanjut. Mengubah NIK atau tanggal lahir memerlukan Cek NIK ulang.'}
              </p>
              <button
                type="button"
                aria-describedby="identity-next-help"
                disabled={!checked}
                onClick={next}
              >
                Lanjut
              </button>
            </div>
          </>
        )}

        {/* LANGKAH 2: PILIH JENIS SURAT & FORM ISIAN SURAT */}
        {step === 2 && (
          <>
            <h2>Pilih jenis surat</h2>
            {loading ? (
              <p role="status">Memuat jenis surat...</p>
            ) : types.length === 0 ? (
              <>
                <p>Jenis surat belum tersedia.</p>
                <button type="button" onClick={() => void loadTypes()}>
                  Muat ulang
                </button>
              </>
            ) : (
              <>
                <label>
                  Jenis surat
                  <select
                    aria-label="Jenis surat"
                    required
                    value={typeId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTypeId(id);
                      setFields(
                        types.find((t) => t.id === id)?.defaults || {}
                      );
                    }}
                  >
                    <option value="">Pilih jenis surat</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                {selected && (
                  <>
                    <p style={{ marginTop: '16px', color: 'var(--color-text-muted)' }}>
                      Kewarganegaraan memakai nilai bawaan bila tersedia. Lengkapi isian data surat sesuai kebutuhan.
                    </p>
                    <div className="grid">
                      {letterFields.map((f) => (
                        <DynamicLetterField
                          key={f.key}
                          field={f}
                          value={fields[f.key] || ''}
                          onChange={(val) =>
                            setFields({ ...fields, [f.key]: val })
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={prev}
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={next}
              >
                Lanjut
              </button>
            </div>
          </>
        )}

        {/* LANGKAH 3: BERKAS PERSYARATAN */}
        {step === 3 && (
          <>
            <h2>Berkas persyaratan</h2>
            {selected?.requirements.length ? (
              <ul>
                {selected.requirements.map((r) => (
                  <li key={r.id}>
                    {r.label} ({r.mandatory ? 'Wajib' : 'Opsional'})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">
                Persyaratan belum ditetapkan. Ini tidak berarti berkas sudah
                lengkap. Petugas akan memeriksa kelengkapan.
              </p>
            )}
            <p>
              Lampirkan KTP, KK, pengantar RT/RW atau berkas sesuai daftar.
              Maksimal tiga berkas PDF, PNG, JPEG; 2 MB per berkas. Pengunggahan
              tidak menjamin kelengkapan.
            </p>
            <label>
              Lampiran
              <input
                aria-label="Lampiran"
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  const issue = attachmentError(picked);
                  if (issue) setError(issue);
                  else {
                    setError('');
                    setFiles(picked);
                  }
                }}
              />
            </label>
            {files.length > 0 && (
              <ul>
                {files.map((f, i) => (
                  <li key={i}>
                    {f.name} ({Math.ceil(f.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            )}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={prev}
              >
                Kembali
              </button>
              <button type="button" onClick={next}>
                Lanjut
              </button>
            </div>
          </>
        )}

        {/* LANGKAH 4: KONFIRMASI */}
        {step === 4 && (
          <>
            <h2>Konfirmasi permohonan</h2>
            <p>
              Periksa kembali usulan sebelum mengirim. Dokumen tidak langsung
              terbit dan harus diverifikasi petugas.
            </p>
            <dl>
              <dt>Jenis surat</dt>
              <dd>{selected?.name}</dd>
              <dt>Nama pemohon</dt>
              <dd>{resident.name}</dd>
              <dt>NIK</dt>
              <dd>{resident.nik}</dd>
              <dt>Tempat, Tanggal Lahir</dt>
              <dd>
                {resident.birth_place}, {resident.birth_date}
              </dd>
              <dt>Jenis Kelamin</dt>
              <dd>
                {resident.gender === 'L'
                  ? 'Laki-laki'
                  : resident.gender === 'P'
                  ? 'Perempuan'
                  : resident.gender}
              </dd>
              <dt>Agama</dt>
              <dd>{resident.religion}</dd>
              <dt>Status Perkawinan</dt>
              <dd>{resident.marital_status}</dd>
              <dt>Pekerjaan</dt>
              <dd>{resident.occupation}</dd>
              <dt>Alamat</dt>
              <dd>
                {resident.address} RT {resident.rt} / RW {resident.rw}
              </dd>
              <dt>Kontak WhatsApp</dt>
              <dd>{contact}</dd>
              <dt>Jumlah lampiran</dt>
              <dd>{files.length} berkas</dd>
            </dl>

            <label className="checkbox-row" style={{ marginTop: '20px' }}>
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Saya menyatakan data dan berkas benar.
            </label>

            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={prev}
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={busy || !consent}
              >
                {busy ? 'Mengirim...' : 'Kirim Permohonan'}
              </button>
            </div>
          </>
        )}
      </form>
    </>
  );
}
