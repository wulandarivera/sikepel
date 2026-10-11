'use client';
import { useEffect, useState } from 'react';
import { portalFetch, statusView } from '../../../lib/mandiri-ui';

type Tracked = {
  ticket: string;
  type_name: string;
  status: string;
  created_at: string;
  revision_note?: string;
};

export default function TrackPage() {
  const [ticket, setTicket] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [result, setResult] = useState<Tracked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tiketParam = params.get('tiket') || params.get('ticket');
      if (tiketParam) {
        setTicket(tiketParam.toUpperCase().trim());
      }
    }
  }, []);

  async function track() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const cleanTicket = ticket.trim();
      const cleanBirthDate = birthDate.trim();
      const query = new URLSearchParams({ birth_date: cleanBirthDate }).toString();
      setResult(await portalFetch<Tracked>(
        '/api/mandiri/track/' + encodeURIComponent(cleanTicket) + '?' + query,
        {
          headers: {
            'x-birth-date': cleanBirthDate,
          },
        }
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pelacakan gagal.');
    } finally {
      setBusy(false);
    }
  }

  const view = result ? statusView(result.status) : null;

  return (
    <>
      <div className="portal-page-header">
        <h1>Lacak Status Permohonan</h1>
        <p className="portal-lead">
          Gunakan nomor tiket resmi dan tanggal lahir pemohon yang didaftarkan saat mengajukan permohonan surat.
        </p>
      </div>

      {error && <div role="alert">{error}</div>}

      <form className="panel" onSubmit={e => { e.preventDefault(); void track(); }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Identifikasi Berkas Pelacakan</h2>
        <label>
          Nomor Tiket
          <small>Format: TIK-YYYYMM-XXXXXXXX</small>
          <input
            required
            aria-label="Nomor tiket"
            autoComplete="off"
            spellCheck={false}
            pattern="TIK-[0-9]{6}-[A-F0-9]{8}"
            placeholder="Contoh: TIK-202610-1234ABCD"
            value={ticket}
            onChange={e => { setTicket(e.target.value.toUpperCase()); setResult(null); }}
          />
        </label>
        <label>
          Tanggal Lahir Pemohon
          <small>Gunakan tanggal lahir yang didaftarkan saat pengajuan</small>
          <input
            required
            aria-label="Tanggal lahir pemohon"
            type="date"
            value={birthDate}
            onChange={e => { setBirthDate(e.target.value); setResult(null); }}
          />
        </label>
        <div style={{ marginTop: '20px' }}>
          <button aria-label="Lacak status permohonan" disabled={busy}>{busy ? 'Memeriksa status...' : 'Lacak Permohonan'}</button>
        </div>
        <p className="notice" style={{ marginTop: '20px', fontSize: '0.85rem' }}>
          Pastikan nomor tiket dan tanggal lahir yang dimasukkan sesuai dengan data saat pengajuan surat.
        </p>
      </form>

      {result && view && (
        <section className="panel" aria-label="Hasil pelacakan" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)', letterSpacing: '0.5px' }}>
                Status Permohonan
              </span>
              <h2 style={{ margin: '4px 0 0 0', border: 'none', padding: 0 }}>{view.label}</h2>
            </div>
            <div style={{ background: 'var(--color-primary-light)', padding: '6px 14px', borderRadius: 'var(--radius-sm)', fontWeight: 700, color: 'var(--color-primary)' }}>
              {result.ticket}
            </div>
          </div>

          <p style={{ fontSize: '1rem', color: 'var(--color-text-main)', marginBottom: '8px' }}>
            Jenis Dokumen: <strong>{result.type_name}</strong>
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Diajukan: {new Date(result.created_at).toLocaleString('id-ID', { timeZone: "Asia/Jakarta" }) + " WIB"}
          </p>

          <ol className="timeline" style={{ margin: '24px 0' }}>
            {['Diterima', 'Verifikasi berkas', 'Disetujui', 'Selesai'].map((label, i) => (
              <li key={label} aria-current={view.step === i ? 'step' : undefined}>
                <span style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  marginRight: '10px',
                  background: view.step > i ? 'var(--color-success)' : view.step === i ? 'var(--color-accent)' : '#f1f5f9',
                  color: view.step >= i ? '#ffffff' : 'var(--color-text-muted)'
                }}>
                  {view.step > i ? '✓' : i + 1}
                </span>
                <span>{label}{view.step === i ? ' — status saat ini' : ''}</span>
              </li>
            ))}
          </ol>

          {result.status === 'NEEDS_REVISION' && (
            <div role="alert" style={{ marginTop: '20px' }}>
              <strong>Catatan Perbaikan dari Petugas:</strong>
              <div style={{ marginTop: '6px' }}>{result.revision_note || 'Hubungi kelurahan untuk arahan perbaikan.'}</div>
              <small style={{ display: 'block', marginTop: '8px' }}>
                Unggah ulang belum tersedia secara daring. Silakan hubungi loket Kelurahan Cibodas dengan membawa nomor tiket.
              </small>
            </div>
          )}

          {result.status === 'REJECTED' && (
            <div role="alert" style={{ marginTop: '20px' }}>
              Permohonan ditolak. Silakan hubungi petugas loket Kelurahan Cibodas untuk informasi lebih lanjut.
            </div>
          )}

          <p className="notice" style={{ marginTop: '20px' }}>
            Tunggu konfirmasi atau arahan petugas kelurahan sebelum datang mengambil surat fisik di kantor kelurahan.
          </p>
        </section>
      )}
    </>
  );
}
