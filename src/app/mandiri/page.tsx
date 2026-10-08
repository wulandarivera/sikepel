import Link from 'next/link';

export default function PortalHome() {
  return (
    <>
      <div className="portal-hero">
        <span className="portal-hero-tag">Layanan Mandiri Warga</span>
        <h1>Pelayanan Surat Cepat &amp; Transparan</h1>
        <p className="portal-lead">
          Ajukan permohonan surat dari rumah, unggah persyaratan digital, pantau status verifikasi, dan ambil surat resmi di kantor kelurahan.
        </p>
      </div>

      <div className="portal-cards">
        <Link className="portal-card action-apply" href="/mandiri/ajukan">
          <div className="portal-card-header">
            <div className="portal-card-icon">1</div>
          </div>
          <div className="portal-card-title">Ajukan Permohonan Surat</div>
          <div className="portal-card-desc">
            Masukkan NIK, pilih jenis surat yang dibutuhkan, dan unggah foto berkas persyaratan secara langsung.
          </div>
          <div className="portal-card-footer">
            Mulai Pengajuan &rarr;
          </div>
        </Link>

        <Link className="portal-card action-track" href="/mandiri/lacak">
          <div className="portal-card-header">
            <div className="portal-card-icon">2</div>
          </div>
          <div className="portal-card-title">Lacak Status Permohonan</div>
          <div className="portal-card-desc">
            Pantau perkembangan dokumen Anda menggunakan nomor tiket dan kode akses rahasia permohonan.
          </div>
          <div className="portal-card-footer">
            Cek Status Tiket &rarr;
          </div>
        </Link>
      </div>

      <aside className="notice">
        <strong>Pemberitahuan Pelayanan:</strong> Data yang diajukan secara mandiri akan diverifikasi oleh petugas Kelurahan Cibodas. Pastikan nomor WhatsApp aktif untuk menerima instruksi pengambilan surat fisik di loket pelayanan.
      </aside>
    </>
  );
}
