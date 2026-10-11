"use client";
import { useState } from "react";
export function WaLogin() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password"), remember: false }) });
      if (!response.ok) throw new Error("Masuk gagal. Periksa akun Anda atau coba kembali.");
      window.location.assign("/wa");
    } catch { setError("Masuk gagal. Periksa akun Anda atau coba kembali."); }
    finally { setBusy(false); }
  }
  return <main className="wa-shell wa-login"><section className="wa-card"><img src="/assets/logo.webp" width="210" height="140" alt="SIKEPEL" /><p className="wa-eyebrow">LAYANAN WHATSAPP</p><h1>Masuk operator</h1><p>Dashboard privat untuk operator dan administrator kelurahan.</p><form onSubmit={submit}>{error && <p role="alert" className="wa-error">{error}</p>}<label htmlFor="wa-username">Username</label><input id="wa-username" name="username" autoComplete="username" required disabled={busy} /><label htmlFor="wa-password">Kata sandi</label><input id="wa-password" name="password" type="password" autoComplete="current-password" required disabled={busy} /><button disabled={busy}>{busy ? "Memeriksa akun..." : "Masuk"}</button></form><p className="wa-muted">Gunakan akun SIKEPEL kelurahan Anda. Akses hanya untuk petugas yang berwenang.</p></section></main>;
}
