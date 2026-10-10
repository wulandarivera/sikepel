import Link from 'next/link';
import Image from 'next/image';

export default function PortalHome() {
  return (
    <>
      <div className="portal-hero">
        <div className="portal-hero-logo-box">
          <Image
            src="/assets/logo.webp"
            alt="SIKEPEL Kelurahan Cibodas"
            width={240}
            height={160}
            className="portal-hero-logo"
            priority
          />
        </div>
        <div className="portal-hero-tag">Layanan Mandiri Warga</div>
        <h1>Pelayanan Surat Cepat &amp; Transparan</h1>
        <div className="gold-line" />
        <p className="portal-lead">
          Ajukan permohonan surat dari rumah, unggah persyaratan digital, pantau status verifikasi, dan ambil surat resmi di kantor kelurahan.
        </p>
      </div>

      <div className="portal-cards">
        <Link className="portal-card action-apply" href="/mandiri/ajukan">
          <div className="portal-card-header">
            <div className="portal-card-icon">1</div>
            <div>
              <div className="portal-card-step-badge">Langkah 1</div>
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
            <div className="portal-card-icon">2</div>
            <div>
              <div className="portal-card-step-badge">Langkah 2</div>
              <div className="portal-card-title">Lacak Status Permohonan</div>
            </div>
          </div>
          <div className="portal-card-desc">
            Pantau perkembangan dokumen Anda menggunakan nomor tiket dan kode akses rahasia permohonan.
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
