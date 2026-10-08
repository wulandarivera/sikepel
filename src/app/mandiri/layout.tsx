import Link from 'next/link';
import type { Metadata } from 'next';
import './portal.css';

export const metadata: Metadata = {
  title: 'Kelurahan Cibodas Mandiri — Pelayanan Surat Mandiri',
  description: 'Portal pelayanan mandiri pengajuan dan pelacakan surat warga Kelurahan Cibodas.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  icons: { icon: [] }
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal">
      <a className="portal-skip" href="#portal-main">Lewati ke isi</a>
      <header>
        <Link className="portal-brand" href="/mandiri">
          <div className="portal-brand-badge">C</div>
          <div className="portal-brand-text">
            <span className="portal-brand-title">Kelurahan Cibodas</span>
            <span className="portal-brand-subtitle">Portal Mandiri Warga</span>
          </div>
        </Link>
        <nav aria-label="Navigasi warga">
          <Link href="/mandiri">Beranda</Link>
          <Link href="/mandiri/ajukan">Ajukan Surat</Link>
          <Link href="/mandiri/lacak">Lacak Tiket</Link>
        </nav>
      </header>
      <main id="portal-main">{children}</main>
      <footer>
        &copy; {new Date().getFullYear()} Pelayanan Terpadu Kelurahan Cibodas · Sistem Informasi Pelayanan Kelurahan (SIKEPEL)
      </footer>
    </div>
  );
}
