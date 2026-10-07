import Link from 'next/link';
import type { Metadata } from 'next';
import './portal.css';
export const metadata:Metadata={title:'Kelurahan Cibodas Mandiri',description:'Pengajuan dan pelacakan permohonan surat warga.',robots:{index:false,follow:false},referrer:'no-referrer',icons:{icon:[]}};
export default function PortalLayout({children}:{children:React.ReactNode}) {
  return <div className="portal"><a className="portal-skip" href="#portal-main">Lewati ke isi</a><header><Link href="/mandiri">Kelurahan Cibodas Mandiri</Link><nav aria-label="Navigasi warga"><Link href="/mandiri/ajukan">Ajukan</Link><Link href="/mandiri/lacak">Lacak</Link></nav></header><main id="portal-main">{children}</main><footer>Pelayanan Kelurahan Cibodas. Pengajuan online tetap memerlukan verifikasi petugas.</footer></div>;
}
