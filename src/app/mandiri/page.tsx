import Link from 'next/link';


export default function PortalHome() {
  return (
    <>
      <div className="portal-hero">
        <div className="portal-hero-tag">Untuk warga</div>
        <h1>Layanan surat mandiri</h1>
        <div className="gold-line" />
        <p className="portal-lead">
          Ajukan permohonan surat dari rumah, unggah persyaratan digital, pantau status verifikasi, dan ambil surat resmi di kantor kelurahan.
        </p>
      </div>

      <div className="portal-cards">
        <Link className="portal-card action-apply" href="/mandiri/ajukan">
          <div className="portal-card-header">
            
            <div>
              
              <div className="portal-card-title">Ajukan Permohonan Surat</div>
            </div>
          </div>
          <div className="portal-card-desc">
            Masukkan NIK, pilih jenis surat yang dibutuhkan, dan unggah foto berkas persyaratan secara langsung.
          </div>
          <div className="portal-card-footer">
            <span>Mulai Pengajuan</span>
            <span className="portal-card-arrow">&rarr;</span>
          </div>
        </Link>

        <Link className="portal-card action-track" href="/mandiri/lacak">
          <div className="portal-card-header">
            
            <div>
              
              <div className="portal-card-title">Lacak Status Permohonan</div>
            </div>
          </div>
          <div className="portal-card-desc">
            Pantau perkembangan dokumen Anda menggunakan nomor tiket dan tanggal lahir pemohon.
          </div>
          <div className="portal-card-footer">
            <span>Cek Status Tiket</span>
            <span className="portal-card-arrow">&rarr;</span>
          </div>
        </Link>
      </div>

      <aside className="notice">
        <strong>Pemberitahuan Pelayanan:</strong> Data yang diajukan secara mandiri akan diverifikasi oleh petugas Kelurahan Cibodas. Pastikan dokumen dan data yang Anda unggah sesuai dengan dokumen kependudukan asli.
      </aside>
    </>
  );
}
