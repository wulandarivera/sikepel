"use client";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  console.error("GLOBAL APP ERROR:", error);
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
