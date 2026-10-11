"use client";
import { APP_VERSION } from "@/lib/version";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanWaText, type WaStatus, type WaAutoReply, type AutoReplyMatchType } from "@/lib/wa-dashboard";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : "Belum tersedia";

export function WaDashboard() {
  const [activeTab, setActiveTab] = useState<"status" | "replies">("status");
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);

  // Auto-replies state
  const [replies, setReplies] = useState<WaAutoReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [editingReply, setEditingReply] = useState<WaAutoReply | null>(null);
  const [isNewReply, setIsNewReply] = useState(false);
  const [deletingReply, setDeletingReply] = useState<WaAutoReply | null>(null);

  // Form modal state
  const [formKeyword, setFormKeyword] = useState("");
  const [formMatchType, setFormMatchType] = useState<AutoReplyMatchType>("CONTAINS");
  const [formReplyText, setFormReplyText] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const replyDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const response = await fetch("/api/wa/status", {
        cache: "no-store",
        credentials: "same-origin",
        signal: current.signal,
      });
      if (response.status === 401) {
        setStatus(null);
        window.location.assign("/wa/login");
        return;
      }
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Akses gateway ditolak. Periksa lingkup kelurahan."
            : "Status gateway tidak tersedia. Coba kembali.",
        );
      }
      const data: WaStatus = await response.json();
      if (!current.signal.aborted) {
        setStatus(data);
        setError("");
        setUpdated(new Date().toISOString());
      }
    } catch (e) {
      if (!current.signal.aborted) {
        setStatus(null);
        setError(e instanceof Error ? e.message : "Status gateway tidak tersedia.");
      }
    }
  }, []);

  const loadReplies = useCallback(async () => {
    setRepliesLoading(true);
    try {
      const response = await fetch("/api/wa/auto-replies", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        window.location.assign("/wa/login");
        return;
      }
      if (!response.ok) {
        throw new Error("Gagal memuat template balasan otomatis.");
      }
      const res = await response.json();
      if (res && Array.isArray(res.data)) {
        setReplies(res.data);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Gagal memuat template.");
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadReplies();
    const timer = window.setInterval(() => {
      if (!locked.current && !document.hidden && activeTab === "status") {
        void refresh();
      }
    }, 5000);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [refresh, loadReplies, activeTab]);

  async function action(kind: "send" | "logout", body: object) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice("");
    setActionError("");
    controller.current?.abort();
    const timeout = new AbortController();
    const timer = window.setTimeout(() => timeout.abort(), 15000);
    if (kind === "logout") {
      dialog.current?.close();
      setStatus(null);
    }
    try {
      const response = await fetch(`/api/wa/${kind}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
      if (response.status === 401) {
        setStatus(null);
        window.location.assign("/wa/login");
        return;
      }
      if (!response.ok) {
        throw new Error("Tindakan belum terkonfirmasi. Periksa status sebelum mencoba kembali.");
      }
      setNotice(
        kind === "send"
          ? "Pesan uji berhasil dikirim."
          : "Sesi lama diputus. Tunggu QR baru untuk menghubungkan nomor lain.",
      );
    } catch {
      setActionError("Tindakan belum terkonfirmasi. Periksa status sebelum mencoba kembali.");
    } finally {
      clearTimeout(timer);
      locked.current = false;
      setBusy(false);
      void refresh();
    }
  }

  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("text") || "").trim();
    if (cleanWaText(text) !== text) {
      setActionError("Pesan uji tidak boleh mengandung emoji.");
      return;
    }
    void action("send", { to: form.get("to"), text });
  }

  // Open modal for new reply
  function openNewReplyModal() {
    setIsNewReply(true);
    setEditingReply(null);
    setFormKeyword("");
    setFormMatchType("CONTAINS");
    setFormReplyText("");
    setFormIsActive(true);
    setActionError("");
    replyDialog.current?.showModal();
  }

  // Open modal for editing reply
  function openEditReplyModal(reply: WaAutoReply) {
    setIsNewReply(false);
    setEditingReply(reply);
    setFormKeyword(reply.keyword);
    setFormMatchType(reply.match_type);
    setFormReplyText(reply.reply_text);
    setFormIsActive(reply.is_active);
    setActionError("");
    replyDialog.current?.showModal();
  }

  // Save auto-reply (create or update)
  async function saveReply(e: React.FormEvent) {
    e.preventDefault();
    const kw = formKeyword.trim();
    const rt = formReplyText.trim();

    if (!kw) {
      setActionError("Kata kunci wajib diisi.");
      return;
    }
    if (!rt) {
      setActionError("Isi pesan balasan wajib diisi.");
      return;
    }
    if (cleanWaText(kw) !== kw || cleanWaText(rt) !== rt) {
      setActionError("Kata kunci dan isi pesan tidak boleh mengandung emoji.");
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      const url = isNewReply
        ? "/api/wa/auto-replies"
        : `/api/wa/auto-replies/${editingReply?.id}`;
      const method = isNewReply ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: kw,
          match_type: formMatchType,
          reply_text: rt,
          is_active: formIsActive,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Gagal menyimpan template balasan.");
      }

      replyDialog.current?.close();
      setNotice(
        isNewReply
          ? "Template balasan baru berhasil ditambahkan."
          : "Template balasan berhasil diperbarui.",
      );
      void loadReplies();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menyimpan template.");
    } finally {
      setBusy(false);
    }
  }

  // Toggle active/inactive
  async function toggleActive(reply: WaAutoReply) {
    setBusy(true);
    try {
      const res = await fetch(`/api/wa/auto-replies/${reply.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !reply.is_active }),
      });
      if (!res.ok) throw new Error("Gagal mengubah status template.");
      setNotice(`Status template '${reply.keyword}' berhasil diperbarui.`);
      void loadReplies();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }

  // Confirm delete
  function openDeleteConfirm(reply: WaAutoReply) {
    setDeletingReply(reply);
    deleteDialog.current?.showModal();
  }

  // Execute delete
  async function executeDelete() {
    if (!deletingReply) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/wa/auto-replies/${deletingReply.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Gagal menghapus template balasan.");
      deleteDialog.current?.close();
      setNotice(`Template balasan '${deletingReply.keyword}' berhasil dihapus.`);
      setDeletingReply(null);
      void loadReplies();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menghapus template.");
    } finally {
      setBusy(false);
    }
  }

  // Helper to render live preview text with dynamic variables
  function renderPreviewText(text: string): string {
    const today = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const nowTime = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return cleanWaText(
      text
        .replace(/\{nama\}/gi, "Budi Santoso")
        .replace(/\{name\}/gi, "Budi Santoso")
        .replace(/\{nomor\}/gi, "081234567890")
        .replace(/\{telepon\}/gi, "081234567890")
        .replace(/\{tanggal\}/gi, today)
        .replace(/\{date\}/gi, today)
        .replace(/\{jam\}/gi, nowTime)
        .replace(/\{waktu\}/gi, nowTime),
    );
  }

  const label = !status
    ? "Status belum tersedia"
    : status.connected
      ? "Terhubung"
      : status.hasQr
        ? "Menunggu Scan QR"
        : "Terputus";

  const qr =
    status &&
    !status.connected &&
    status.hasQr &&
    status.qrDataUrl &&
    /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(status.qrDataUrl)
      ? status.qrDataUrl
      : null;

  return (
    <main className="wa-shell">
      <header className="wa-header">
        <div className="wa-brand">
          <img src="/assets/icon.webp" width="48" height="48" alt="SIKEPEL" />
          <div>
            <p className="wa-eyebrow">SIKEPEL / LAYANAN WHATSAPP</p>
            <h1>Dashboard WhatsApp</h1>
          </div>
        </div>
        <a href="/wa/login">Ganti akun operator</a>
      </header>

      <p className="wa-intro">
        Pemantauan hotline, notifikasi pelayanan, dan pengelolaan balasan otomatis kelurahan.
        Akses terbatas untuk operator berwenang.
      </p>

      {error && <p role="alert" className="wa-error">{error}</p>}
      {actionError && <p role="alert" className="wa-error">{actionError}</p>}
      <p role="status" className="wa-notice">{notice}</p>

      {/* Tab Navigation */}
      <nav className="wa-tabs" aria-label="Navigasi Menu Dashboard" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "status"}
          className={`wa-tab ${activeTab === "status" ? "wa-tab-active" : ""}`}
          onClick={() => setActiveTab("status")}
        >
          Koneksi & Status
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "replies"}
          className={`wa-tab ${activeTab === "replies" ? "wa-tab-active" : ""}`}
          onClick={() => {
            setActiveTab("replies");
            void loadReplies();
          }}
        >
          Template Respon
        </button>
      </nav>

      {/* TAB 1: STATUS & KONEKSI */}
      {activeTab === "status" && (
        <>
          <section className="wa-card wa-status">
            <div>
              <p className="wa-eyebrow">KONEKSI GATEWAY</p>
              <h2>
                <span className={`wa-badge ${status?.connected ? "wa-connected" : ""}`}>
                  {label}
                </span>
              </h2>
              <p className="wa-muted">
                Pembaruan setiap 5 detik saat halaman aktif. Terakhir: {date(updated)}
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => void refresh()}>
              Perbarui status
            </button>
          </section>

          <div className="wa-grid">
            <section className="wa-card">
              <h2>Profil hotline</h2>
              <dl>
                <dt>Nomor WhatsApp</dt>
                <dd>{cleanWaText(status?.profile.phone || "Belum tersedia")}</dd>
                <dt>Nama profil</dt>
                <dd>{cleanWaText(status?.profile.name || "Belum tersedia")}</dd>
                <dt>Mulai sesi</dt>
                <dd>{date(status?.profile.startedAt || null)}</dd>
              </dl>

            </section>

            <section className="wa-card wa-pair">
              <h2>{status?.connected ? "Perangkat terhubung" : "Hubungkan perangkat"}</h2>
              {qr ? (
                <>
                  <img
                    className="wa-qr"
                    src={qr}
                    width="240"
                    height="240"
                    alt="QR penghubung WhatsApp privat"
                  />
                  <p>Buka WhatsApp, pilih Perangkat tertaut, lalu scan QR ini.</p>
                  <p className="wa-muted">
                    QR bersifat rahasia. Jangan bagikan atau simpan tangkapan layar QR.
                  </p>
                </>
              ) : (
                <p>
                  {status?.connected
                    ? "Perangkat WhatsApp sudah terhubung."
                    : "QR belum tersedia. Pastikan daemon berjalan dan tunggu pembaruan status."}
                </p>
              )}
              <p className="wa-muted">
                Gateway lokal tetap memerlukan jaringan dan server WhatsApp.
              </p>
            </section>
          </div>

          <section className="wa-card wa-danger-zone" aria-labelledby="wa-session-danger">
            <h2 id="wa-session-danger">Pengaturan sesi berisiko</h2>
              <button
                className="wa-danger"
                type="button"
                disabled={busy || !status}
                onClick={() => dialog.current?.showModal()}
              >
                Putus koneksi / Ganti nomor
              </button>
              <p className="wa-muted">
                Sesi nomor lama akan dihapus. Pemindaian QR diperlukan untuk nomor baru.
              </p>
          </section>

          <section className="wa-card">
            <h2>Uji kirim pesan</h2>
            <p>
              Kirim hanya ke nomor pengujian yang berwenang. Pesan benar-benar dikirim melalui hotline.
            </p>
            <form onSubmit={send} className="wa-send">
              <fieldset disabled={busy || !status?.connected}>
                <label htmlFor="wa-to">Nomor tujuan</label>
                <input
                  id="wa-to"
                  name="to"
                  type="tel"
                  inputMode="tel"
                  pattern="(\+?62|0|8)[0-9]{8,13}"
                  placeholder="081234567890"
                  required
                />
                <label htmlFor="wa-text">Pesan uji</label>
                <textarea id="wa-text" name="text" maxLength={2000} rows={3} required />
                <button>{busy ? "Memproses..." : "Kirim pesan uji"}</button>
              </fieldset>
            </form>
          </section>

          <section className="wa-card">
            <h2>Aktivitas pesan</h2>
            <p className="wa-muted">
              Maksimal 100 aktivitas proses daemon. Metadata teredaksi, bukan arsip isi percakapan.
            </p>
            <div className="wa-table" tabIndex={0} role="region" aria-label="Tabel aktivitas pesan">
              <table>
                <caption className="wa-sr">Riwayat pesan masuk dan notifikasi keluar</caption>
                <thead>
                  <tr>
                    <th scope="col">Waktu</th>
                    <th scope="col">Arah</th>
                    <th scope="col">Nomor</th>
                    <th scope="col">Aktivitas</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.logs.length ? (
                    status.logs.map((log) => (
                      <tr key={log.id}>
                        <td>{date(log.at)}</td>
                        <td>{log.direction === "in" ? "Masuk" : "Keluar"}</td>
                        <td>{cleanWaText(log.recipient)}</td>
                        <td>{cleanWaText(log.summary)}</td>
                        <td>{cleanWaText(log.status)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        {status ? "Belum ada aktivitas pesan." : "Aktivitas belum tersedia."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* TAB 2: TEMPLATE RESPON / MANAJEMEN BALASAN */}
      {activeTab === "replies" && (
        <section className="wa-card">
          <div className="wa-table-header-action">
            <div>
              <p className="wa-eyebrow">HOTLINE BOT FAQ</p>
              <h2>Manajemen Template Balasan Otomatis</h2>
              <p className="wa-muted">
                Kelola kata kunci pemantik dan pesan balasan bot warga secara langsung tanpa restart daemon.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={openNewReplyModal}
            >
              Tambah Template Baru
            </button>
          </div>

          <div
            className="wa-table"
            tabIndex={0}
            role="region"
            aria-label="Tabel template balasan otomatis"
          >
            <table>
              <caption className="wa-sr">Daftar kata kunci dan template balasan bot</caption>
              <thead>
                <tr>
                  <th scope="col">Kata Kunci Trigger</th>
                  <th scope="col">Tipe Pencocokan</th>
                  <th scope="col">Cuplikan Pesan Balasan</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {replies.length > 0 ? (
                  replies.map((item) => {
                    const matchLabel =
                      item.match_type === "EXACT"
                        ? "Sama Persis"
                        : item.match_type === "REGEX"
                          ? "Pola Regex"
                          : "Mengandung Kata";
                    const matchClass =
                      item.match_type === "EXACT"
                        ? "wa-badge-match-exact"
                        : item.match_type === "REGEX"
                          ? "wa-badge-match-regex"
                          : "wa-badge-match-contains";

                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{cleanWaText(item.keyword)}</strong>
                        </td>
                        <td>
                          <span className={`wa-badge-match ${matchClass}`}>
                            {matchLabel}
                          </span>
                        </td>
                        <td>
                          <span className="wa-snippet" title={cleanWaText(item.reply_text)}>
                            {cleanWaText(item.reply_text)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`wa-btn-sm ${item.is_active ? "wa-badge-active" : "wa-badge-inactive"}`}
                            onClick={() => void toggleActive(item)}
                            disabled={busy}
                            title="Klik untuk mengubah status aktif"
                          >
                            {item.is_active ? "Aktif" : "Nonaktif"}
                          </button>
                        </td>
                        <td>
                          <div className="wa-actions-cell">
                            <button
                              type="button"
                              className="wa-btn-sm wa-btn-secondary"
                              onClick={() => openEditReplyModal(item)}
                              disabled={busy}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="wa-btn-sm wa-danger"
                              onClick={() => openDeleteConfirm(item)}
                              disabled={busy}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5}>
                      {repliesLoading
                        ? "Memuat daftar template..."
                        : "Belum ada template balasan otomatis tersimpan."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL TAMBAH / EDIT TEMPLATE BALASAN */}
      <dialog
        ref={replyDialog}
        className="wa-dialog"
        aria-labelledby="wa-reply-dialog-title"
      >
        <h2 id="wa-reply-dialog-title">
          {isNewReply ? "Tambah Template Balasan Baru" : "Edit Template Balasan"}
        </h2>
        <form onSubmit={saveReply}>
          <div className="wa-form-row">
            <label htmlFor="wa-input-keyword">Kata Kunci Pemantik (Keyword Trigger)</label>
            <input
              id="wa-input-keyword"
              type="text"
              value={formKeyword}
              onChange={(e) => setFormKeyword(cleanWaText(e.target.value))}
              placeholder="Contoh: syarat domisili, jam kerja, lokasi"
              maxLength={100}
              required
            />
            <small>Kata atau frasa yang diketik warga pada WhatsApp hotline.</small>
          </div>

          <div className="wa-form-row">
            <label htmlFor="wa-select-match-type">Tipe Pencocokan</label>
            <select
              id="wa-select-match-type"
              value={formMatchType}
              onChange={(e) => setFormMatchType(e.target.value as AutoReplyMatchType)}
            >
              <option value="CONTAINS">Mengandung Kata (CONTAINS) - Disarankan</option>
              <option value="EXACT">Sama Persis (EXACT)</option>
              <option value="REGEX">Pola Regex (REGEX) - Ahli</option>
            </select>
            <small>
              Mengandung Kata: cocok jika warga menyisipkan kata di dalam kalimat.
              Sama Persis: cocok jika pesan warga persis sama tanpa kata tambahan.
            </small>
          </div>

          <div className="wa-form-row">
            <label htmlFor="wa-textarea-reply">Isi Pesan Balasan Bot</label>
            <textarea
              id="wa-textarea-reply"
              value={formReplyText}
              onChange={(e) => setFormReplyText(cleanWaText(e.target.value))}
              placeholder="Tuliskan respon resmi kelurahan di sini..."
              maxLength={2000}
              rows={4}
              required
            />
            <small>
              Mendukung variabel dinamis: {"{nama}"} (nama pemohon), {"{nomor}"} (nomor WhatsApp), {"{tanggal}"} (tanggal hari ini), {"{jam}"} (waktu saat ini).
            </small>
          </div>

          <div className="wa-checkbox-label">
            <input
              type="checkbox"
              id="wa-check-active"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
            />
            <label htmlFor="wa-check-active" style={{ margin: 0 }}>
              Aktifkan balasan otomatis ini
            </label>
          </div>

          {/* Pratinjau Balon Pesan WhatsApp */}
          <div>
            <p className="wa-eyebrow" style={{ marginTop: 12 }}>PRATINJAU TAMPILAN BALON PESAN</p>
            <div className="wa-chat-preview-box">
              <div className="wa-chat-bubble">
                {formReplyText ? renderPreviewText(formReplyText) : "(Pratinjau pesan kosong)"}
                <span className="wa-bubble-time">
                  {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          <div className="wa-modal-actions">
            <button
              type="button"
              className="wa-btn-secondary"
              onClick={() => replyDialog.current?.close()}
            >
              Batal
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan Template"}
            </button>
          </div>
        </form>
      </dialog>

      {/* DIALOG KONFIRMASI HAPUS TEMPLATE */}
      <dialog
        ref={deleteDialog}
        className="wa-dialog"
        aria-labelledby="wa-delete-dialog-title"
      >
        <h2 id="wa-delete-dialog-title">Hapus Template Balasan?</h2>
        <p>
          Template untuk kata kunci &quot;{deletingReply?.keyword}&quot; akan dihapus secara permanen.
          Bot tidak akan lagi merespon kata kunci ini.
        </p>
        <div className="wa-actions">
          <button
            autoFocus
            type="button"
            onClick={() => deleteDialog.current?.close()}
          >
            Batal
          </button>
          <button
            className="wa-danger"
            type="button"
            disabled={busy}
            onClick={() => void executeDelete()}
          >
            {busy ? "Menghapus..." : "Ya, Hapus Template"}
          </button>
        </div>
      </dialog>

      {/* DIALOG PUTUS SESI */}
      <dialog ref={dialog} className="wa-dialog" aria-labelledby="wa-confirm-title">
        <h2 id="wa-confirm-title">Putus sesi WhatsApp?</h2>
        <p>
          Nomor lama tidak dapat mengirim atau menerima melalui gateway setelah sesi diputus.
          Scan QR baru untuk menghubungkan nomor pengganti.
        </p>
        <div className="wa-actions">
          <button autoFocus type="button" onClick={() => dialog.current?.close()}>
            Batal
          </button>
          <button
            className="wa-danger"
            type="button"
            onClick={() => void action("logout", { confirm: true })}
          >
            Ya, putus sesi
          </button>
        </div>
      </dialog>

      <footer className="wa-muted">SIKEPEL · Dashboard privat layanan WhatsApp · Versi {APP_VERSION}</footer>
    </main>
  );
}
