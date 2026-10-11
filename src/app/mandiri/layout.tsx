import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import './portal.css';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Kelurahan Cibodas Mandiri — Pelayanan Surat Mandiri SIKEPEL',
  description: 'Portal pelayanan mandiri pengajuan dan pelacakan surat warga Kelurahan Cibodas.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  icons: { icon: '/assets/icon.webp' }
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal">
      <a className="portal-skip" href="#portal-main">Lewati ke isi</a>
      <header>
        <Link className="portal-brand" href="/mandiri">
          <Image
            src="/assets/icon.webp"
            alt="Logo SIKEPEL"
            width={40}
            height={40}
            className="portal-brand-logo"
            priority
          />
          <div className="portal-brand-text">
            <span className="portal-brand-title">
              SIKE<span>PEL</span> <span className="portal-brand-tag">Mandiri</span>
            </span>
            <span className="portal-brand-subtitle">Pelayanan Mandiri Kelurahan Cibodas</span>
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
        <small className="portal-version">Versi {APP_VERSION}</small>
      </footer>
    </div>
  );
}
