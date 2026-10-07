"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Inbox,
  FileText,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  ArrowLeft,
  Phone,
  ExternalLink,
  Eye,
  Pencil,
  RefreshCw,
  Search,
  User,
  MapPin,
  Calendar,
  FileCheck,
} from "lucide-react";
import { useApp } from "./workspace";
import {
  useData,
  useDebounce,
  api,
  send,
  Loading,
  Alert,
  Empty,
  PageHeader,
  Card,
  SearchBox,
  Pagination,
} from "./common";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { dateID, type Row } from "@/lib/types";

export type PermohonanStatus =
  | "PENDING_VERIFICATION"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";

export const PERMOHONAN_STATUS_LABELS: Record<PermohonanStatus, string> = {
  PENDING_VERIFICATION: "Menunggu Verifikasi",
  NEEDS_REVISION: "Perlu Perbaikan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  COMPLETED: "Selesai",
};

export function PermohonanStatusBadge({ status }: { status: string }) {
  const s = status as PermohonanStatus;
  const label = PERMOHONAN_STATUS_LABELS[s] || status;

  let pillClass = "pill-blue";
  let Icon = Clock;

  if (s === "APPROVED" || s === "COMPLETED") {
    pillClass = "pill-green";
    Icon = CheckCircle;
  } else if (s === "REJECTED") {
    pillClass = "pill-pink";
    Icon = XCircle;
  } else if (s === "NEEDS_REVISION") {
    pillClass = "pill-orange";
    Icon = AlertCircle;
  }

  return (
    <span className={`badge badge-${status} ${pillClass}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

export function PermohonanMandiri() {
  const path = usePathname();
  // Support both /app/permohonan-mandiri/:id and /admin/permohonan-mandiri/:id
  const parts = path.split("/").filter(Boolean);
  const isDetail =
    (parts[0] === "app" && parts[1] === "permohonan-mandiri" && parts[2]) ||
    (parts[0] === "admin" && parts[1] === "permohonan-mandiri" && parts[2]);
  const detailId = isDetail ? parts[2] : null;

  if (detailId) {
    return <PermohonanMandiriDetail id={detailId} />;
  }

  return <PermohonanMandiriList />;
}

export function PermohonanMandiriList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const query = useDebounce(q);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "10",
  });
  if (query) queryParams.set("q", query);
  if (status) queryParams.set("status", status);

  const { data, error, loading, reload } = useData<{
    items: Array<{
      id: string;
      ticket_code: string;
      nama_pemohon: string;
      nik: string;
      jenis_surat: string;
      status: string;
      created_at: string;
      contact_phone: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }>("permohonan-mandiri?" + queryParams.toString());

  const filterTabs: Array<{ key: string; label: string }> = [
    { key: "", label: "Semua" },
    { key: "PENDING_VERIFICATION", label: "Menunggu Verifikasi" },
    { key: "NEEDS_REVISION", label: "Perlu Perbaikan" },
    { key: "APPROVED", label: "Disetujui" },
    { key: "REJECTED", label: "Ditolak" },
  ];

  const resetFilter = () => {
    setQ("");
    setStatus("");
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Permohonan Mandiri"
        description="Daftar permohonan surat masuk dari portal mandiri warga. Verifikasi berkas, sesuaikan redaksi, dan proses persetujuan."
      />

      <Card>
        <div className="toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Cari nomor tiket, NIK, atau nama pemohon…"
          />
          <div className="tabs">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                className={status === tab.key ? "active" : ""}
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {(q || status) && (
            <Button variant="ghost" size="sm" onClick={resetFilter}>
              <RefreshCw size={14} />
              Reset Filter
            </Button>
          )}
        </div>

        {error ? (
          <Alert kind="error">{error}</Alert>
        ) : loading ? (
          <Loading />
        ) : data?.items && data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nomor Tiket</th>
                    <th>Nama Pemohon</th>
                    <th>NIK</th>
                    <th>Jenis Surat</th>
                    <th>Tanggal Masuk</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link
                          href={`/app/permohonan-mandiri/${item.id}`}
                          style={{
                            fontWeight: 600,
                            fontFamily: "monospace",
                            color: "#0875e8",
                          }}
                        >
                          {item.ticket_code}
                        </Link>
                      </td>
                      <td>
                        <strong>{item.nama_pemohon || "—"}</strong>
                        {item.contact_phone && (
                          <small>{item.contact_phone}</small>
                        )}
                      </td>
                      <td>
                        <span style={{ fontFamily: "monospace" }}>
                          {item.nik || "—"}
                        </span>
                      </td>
                      <td>{item.jenis_surat}</td>
                      <td>{dateID(item.created_at, true)}</td>
                      <td>
                        <PermohonanStatusBadge status={item.status} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/permohonan-mandiri/${item.id}`}>
                            <Eye size={14} />
                            Periksa
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.total}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty
            title="Tidak ada permohonan mandiri"
            description={
              q || status
                ? "Tidak ditemukan permohonan sesuai filter pencarian yang dipilih."
                : "Belum ada permohonan mandiri yang diajukan oleh warga."
            }
            action={
              q || status ? (
                <Button variant="outline" onClick={resetFilter}>
                  Reset Filter
                </Button>
              ) : (
                <Button variant="outline" onClick={reload}>
                  <RefreshCw size={14} />
                  Muat Ulang
                </Button>
              )
            }
          />
        )}
      </Card>
    </>
  );
}

export function PermohonanMandiriDetail({ id }: { id: string }) {
  const router = useRouter();
  const { notify, reloadCounter } = useApp();

  const { data, error, loading, reload } = useData<{
    id: string;
    ticket_code: string;
    status: PermohonanStatus;
    type_id: string;
    type_name: string;
    jenis_surat: string;
    village_id: string;
    contact_phone: string;
    created_at: string;
    updated_at: string;
    verified_at: string | null;
    verified_by_name: string | null;
    revision_note: string | null;
    letter_id: string | null;
    linked_letter: { id: string; number: string; status: string } | null;
    pemohon: {
      nik?: string;
      name?: string;
      birth_place?: string;
      birth_date?: string;
      gender?: string;
      religion?: string;
      occupation?: string;
      address?: string;
      rt?: string;
      rw?: string;
      nationality?: string;
    };
    form_data: Record<string, any>;
    attachments: Array<{
      id: string;
      media_type: string;
      size: number;
      url: string;
      stream_url: string;
    }>;
    audit_logs: Array<{
      id: string;
      actor: string;
      action: string;
      metadata: any;
      created_at: string;
    }>;
  }>("permohonan-mandiri/" + id);

  // Modals state
  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [modalRevisiOpen, setModalRevisiOpen] = useState(false);
  const [modalTolakOpen, setModalTolakOpen] = useState(false);
  const [modalSetujuiOpen, setModalSetujuiOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

  // Edit Redaksi Form State
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [editResident, setEditResident] = useState<Record<string, any>>({});
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Tindakan Cepat State
  const [catatanRevisi, setCatatanRevisi] = useState("");
  const [submittingRevisi, setSubmittingRevisi] = useState(false);
  const [revisiError, setRevisiError] = useState("");

  const [alasanTolak, setAlasanTolak] = useState("");
  const [submittingTolak, setSubmittingTolak] = useState(false);
  const [tolakError, setTolakError] = useState("");

  const [submittingSetujui, setSubmittingSetujui] = useState(false);
  const [setujuiError, setSetujuiError] = useState("");

  // Sync edit states on data load
  useEffect(() => {
    if (data) {
      setEditFields({ ...(data.form_data || {}) });
      setEditResident({ ...(data.pemohon || {}) });
    }
  }, [data]);

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: "20px auto" }}>
        <Alert kind="error">{error}</Alert>
        <div style={{ marginTop: 16 }}>
          <Button asChild variant="outline">
            <Link href="/app/permohonan-mandiri">
              <ArrowLeft size={16} />
              Kembali ke Daftar Permohonan
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return <Loading />;
  }

  const pemohon = data.pemohon || {};
  const formData = data.form_data || {};
  const attachments = data.attachments || [];
  const auditLogs = data.audit_logs || [];
  const status = data.status;

  const canAction =
    status === "PENDING_VERIFICATION" || status === "NEEDS_REVISION";
  const canEditRedaksi = status !== "REJECTED";

  // Phone formatting for WhatsApp link
  const rawPhone = data.contact_phone || "";
  let cleanPhone = rawPhone.replace(/[^0-9]/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "62" + cleanPhone.slice(1);
  }
  const waMessage = encodeURIComponent(
    `Halo ${pemohon.name || "Bapak/Ibu"}, kami dari Petugas Kelurahan terkait permohonan surat ${data.jenis_surat || data.type_name || ""} dengan nomor tiket ${data.ticket_code}.`,
  );
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMessage}` : "";

  // Handlers
  async function handleSaveEditRedaksi(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingEdit(true);
    setEditError("");
    try {
      await api("permohonan-mandiri/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: editFields,
          resident: editResident,
        }),
      });
      notify("Data dan redaksi permohonan berhasil disimpan.");
      setModalEditOpen(false);
      reload();
    } catch (err: any) {
      setEditError(err.message || "Gagal menyimpan perubahan redaksi.");
    } finally {
      setSubmittingEdit(false);
    }
  }

  async function handleMintaPerbaikan(e: React.FormEvent) {
    e.preventDefault();
    if (!catatanRevisi.trim()) {
      setRevisiError("Catatan kekurangan berkas wajib diisi.");
      return;
    }
    setSubmittingRevisi(true);
    setRevisiError("");
    try {
      await send("permohonan-mandiri/" + id + "/minta-perbaikan", {
        catatan_perbaikan: catatanRevisi.trim(),
        reason: catatanRevisi.trim(),
      });
      notify("Permintaan perbaikan berkas berhasil dikirim.");
      setModalRevisiOpen(false);
      setCatatanRevisi("");
      reload();
      if (reloadCounter) reloadCounter();
    } catch (err: any) {
      setRevisiError(err.message || "Gagal mengirim permintaan perbaikan.");
    } finally {
      setSubmittingRevisi(false);
    }
  }

  async function handleTolak(e: React.FormEvent) {
    e.preventDefault();
    if (!alasanTolak.trim()) {
      setTolakError("Alasan penolakan wajib diisi.");
      return;
    }
    setSubmittingTolak(true);
    setTolakError("");
    try {
      await send("permohonan-mandiri/" + id + "/tolak", {
        alasan_penolakan: alasanTolak.trim(),
        reason: alasanTolak.trim(),
      });
      notify("Permohonan berhasil ditolak.");
      setModalTolakOpen(false);
      setAlasanTolak("");
      reload();
      if (reloadCounter) reloadCounter();
    } catch (err: any) {
      setTolakError(err.message || "Gagal menolak permohonan.");
    } finally {
      setSubmittingTolak(false);
    }
  }

  async function handleSetujui() {
    setSubmittingSetujui(true);
    setSetujuiError("");
    try {
      const res = await send("permohonan-mandiri/" + id + "/setujui", {});
      notify("Permohonan berhasil disetujui dan draf surat dinas telah dibuat.");
      setModalSetujuiOpen(false);
      reload();
      if (reloadCounter) reloadCounter();
      if (res.letter_id) {
        router.push("/app/pelayanan/" + res.letter_id);
      }
    } catch (err: any) {
      setSetujuiError(err.message || "Gagal menyetujui permohonan.");
    } finally {
      setSubmittingSetujui(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/permohonan-mandiri">
            <ArrowLeft size={16} />
            Kembali ke Daftar Permohonan
          </Link>
        </Button>
      </div>

      <PageHeader
        title={data.jenis_surat || data.type_name}
        description={`Nomor Tiket: ${data.ticket_code} · Tanggal Masuk: ${dateID(data.created_at, true)}`}
        action={
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {canEditRedaksi && (
              <Button
                variant="outline"
                onClick={() => setModalEditOpen(true)}
              >
                <Pencil size={15} />
                Edit Data / Sesuaikan Redaksi
              </Button>
            )}
            {canAction && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setModalRevisiOpen(true)}
                >
                  <AlertCircle size={15} />
                  Minta Perbaikan
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setModalTolakOpen(true)}
                >
                  <XCircle size={15} />
                  Tolak
                </Button>
                <Button onClick={() => setModalSetujuiOpen(true)}>
                  <CheckCircle size={15} />
                  Setujui & Terbitkan / Buat Surat
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Status Notice Banner */}
      {status === "NEEDS_REVISION" && (
        <div style={{ marginBottom: 20 }}>
          <Alert kind="warning">
            <strong>Menunggu Perbaikan Pemohon:</strong>{" "}
            {data.revision_note || "Catatan perbaikan telah dikirim ke pemohon."}
          </Alert>
        </div>
      )}

      {status === "REJECTED" && (
        <div style={{ marginBottom: 20 }}>
          <Alert kind="error">
            <strong>Permohonan Ditolak:</strong>{" "}
            {data.revision_note || "Permohonan tidak memenuhi syarat kelurahan."}
          </Alert>
        </div>
      )}

      {status === "APPROVED" && (
        <div style={{ marginBottom: 20 }}>
          <Alert kind="info">
            <strong>Permohonan Telah Disetujui:</strong> Draf surat dinas telah
            dibuat.
            {data.letter_id && (
              <span style={{ marginLeft: 8 }}>
                <Link
                  href={`/app/pelayanan/${data.letter_id}`}
                  style={{ textDecoration: "underline", fontWeight: 600 }}
                >
                  Buka Draf Surat Dinas
                </Link>
              </span>
            )}
          </Alert>
        </div>
      )}

      {/* 3-Card Split Layout */}
      <div className="mandiri-detail-grid">
        {/* KARTU 1: Data Pemohon & Kontak WhatsApp */}
        <Card
          title="Data Pemohon & Kontak"
          description="Identitas pemohon yang diajukan dalam formulir."
          icon={<User size={18} />}
        >
          <div style={{ padding: "0 20px 20px" }}>
            <div className="mandiri-info-list">
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">NIK</span>
                <span
                  className="mandiri-info-value"
                  style={{ fontFamily: "monospace", fontWeight: 600 }}
                >
                  {pemohon.nik || "—"}
                </span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Nama Lengkap</span>
                <span className="mandiri-info-value" style={{ fontWeight: 600 }}>
                  {pemohon.name || "—"}
                </span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Tempat, Tanggal Lahir</span>
                <span className="mandiri-info-value">
                  {pemohon.birth_place || "—"}
                  {pemohon.birth_date
                    ? `, ${dateID(pemohon.birth_date, true)}`
                    : ""}
                </span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Jenis Kelamin</span>
                <span className="mandiri-info-value">
                  {pemohon.gender === "L" || pemohon.gender === "LAKI_LAKI"
                    ? "Laki-laki"
                    : pemohon.gender === "P" || pemohon.gender === "PEREMPUAN"
                      ? "Perempuan"
                      : pemohon.gender || "—"}
                </span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Agama</span>
                <span className="mandiri-info-value">{pemohon.religion || "—"}</span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Pekerjaan</span>
                <span className="mandiri-info-value">{pemohon.occupation || "—"}</span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Alamat</span>
                <span className="mandiri-info-value">
                  {pemohon.address || "—"}
                  {(pemohon.rt || pemohon.rw) && (
                    <small style={{ display: "block" }}>
                      RT {pemohon.rt || "-"} / RW {pemohon.rw || "-"}
                    </small>
                  )}
                </span>
              </div>
              <div className="mandiri-info-item">
                <span className="mandiri-info-label">Kewarganegaraan</span>
                <span className="mandiri-info-value">
                  {pemohon.nationality || "Indonesia"}
                </span>
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                background: "#f0fdf4",
                borderRadius: 8,
                border: "1px solid #bbf7d0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Phone size={16} style={{ color: "#16a34a" }} />
                  <strong style={{ fontSize: 13, color: "#166534" }}>
                    Kontak WhatsApp
                  </strong>
                </div>
                <span style={{ fontSize: 13, fontFamily: "monospace" }}>
                  {rawPhone || "—"}
                </span>
              </div>
              {cleanPhone ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  style={{
                    width: "100%",
                    background: "#ffffff",
                    borderColor: "#86efac",
                    color: "#15803d",
                  }}
                >
                  <a href={waUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} />
                    Hubungi via WhatsApp
                  </a>
                </Button>
              ) : (
                <small style={{ color: "#86efac" }}>
                  Nomor WhatsApp tidak disertakan pemohon.
                </small>
              )}
            </div>
          </div>
        </Card>

        {/* KARTU 2: Lampiran Berkas Warga */}
        <Card
          title="Lampiran Berkas Warga"
          description="Pratinjau berkas persyaratan yang diunggah pemohon."
          icon={<FileCheck size={18} />}
        >
          <div style={{ padding: "0 20px 20px" }}>
            {attachments.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "#f8fafc",
                  borderRadius: 8,
                  border: "1px dashed #cbd5e1",
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Tidak ada berkas lampiran yang diunggah warga.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {attachments.map((att, idx) => {
                  const isImage = att.media_type.startsWith("image/");
                  const isPdf = att.media_type === "application/pdf";
                  const sizeKb = Math.round(att.size / 1024);
                  const attUrl = `/api/permohonan-mandiri/${data.id}/lampiran/${att.id}`;

                  return (
                    <div
                      key={att.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: 12,
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          Lampiran {idx + 1}
                        </span>
                        <small className="muted">
                          {isImage ? "Gambar" : isPdf ? "PDF" : att.media_type} ·{" "}
                          {sizeKb} KB
                        </small>
                      </div>

                      {/* Direct In-Browser Preview */}
                      {isImage && (
                        <div
                          style={{
                            background: "#f8fafc",
                            borderRadius: 6,
                            overflow: "hidden",
                            border: "1px solid #f1f5f9",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                          onClick={() => setPreviewImageSrc(attUrl)}
                          title="Klik untuk memperbesar gambar"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={attUrl}
                            alt={`Lampiran ${idx + 1}`}
                            style={{
                              maxWidth: "100%",
                              maxHeight: 180,
                              objectFit: "contain",
                              display: "inline-block",
                            }}
                          />
                        </div>
                      )}

                      {isPdf && (
                        <div
                          style={{
                            background: "#f8fafc",
                            borderRadius: 6,
                            border: "1px solid #f1f5f9",
                            overflow: "hidden",
                          }}
                        >
                          <iframe
                            src={attUrl}
                            title={`Lampiran Dokumen PDF ${idx + 1}`}
                            style={{
                              width: "100%",
                              height: 180,
                              border: 0,
                            }}
                          />
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        {isImage && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPreviewImageSrc(attUrl)}
                          >
                            <Eye size={13} />
                            Perbesar
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={attUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={13} />
                            Buka di Tab Baru
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* KARTU 3: Formulir Surat (Isian Form Warga) */}
        <Card
          title="Formulir Surat"
          description="Isian data keperluan dan keterangan surat dari pemohon."
          icon={<FileText size={18} />}
          action={
            canEditRedaksi && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalEditOpen(true)}
              >
                <Pencil size={13} />
                Edit Redaksi
              </Button>
            )
          }
        >
          <div style={{ padding: "0 20px 20px" }}>
            {/* Highlighted Keperluan / Purpose Section */}
            {formData.keperluan !== undefined && (
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <strong style={{ fontSize: 13, color: "#1e40af" }}>
                    Keperluan Surat:
                  </strong>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#3b82f6",
                      fontWeight: 600,
                    }}
                  >
                    Dapat disesuaikan SOP
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#1e3a8a",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {formData.keperluan || "—"}
                </div>
              </div>
            )}

            {/* Other Form Data */}
            <div className="mandiri-info-list">
              {Object.entries(formData)
                .filter(([k]) => k !== "keperluan" && k !== "resident")
                .map(([key, val]) => (
                  <div className="mandiri-info-item" key={key}>
                    <span className="mandiri-info-label">
                      {key.replace(/_/g, " ").toUpperCase()}
                    </span>
                    <span className="mandiri-info-value">
                      {typeof val === "boolean"
                        ? val
                          ? "Ya"
                          : "Tidak"
                        : typeof val === "object"
                          ? JSON.stringify(val)
                          : String(val || "—")}
                    </span>
                  </div>
                ))}
            </div>

            {Object.keys(formData).length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Tidak ada isian formulir spesifik.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Riwayat & Jejak Audit */}
      <div style={{ marginTop: 24 }}>
        <Card
          title="Riwayat Verifikasi & Audit Log"
          description="Catatan riwayat tindakan operator dan perubahan status permohonan."
          icon={<Clock size={18} />}
        >
          <div style={{ padding: "0 20px 20px" }}>
            {auditLogs.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Belum ada jejak riwayat verifikasi tambahan.
              </div>
            ) : (
              <div className="table-wrap" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Petugas</th>
                      <th>Tindakan</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{dateID(log.created_at, true)}</td>
                        <td>{log.actor}</td>
                        <td>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 12,
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td>
                          {log.metadata?.reason && (
                            <div>
                              <strong>Alasan/Catatan:</strong>{" "}
                              {log.metadata.reason}
                            </div>
                          )}
                          {log.metadata?.changed_fields && (
                            <small className="muted">
                              Field diubah:{" "}
                              {Array.isArray(log.metadata.changed_fields)
                                ? log.metadata.changed_fields.join(", ")
                                : String(log.metadata.changed_fields)}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* MODAL 1: Edit Data & Redaksi SOP */}
      <Modal
        open={modalEditOpen}
        onOpenChange={setModalEditOpen}
        title="Sesuaikan Redaksi Formulir & Data SOP"
        description="Koreksi kalimat keperluan agar sesuai standar SOP kelurahan atau sesuaikan data isian permohonan."
        wide
      >
        <form onSubmit={handleSaveEditRedaksi} style={{ marginTop: 16 }}>
          {editError && (
            <div style={{ marginBottom: 16 }}>
              <Alert kind="error">{editError}</Alert>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Kalimat Keperluan (Sesuai SOP Kelurahan)
            </label>
            <textarea
              rows={3}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 14,
              }}
              value={editFields.keperluan || ""}
              onChange={(e) =>
                setEditFields({ ...editFields, keperluan: e.target.value })
              }
              placeholder="Contoh: Persyaratan pendaftaran sekolah"
            />
            <small
              className="muted"
              style={{ display: "block", marginTop: 4 }}
            >
              Ubah kalimat keperluan warga agar rapi dan baku saat dicetak pada
              surat dinas.
            </small>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Nama Pemohon
              </label>
              <input
                type="text"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
                value={editResident.name || ""}
                onChange={(e) =>
                  setEditResident({ ...editResident, name: e.target.value })
                }
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Pekerjaan
              </label>
              <input
                type="text"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
                value={editResident.occupation || ""}
                onChange={(e) =>
                  setEditResident({
                    ...editResident,
                    occupation: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Alamat Lengkap
            </label>
            <input
              type="text"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 14,
              }}
              value={editResident.address || ""}
              onChange={(e) =>
                setEditResident({ ...editResident, address: e.target.value })
              }
            />
          </div>

          {/* Sibling fields editing */}
          {Object.entries(editFields)
            .filter(([k]) => k !== "keperluan" && k !== "resident")
            .map(([k, v]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {k.replace(/_/g, " ").toUpperCase()}
                </label>
                <input
                  type="text"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 14,
                  }}
                  value={String(v || "")}
                  onChange={(e) =>
                    setEditFields({ ...editFields, [k]: e.target.value })
                  }
                />
              </div>
            ))}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 20,
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalEditOpen(false)}
              disabled={submittingEdit}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submittingEdit}>
              {submittingEdit ? "Menyimpan…" : "Simpan Perubahan Redaksi"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Minta Perbaikan Berkas */}
      <Modal
        open={modalRevisiOpen}
        onOpenChange={setModalRevisiOpen}
        title="Minta Perbaikan Berkas Permohonan"
        description="Tuliskan catatan kekurangan berkas atau koreksi data yang wajib diperbaiki oleh warga."
      >
        <form onSubmit={handleMintaPerbaikan} style={{ marginTop: 16 }}>
          {revisiError && (
            <div style={{ marginBottom: 16 }}>
              <Alert kind="error">{revisiError}</Alert>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Catatan Kekurangan / Instruksi Perbaikan
            </label>
            <textarea
              rows={4}
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 14,
              }}
              value={catatanRevisi}
              onChange={(e) => setCatatanRevisi(e.target.value)}
              placeholder="Contoh: Foto KTP buram, mohon unggah ulang foto KTP yang jelas dan terbaca..."
            />
            <small
              className="muted"
              style={{ display: "block", marginTop: 4 }}
            >
              Catatan ini akan dilihat oleh pemohon saat membuka nomor tiketnya.
            </small>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 20,
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalRevisiOpen(false)}
              disabled={submittingRevisi}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submittingRevisi}>
              {submittingRevisi ? "Mengirim…" : "Kirim Permintaan Perbaikan"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Tolak Permohonan */}
      <Modal
        open={modalTolakOpen}
        onOpenChange={setModalTolakOpen}
        title="Tolak Permohonan Surat"
        description="Berikan alasan resmi penolakan permohonan surat ini. Status permohonan akan menjadi Ditolak."
      >
        <form onSubmit={handleTolak} style={{ marginTop: 16 }}>
          {tolakError && (
            <div style={{ marginBottom: 16 }}>
              <Alert kind="error">{tolakError}</Alert>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Alasan Penolakan
            </label>
            <textarea
              rows={4}
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 14,
              }}
              value={alasanTolak}
              onChange={(e) => setAlasanTolak(e.target.value)}
              placeholder="Contoh: Berkas tidak sesuai ketentuan kelurahan atau pemohon bukan warga kelurahan ini..."
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 20,
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalTolakOpen(false)}
              disabled={submittingTolak}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={submittingTolak}
            >
              {submittingTolak ? "Memproses…" : "Tolak Permohonan"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Setujui & Buat Surat Dinas */}
      <Modal
        open={modalSetujuiOpen}
        onOpenChange={setModalSetujuiOpen}
        title="Konfirmasi Persetujuan & Pembuatan Surat Dinas"
        description="Permohonan warga akan disetujui dan secara otomatis dibuatkan draf surat dinas resmi kelurahan."
      >
        <div style={{ marginTop: 16 }}>
          {setujuiError && (
            <div style={{ marginBottom: 16 }}>
              <Alert kind="error">{setujuiError}</Alert>
            </div>
          )}

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Pemohon:
              </span>
              <div style={{ fontWeight: 600 }}>
                {pemohon.name} ({pemohon.nik})
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Jenis Surat:
              </span>
              <div style={{ fontWeight: 600 }}>
                {data.jenis_surat || data.type_name}
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: 12 }}>
                Keperluan (Redaksi yang Dipakai):
              </span>
              <div style={{ fontStyle: "italic", color: "#334155" }}>
                "{formData.keperluan || "—"}"
              </div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
            Pastikan berkas lampiran warga telah diperiksa dan redaksi kalimat
            keperluan telah sesuai standar operasional prosedur sebelum
            menyetujui.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 20,
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalSetujuiOpen(false)}
              disabled={submittingSetujui}
            >
              Batal
            </Button>
            <Button
              onClick={handleSetujui}
              disabled={submittingSetujui}
            >
              {submittingSetujui
                ? "Memproses…"
                : "Setujui & Buat Surat Dinas"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: Pratinjau Gambar Lampiran Penuh */}
      <Modal
        open={Boolean(previewImageSrc)}
        onOpenChange={(v) => !v && setPreviewImageSrc(null)}
        title="Pratinjau Berkas Lampiran"
        wide
      >
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          {previewImageSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewImageSrc}
              alt="Pratinjau Lampiran Penuh"
              style={{
                maxWidth: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                borderRadius: 8,
              }}
            />
          )}
          <div style={{ marginTop: 16 }}>
            <Button asChild variant="outline">
              <a
                href={previewImageSrc || "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                Buka Ukuran Asli di Tab Baru
              </a>
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
