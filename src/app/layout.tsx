import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SIKEPEL — Pelayanan Kelurahan",
  description:
    "Sistem Informasi Pelayanan Kelurahan. Pelayanan surat, data penduduk, dan arsip dalam satu aplikasi.",
  icons: { icon: "/assets/icon.webp" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
