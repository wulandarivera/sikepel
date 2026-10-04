"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Halaman belum berhasil dimuat</h1>
      <p>Periksa koneksi, lalu coba kembali.</p>
      <button className="button" onClick={reset}>
        Coba Lagi
      </button>
    </main>
  );
}
