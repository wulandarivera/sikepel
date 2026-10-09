"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanWaText, type WaStatus } from "@/lib/wa-dashboard";
const date = (value: string | null) => value ? new Date(value).toLocaleString("id-ID") : "Belum tersedia";
export function WaDashboard() {
  const [status, setStatus] = useState<WaStatus | null>(null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [actionError, setActionError] = useState(""), [busy, setBusy] = useState(false), [updated, setUpdated] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    try {
      const response = await fetch("/api/wa/status", { cache: "no-store", credentials: "same-origin", signal: current.signal });
      if (response.status === 401) { setStatus(null); window.location.assign("/wa/login"); return; }
      if (!response.ok) throw new Error(response.status === 403 ? "Akses gateway ditolak. Periksa lingkup kelurahan." : "Status gateway tidak tersedia. Coba kembali.");
      const data: WaStatus = await response.json();
      if (!current.signal.aborted) { setStatus(data); setError(""); setUpdated(new Date().toISOString()); }
    } catch (e) {
      if (!current.signal.aborted) { setStatus(null); setError(e instanceof Error ? e.message : "Status gateway tidak tersedia."); }
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!locked.current && !document.hidden) void refresh(); }, 5000);
    return () => { clearInterval(timer); controller.current?.abort(); };
  }, [refresh]);
  async function action(kind: "send" | "logout", body: object) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice(""); setActionError(""); controller.current?.abort();
    const timeout = new AbortController(); const timer = window.setTimeout(() => timeout.abort(), 15000);
    if (kind === "logout") { dialog.current?.close(); setStatus(null); }
    try {
      const response = await fetch(`/api/wa/${kind}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: timeout.signal });
      if (response.status === 401) { setStatus(null); window.location.assign("/wa/login"); return; }
      if (!response.ok) throw new Error("Tindakan belum terkonfirmasi. Periksa status sebelum mencoba kembali.");
      setNotice(kind === "send" ? "Pesan uji berhasil dikirim." : "Sesi lama diputus. Tunggu QR baru untuk menghubungkan nomor lain.");
    } catch { setActionError("Tindakan belum terkonfirmasi. Periksa status sebelum mencoba kembali."); }
    finally { clearTimeout(timer); locked.current = false; setBusy(false); void refresh(); }
  }
  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get("text") || "").trim();
    if (cleanWaText(text) !== text) { setActionError("Pesan uji tidak boleh mengandung emoji."); return; }
    void action("send", { to: form.get("to"), text });
  }
  const label = !status ? "Status belum tersedia" : status.connected ? "Terhubung" : status.hasQr ? "Menunggu Scan QR" : "Terputus";
  const qr = status && !status.connected && status.hasQr && status.qrDataUrl && /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(status.qrDataUrl) ? status.qrDataUrl : null;
  return <main className="wa-shell">
    <header className="wa-header"><div className="wa-brand"><img src="/assets/icon.webp" width="48" height="48" alt="SIKEPEL" /><div><p className="wa-eyebrow">SIKEPEL / LAYANAN WHATSAPP</p><h1>Dashboard WhatsApp</h1></div></div><a href="/wa/login">Ganti akun operator</a></header>
    <p className="wa-intro">Pemantauan hotline dan notifikasi pelayanan kelurahan. Akses terbatas untuk operator berwenang.</p>
    {error && <p role="alert" className="wa-error">{error}</p>}{actionError && <p role="alert" className="wa-error">{actionError}</p>}<p role="status" className="wa-notice">{notice}</p>
    <section className="wa-card wa-status"><div><p className="wa-eyebrow">KONEKSI GATEWAY</p><h2><span className={`wa-badge ${status?.connected ? "wa-connected" : ""}`}>{label}</span></h2><p className="wa-muted">Pembaruan setiap 5 detik saat halaman aktif. Terakhir: {date(updated)}</p></div><button type="button" disabled={busy} onClick={() => void refresh()}>Perbarui status</button></section>
    <div className="wa-grid"><section className="wa-card"><h2>Profil hotline</h2><dl><dt>Nomor WhatsApp</dt><dd>{cleanWaText(status?.profile.phone || "Belum tersedia")}</dd><dt>Nama profil</dt><dd>{cleanWaText(status?.profile.name || "Belum tersedia")}</dd><dt>Mulai sesi</dt><dd>{date(status?.profile.startedAt || null)}</dd></dl><button className="wa-danger" type="button" disabled={busy || !status} onClick={() => dialog.current?.showModal()}>Putus koneksi / Ganti nomor</button><p className="wa-muted">Sesi nomor lama akan dihapus. Pemindaian QR diperlukan untuk nomor baru.</p></section>
    <section className="wa-card wa-pair"><h2>Hubungkan perangkat</h2>{qr ? <><img className="wa-qr" src={qr} width="240" height="240" alt="QR penghubung WhatsApp privat" /><p>Buka WhatsApp, pilih Perangkat tertaut, lalu scan QR ini.</p><p className="wa-muted">QR bersifat rahasia. Jangan bagikan atau simpan tangkapan layar QR.</p></> : <p>{status?.connected ? "Perangkat WhatsApp sudah terhubung." : "QR belum tersedia. Pastikan daemon berjalan dan tunggu pembaruan status."}</p>}<p className="wa-muted">Gateway lokal tetap memerlukan jaringan dan server WhatsApp.</p></section></div>
    <section className="wa-card"><h2>Uji kirim pesan</h2><p>Kirim hanya ke nomor pengujian yang berwenang. Pesan benar-benar dikirim melalui hotline.</p><form onSubmit={send} className="wa-send"><fieldset disabled={busy || !status?.connected}><label htmlFor="wa-to">Nomor tujuan</label><input id="wa-to" name="to" type="tel" inputMode="tel" pattern="(\\+?62|0|8)[0-9]{8,13}" placeholder="081234567890" required /><label htmlFor="wa-text">Pesan uji</label><textarea id="wa-text" name="text" maxLength={2000} rows={3} required /><button>{busy ? "Memproses..." : "Kirim pesan uji"}</button></fieldset></form></section>
    <section className="wa-card"><h2>Aktivitas pesan</h2><p className="wa-muted">Maksimal 100 aktivitas proses daemon. Metadata teredaksi, bukan arsip isi percakapan.</p><div className="wa-table" tabIndex={0} role="region" aria-label="Tabel aktivitas pesan"><table><caption className="wa-sr">Riwayat pesan masuk dan notifikasi keluar</caption><thead><tr><th scope="col">Waktu</th><th scope="col">Arah</th><th scope="col">Nomor</th><th scope="col">Aktivitas</th><th scope="col">Status</th></tr></thead><tbody>{status?.logs.length ? status.logs.map(log => <tr key={log.id}><td>{date(log.at)}</td><td>{log.direction === "in" ? "Masuk" : "Keluar"}</td><td>{cleanWaText(log.recipient)}</td><td>{cleanWaText(log.summary)}</td><td>{cleanWaText(log.status)}</td></tr>) : <tr><td colSpan={5}>{status ? "Belum ada aktivitas pesan." : "Aktivitas belum tersedia."}</td></tr>}</tbody></table></div></section>
    <dialog ref={dialog} className="wa-dialog" aria-labelledby="wa-confirm-title"><h2 id="wa-confirm-title">Putus sesi WhatsApp?</h2><p>Nomor lama tidak dapat mengirim atau menerima melalui gateway setelah sesi diputus. Scan QR baru untuk menghubungkan nomor pengganti.</p><div className="wa-actions"><button autoFocus type="button" onClick={() => dialog.current?.close()}>Batal</button><button className="wa-danger" type="button" onClick={() => void action("logout", { confirm: true })}>Ya, putus sesi</button></div></dialog>
    <footer className="wa-muted">SIKEPEL · Dashboard privat layanan WhatsApp</footer>
  </main>;
}
