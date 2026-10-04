"use client";
import { Fragment, useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Home,
  Users,
  Coins,
  House,
  Truck,
  Contact,
  Heart,
  FileText,
  ChevronRight,
  ArrowLeft,
  Plus,
  Eye,
  Save,
  RefreshCw,
  Check,
  Download,
  Printer,
  AlertTriangle,
  Clock,
  Send,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "./workspace";
import { spouseDefaults } from "@/lib/spouse-form";
import { RequirementChecklist, WhatsAppRequirements } from "./requirements";
import { requirementsComplete } from "@/lib/requirements";
import { n1StatusOptions } from "@/lib/n1";
import { PindahMembers } from "./pindah-members";
import {
  useData,
  useDebounce,
  send,
  PageHeader,
  Card,
  SearchBox,
  Pagination,
  Loading,
  Alert,
  Empty,
  Field,
  SubmitButton,
  Badge,
  APIError,
} from "./common";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { PDFViewer, type PDFHandle } from "./pdf-viewer";
import {
  ResidentPicker,
  ResidentForm,
  ResidentSummary,
  useUnsaved,
} from "./residents";
import { LetterTable } from "./dashboard";
import { dateID, dayID, type Row, type Field as FormField } from "@/lib/types";
const icons: Record<string, typeof Home> = {
  domisili: Home,
  "tidak-mampu": Users,
  penghasilan: Coins,
  "belum-memiliki-rumah": House,
  pindah: Truck,
  ktp: Contact,
  nikah: Heart,
};
const colors: Record<string, string> = {
  domisili: "blue",
  "tidak-mampu": "green",
  penghasilan: "orange",
  "belum-memiliki-rumah": "purple",
  pindah: "pink",
  ktp: "blue",
  nikah: "pink",
};
function Steps({ step }: { step: number }) {
  return (
    <div className="steps" aria-label={`Langkah ${step + 1} dari 4`}>
      {["Jenis Surat", "Penduduk", "Data Surat", "Pratinjau"].map((s, i) => (
        <div
          key={s}
          className={`step ${step === i ? "active" : step > i ? "done" : ""}`}
        >
          <span>{step > i ? <Check size={13} /> : i + 1}</span>
          {s}
        </div>
      ))}
    </div>
  );
}
export function Service() {
  const { types } = useApp(),
    router = useRouter(),
    path = usePathname(),
    sp = useSearchParams();
  const type = types.find((t) => t.id === sp.get("type"));
  const residentId = sp.get("resident");
  const letterId =
    sp.get("letter") ||
    (path.includes("/draft/") || path.includes("/pending/")
      ? path.split("/").pop()
      : null);
  const letter = useData(letterId ? "letters/" + letterId : null),
    resident = useData(residentId ? "residents/" + residentId : null);
  const [q, setQ] = useState(""),
    [category, setCategory] = useState("Semua");
  function go(step: string, more: Record<string, string> = {}) {
    const params = new URLSearchParams();
    if (type) params.set("type", type.id);
    if (residentId) params.set("resident", residentId);
    Object.entries(more).forEach(([k, v]) => params.set(k, v));
    router.push("/app/pelayanan/baru/" + step + "?" + params);
  }
  if (path.includes("/pending/") && letterId) return <Pending id={letterId} />;
  if (path.endsWith("/preview") && letterId) return <Preview id={letterId} />;
  if (path.includes("/draft/") && letterId) {
    if (letter.error) return <Alert kind="error">{letter.error}</Alert>;
    if (!letter.data) return <Loading />;
    if (!["DRAFT", "PREVIEW"].includes(letter.data.status))
      return (
        <Empty
          title="Surat sudah diproses"
          action={
            <Button asChild>
              <Link href={"/app/arsip/" + letterId}>Buka Surat</Link>
            </Button>
          }
        />
      );
    return (
      <LetterForm
        type={letter.data.type}
        resident={letter.data.resident}
        initial={letter.data}
      />
    );
  }
  if (path.endsWith("/penduduk/baru"))
    return (
      <>
        <PageHeader
          title="Tambah Penduduk"
          description="Simpan data penduduk dan lanjutkan pelayanan surat."
        />
        <Steps step={1} />
        <Card
          title="Identitas Penduduk"
          description="Lengkapi data sesuai dokumen penduduk."
        >
          <div className="card-body">
            <ResidentForm
              inFlow
              onSaved={(r) => go("form", { resident: r.id })}
              onCancel={() => go("penduduk")}
            />
          </div>
        </Card>
      </>
    );
  if (path.endsWith("/penduduk"))
    return (
      <>
        <PageHeader
          title="Pilih Penduduk"
          description={
            type?.name || "Pilih penduduk yang akan dibuatkan surat."
          }
          action={
            <Button variant="outline" onClick={() => go("jenis-surat")}>
              <ArrowLeft size={16} />
              Kembali
            </Button>
          }
        />
        <Steps step={1} />
        <ResidentPicker
          onPick={(r) => go("form", { resident: r.id })}
          onAdd={() => go("penduduk/baru")}
        />
      </>
    );
  if (path.endsWith("/form")) {
    if (resident.error) return <Alert kind="error">{resident.error}</Alert>;
    if (!type || !residentId)
      return (
        <Empty
          title="Pilih jenis surat dan penduduk terlebih dahulu"
          action={
            <Button asChild>
              <Link href="/app/pelayanan/baru/jenis-surat">
                Mulai Pelayanan
              </Link>
            </Button>
          }
        />
      );
    if (!resident.data) return <Loading />;
    return (
      <LetterForm
        key={type.id + residentId}
        type={type}
        resident={resident.data}
      />
    );
  }
  const filtered = types.filter(
    (t) =>
      t.active &&
      t.name.toLowerCase().includes(q.toLowerCase()) &&
      (category === "Semua" || t.category === category),
  );
  return (
    <>
      <PageHeader
        title="Pilih Jenis Surat"
        description="Pilih layanan surat yang akan diproses."
        eyebrow="Pelayanan Surat"
      />
      <Steps step={0} />
      <Card>
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Cari jenis surat…"
          />
          <div className="tabs">
            {["Semua", ...new Set(types.map((t) => t.category as string))].map(
              (c) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ),
            )}
          </div>
        </div>
      </Card>
      <div className="services-grid">
        {filtered.map((t) => {
          const Icon = icons[t.slug] || FileText,
            color = colors[t.slug] || "blue";
          return (
            <article className="card service-card" key={t.id}>
              <div className="service-card-top">
                <div className={`service-icon pill-${color}`}>
                  <Icon />
                </div>
                <div>
                  <span className={`pill pill-${color}`}>{t.category}</span>
                  <h2>{t.name}</h2>
                </div>
              </div>
              <p>{t.description}</p>
              <Button
                disabled={!t.template_id}
                onClick={() =>
                  go(residentId ? "form" : "penduduk", { type: t.id })
                }
              >
                <FileText size={16} />
                {t.template_id
                  ? "Buat Surat"
                  : "Belum Siap — Template belum aktif"}
                <ChevronRight size={18} />
              </Button>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty
          title="Jenis surat tidak ditemukan"
          description="Coba nama surat atau kategori lain."
        />
      )}
    </>
  );
}
function LetterForm({
  type,
  resident,
  initial,
}: {
  type: Row;
  resident: Row;
  initial?: Row;
}) {
  const { officials, notify, village } = useApp(),
    router = useRouter(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false),
    id = useRef(initial?.id);
  useUnsaved(dirty);
  const formRef = useRef<HTMLFormElement>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(initial?.form_data.requirement_checks || {});
  const [phone, setPhone] = useState(initial?.form_data.reporter_phone || "");
  const [statusN1, setStatusN1] = useState(String(initial?.form_data.status_n1 ?? ""));
  const partnerDefaults = type.slug === "suami-istri" ? spouseDefaults(resident, village) : {};
  const isPindah = type.slug === "pindah" && type.fields.some((f: FormField) => f.key === "no_klasifikasi_pindah");
  async function save(preview: boolean) {
    if (!formRef.current) return;
    setBusy(preview ? "preview" : "save");
    setError("");
    setErrors({});
    const entries = Object.fromEntries(new FormData(formRef.current)),
      official_id = entries.official_id;
    delete entries.official_id;
    try {
      const l = await send(
        "letters" + (id.current ? "/" + id.current : ""),
        {
          type_id: type.id,
          resident_id: resident.id,
          official_id,
          form_data: { ...entries, requirement_checks: checks, reporter_phone: phone, ...(isPindah ? { anggota_pindah: JSON.parse(String(entries.anggota_pindah || "[]")) } : {}) },
        },
        id.current ? "PATCH" : "POST",
      );
      id.current = l.id;
      setDirty(false);
      if (preview) {
        await send("letters/" + l.id + "/preview");
        router.push("/app/pelayanan/baru/preview?letter=" + l.id);
      } else {
        notify("Draft disimpan. Nomor resmi belum dialokasikan.");
        router.push("/app/pelayanan/draft/" + l.id);
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof APIError) setErrors(e.fields || {});
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        title="Buat Surat"
        description={initial?.draft_ticket ? `${type.name} | Tiket ${initial.draft_ticket} | Berlaku sampai ${new Date(initial.draft_expires_at).toLocaleString("id-ID")}` : type.name}
        eyebrow="Pelayanan Surat"
      />
      <Steps step={2} />
      <div className="stack">
        <ResidentSummary
          resident={resident}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={"/app/pelayanan/baru/penduduk?type=" + type.id}>
                <RefreshCw size={14} />
                Ganti Penduduk
              </Link>
            </Button>
          }
        />
        <Card
          title={
            type.name.startsWith("Formulir ")
              ? type.name
              : "Formulir " + type.name
          }
          description="Isikan informasi surat sesuai kebutuhan."
          icon={<FileText size={23} />}
        >
          <form
            ref={formRef}
            className="letter-form"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
            noValidate
          >
            {error && (
              <div style={{ marginBottom: 20 }}>
                <Alert kind="error">{error}</Alert>
              </div>
            )}
            <div className="form-grid">
              {(type.fields as FormField[]).map((f) => {
                if (type.slug === "nikah" && f.key === "istri_ke" && statusN1 !== "Beristri") return null;
                const value =
                  initial?.form_data[f.key] ??
                  (isPindah && f.key === "alamat_pindah" ? initial?.form_data.alamat_tujuan : undefined) ??
                  partnerDefaults[f.key] ??
                  (f.key === "alamat_domisili"
                    ? `${resident.address}, RT ${resident.rt} / RW ${resident.rw}`
                    : f.key === "berlaku_mulai"
                      ? dayID()
                      : "");
                return (
                  <Fragment key={f.key}>
                    {isPindah && ["alamat_pindah", "no_klasifikasi_pindah", "nomor_handphone"].includes(f.key) && (
                      <div className="full-width"><h3>{f.key === "alamat_pindah" ? "Alamat tujuan pindah" : f.key === "no_klasifikasi_pindah" ? "Keterangan kepindahan" : "Kontak pemohon"}</h3>
                        {f.key === "alamat_pindah" && <p className="muted">Alamat asal mengikuti data penduduk dan kelurahan. Formulir ini untuk perpindahan dalam negeri.</p>}
                      </div>
                    )}
                    {type.slug === "nikah" && ["negara_pemohon", "nama_bapak", "nama_ibu"].includes(f.key) && (
                      <div className="full-width">
                        <h3>{f.key === "nama_bapak" ? "Data ayah" : f.key === "nama_ibu" ? "Data ibu" : "Data pemohon N1"}</h3>
                      </div>
                    )}
                    {type.slug === "suami-istri" && ["nama_suami", "nama_istri", "tanggal_pernikahan"].includes(f.key) && (
                      <div className="full-width">
                        <h3>{f.key === "nama_suami" ? "Data suami" : f.key === "nama_istri" ? "Data istri" : "Keterangan pernikahan"}</h3>
                        {f.key === "nama_suami" && <p className="muted">Periksa data pemohon yang terisi otomatis dan lengkapi data pasangannya.</p>}
                      </div>
                    )}
                    {type.slug === "ktp" && f.key === "lampiran_kk" && (
                      <div className="full-width">
                        <h3>Persyaratan yang dilampirkan</h3>
                        <p className="muted">
                          Centang dokumen yang disertakan. Pilihan ini akan
                          tercetak pada F-1.02.
                        </p>
                      </div>
                    )}
                    <div
                      key={f.key}
                      className={f.type === "textarea" ? "full-width" : ""}
                    >
                      <Field
                        name={f.key}
                        label={f.label}
                        required={f.required || (type.slug === "nikah" && f.key === "istri_ke" && statusN1 === "Beristri")}
                        error={errors[f.key]}
                      >
                        {f.type === "checkbox" ? (
                          <input
                            type="checkbox"
                            id={f.key}
                            name={f.key}
                            value="Ya"
                            defaultChecked={value === "Ya"}
                            style={{
                              width: 20,
                              height: 20,
                              accentColor: "#087ff5",
                            }}
                          />
                        ) : f.type === "textarea" ? (
                          <textarea
                            id={f.key}
                            name={f.key}
                            defaultValue={value}
                            maxLength={2000}
                            placeholder={"Masukkan " + f.label.toLowerCase()}
                            aria-invalid={!!errors[f.key]}
                          />
                        ) : f.type === "select" ? (
                          <select id={f.key} name={f.key} defaultValue={value}
                            onChange={type.slug === "nikah" && f.key === "status_n1" ? (event) => setStatusN1(event.target.value) : undefined}>
                            <option value="">
                              Pilih {f.label.toLowerCase()}
                            </option>
                            {(type.slug === "nikah" && f.key === "status_n1" ? n1StatusOptions(resident.gender) : f.options)?.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.type}
                            id={f.key}
                            name={f.key}
                            defaultValue={value}
                            min={f.type === "number" ? 0 : undefined}
                            aria-invalid={!!errors[f.key]}
                          />
                        )}
                      </Field>
                    </div>
                  </Fragment>
                );
              })}
              {isPindah && <PindahMembers initial={initial?.form_data.anggota_pindah} resident={{ nik: resident.nik, name: resident.name }} errors={errors} onChange={() => setDirty(true)} />}
              <div className="full-width">
                <Field
                  label={
                    type.slug === "ktp" || isPindah
                      ? "Pejabat penanggung jawab (arsip)"
                      : "Penandatangan"
                  }
                  name="official_id"
                  required
                  error={errors.official_id}
                  hint="Pejabat aktif pada tanggal penerbitan."
                >
                  <select
                    id="official_id"
                    name="official_id"
                    defaultValue={
                      initial?.official_id ||
                      officials.find((o) => o.active)?.id ||
                      ""
                    }
                  >
                    <option value="">Pilih penandatangan</option>
                    {officials
                      .filter((o) => o.active)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} — {o.title}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
            </div>
            <section className="stack section-gap" aria-label="Catatan Petugas">
              <h2>Catatan Petugas</h2>
              <RequirementChecklist requirements={type.requirements} checks={checks} onChange={next => { setChecks(next); setDirty(true); }} />
              <Field name="reporter_phone" label="Nomor WhatsApp pelapor" hint="Opsional untuk penerbitan; wajib valid hanya saat membuka pesan WhatsApp."><input id="reporter_phone" type="tel" value={phone} onChange={e=>{setPhone(e.target.value);setDirty(true);}} /></Field>
              <WhatsAppRequirements phone={phone} name={resident.name} type={initial?.draft_ticket ? `${type.name} (tiket ${initial.draft_ticket})` : type.name} requirements={type.requirements || []} checks={checks} />
            </section>
            <div className="form-actions">
              <Button asChild variant="outline">
                <Link href="/app/pelayanan/baru/jenis-surat">Batal</Link>
              </Button>
              <SubmitButton
                busy={busy === "save"}
                disabled={!!busy}
                type="button"
                variant="outline"
                onClick={() => save(false)}
              >
                <Save size={17} />
                Simpan Draft
              </SubmitButton>
              <SubmitButton
                busy={busy === "preview"}
                disabled={!!busy}
                type="submit"
              >
                <Eye size={17} />
                {busy === "preview" ? "Membuat Pratinjau…" : "Preview Surat"}
              </SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
function Preview({ id }: { id: string }) {
  const { data, error } = useData("letters/" + id),
    { village } = useApp(),
    router = useRouter(),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [issueError, setIssueError] = useState("");
  async function issue() {
    setBusy(true);
    try {
      await send("letters/" + id + "/issue");
      router.push("/app/pelayanan/pending/" + id);
    } catch (e) {
      setIssueError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Loading />;
  if (data.status !== "PREVIEW")
    return (
      <Empty
        title="Pratinjau perlu diperbarui"
        action={
          <Button asChild>
            <Link href={"/app/pelayanan/draft/" + id}>Kembali ke Form</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <PageHeader
        title="Preview Surat"
        description={`Tiket ${data.draft_ticket} | ${data.draft_type_name} | Berlaku sampai ${new Date(data.draft_expires_at).toLocaleString("id-ID")}. Nomor resmi belum dialokasikan.`}
        action={
          <Button asChild variant="outline">
            <Link href={"/app/pelayanan/draft/" + id}>
              <ArrowLeft size={16} />
              Kembali & Perbaiki
            </Link>
          </Button>
        }
      />
      <Steps step={3} />
      <div className="requirements-preview">
        <div className="stack">
          <Alert kind="warning">
            Pratinjau — Belum Terbit. Nomor resmi belum dialokasikan.
          </Alert>
          <Card title="Ringkasan Surat">
            <div className="card-body">
              <dl className="summary-list vertical">
                <div>
                  <dt>Jenis surat</dt>
                  <dd>{data.type.name}</dd>
                </div>
                <div>
                  <dt>Nama penduduk</dt>
                  <dd>{data.resident.name}</dd>
                </div>
                <div>
                  <dt>NIK</dt>
                  <dd className="mono">{data.resident.nik}</dd>
                </div>
                <div>
                  <dt>Kelurahan</dt>
                  <dd>{village?.name}</dd>
                </div>
                <div>
                  <dt>Tanggal</dt>
                  <dd>{dateID(new Date(), true)}</dd>
                </div>
              </dl>
              <RequirementChecklist requirements={data.type.requirements} checks={data.form_data.requirement_checks} />
              <WhatsAppRequirements phone={data.form_data.reporter_phone || ""} name={data.resident.name} type={`${data.type.name} (tiket ${data.draft_ticket})`} requirements={data.type.requirements || []} checks={data.form_data.requirement_checks || {}} />
              {JSON.stringify(data.snapshot?.requirements || []) !== JSON.stringify(data.type.requirements || []) && <Alert kind="warning">Persyaratan berubah. Kembali ke form dan buat pratinjau baru.</Alert>}
              <Button
                disabled={!requirementsComplete(data.type.requirements, data.form_data.requirement_checks) || JSON.stringify(data.snapshot?.requirements || []) !== JSON.stringify(data.type.requirements || [])}
                className="section-gap"
                style={{ width: "100%" }}
                onClick={() => setConfirm(true)}
              >
                <Send size={17} />
                Terbitkan Surat
              </Button>
              <a
                className="text-button"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: 12,
                  fontSize: 12,
                }}
                href={"/api/letters/" + id + "/pdf?preview=1&download=1"}
              >
                Unduh Pratinjau PDF
              </a>
            </div>
          </Card>
          <Alert>
            Setelah terbit, isi surat disimpan sebagai arsip dan tidak dapat
            diubah.
          </Alert>
        </div>
        <Card>
          <div className="pdf-toolbar"><FileText size={17} />{data.type.name}<span className="spacer" /><Badge status="PREVIEW" /></div>
          <PDFViewer title="Pratinjau PDF surat" src={"/api/letters/" + id + "/pdf?preview=1"} />
        </Card>
      </div>
      <Modal
        open={confirm}
        onOpenChange={(v) => !busy && setConfirm(v)}
        title="Terbitkan Surat?"
        description="Nomor resmi akan dialokasikan setelah konfirmasi."
      >
        <div className="stack">
          <Alert kind="warning">
            Pastikan data penduduk dan isi surat sudah sesuai.
          </Alert>
          <dl className="summary-list">
            <div>
              <dt>Jenis surat</dt>
              <dd>{data.type.name}</dd>
            </div>
            <div>
              <dt>Nama penduduk</dt>
              <dd>{data.resident.name}</dd>
            </div>
            <div>
              <dt>Kelurahan</dt>
              <dd>{village?.name}</dd>
            </div>
            <div>
              <dt>Penandatangan</dt>
              <dd>{data.snapshot?.official?.name}</dd>
            </div>
          </dl>
          {issueError && <Alert kind="error">{issueError}</Alert>}
        </div>
        <div className="form-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Kembali
          </Button>
          <SubmitButton busy={busy} onClick={issue}>
            <Send size={16} />
            Terbitkan Surat
          </SubmitButton>
        </div>
      </Modal>
    </>
  );
}
function Pending({ id }: { id: string }) {
  const { data, error, reload } = useData("letters/" + id),
    router = useRouter(),
    [busy, setBusy] = useState(true),
    [problem, setProblem] = useState(""),
    started = useRef(false);
  async function generate() {
    setBusy(true);
    setProblem("");
    try {
      const r = await send("letters/" + id + "/generate");
      if (r.status === "ISSUED") {
        router.replace("/app/arsip/" + id + "?success=1");
        return;
      }
      if (r.busy) {
        reload();
        return;
      }
      setProblem(
        r.error || "PDF belum berhasil dibuat. Nomor surat tetap tersimpan.",
      );
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate(); /* Generation is guarded by a database lease. */
  }, [id]);
  useEffect(() => {
    if (data?.status === "ISSUED")
      router.replace("/app/arsip/" + id + "?success=1");
    if (data?.generation_token) {
      const t = setTimeout(reload, 3000);
      return () => clearTimeout(t);
    }
  }, [data, reload, router, id]);
  if (error) return <Alert kind="error">{error}</Alert>;
  return (
    <>
      <PageHeader
        title="Penerbitan Surat"
        description="Finalisasi dokumen dan penyimpanan arsip."
      />
      <Card>
        <div
          className="empty"
          style={{ maxWidth: 650, margin: "auto", padding: "55px 30px" }}
        >
          <div className={`empty-icon ${busy ? "spin" : ""}`}>
            {busy ? <RefreshCw size={28} /> : <AlertTriangle size={28} />}
          </div>
          <Badge status="ISSUE_PENDING" />
          <h1 style={{ margin: "16px 0", fontSize: 24 }}>
            {busy ? "Sedang membuat PDF final…" : "PDF belum berhasil dibuat"}
          </h1>
          <p>{data?.snapshot?.type.name}</p>
          <h2 style={{ margin: "15px 0 24px", color: "#0876d6" }}>
            {data?.number || "Memuat nomor surat…"}
          </h2>
          <Alert kind={problem ? "warning" : "info"}>
            {problem ||
              "Jangan ulangi penerbitan. Nomor surat sudah tersimpan."}
          </Alert>
          <small style={{ display: "block", marginTop: 10 }}>
            Referensi: {id.slice(0, 8)} · {dateID(data?.updated_at)}
          </small>
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: 25 }}
          >
            {!busy && (
              <Button onClick={generate}>
                <RefreshCw size={17} />
                Coba Lagi
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/app/arsip">Kembali ke Arsip</Link>
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
export function Archive() {
  const path = usePathname(),
    sp = useSearchParams(),
    id = path.split("/")[3];
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(sp.get("status") || ""),
    [type, setType] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    { types } = useApp(),
    query = useDebounce(q);
  const params = new URLSearchParams({
    q: query,
    status,
    type,
    from,
    to,
    page: String(page),
  });
  const { data, error, loading } = useData(!id ? "letters?" + params : null);
  if (id)
    return (
      <ArchiveDetail key={id} id={id} success={sp.get("success") === "1"} />
    );
  const reset = () => {
    setQ("");
    setStatus("");
    setType("");
    setFrom("");
    setTo("");
    setPage(1);
  };
  return (
    <>
      <PageHeader
        title="Arsip Surat"
        description="Cari, lihat, dan cetak ulang surat yang tersimpan."
      />
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Cari nomor surat, NIK, atau nama…"
          />
          <select
            aria-label="Jenis surat"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua jenis surat</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Status surat"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="PREVIEW">Pratinjau</option>
            <option value="ISSUE_PENDING">Diproses</option>
            <option value="ISSUED">Terbit</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          <input
            type="date"
            aria-label="Dari tanggal"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <span className="muted">–</span>
          <input
            type="date"
            aria-label="Sampai tanggal"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          <Button variant="ghost" onClick={reset}>
            <RefreshCw size={15} />
            Reset
          </Button>
        </div>
        {error ? (
          <Alert kind="error">{error}</Alert>
        ) : loading ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <LetterTable items={data.items} />
            <Pagination page={page} total={data.total} onChange={setPage} />
          </>
        ) : (
          <Empty
            title="Tidak ada surat pada filter ini"
            description="Coba kata kunci atau rentang tanggal lainnya."
            action={
              <Button variant="outline" onClick={reset}>
                Reset Filter
              </Button>
            }
          />
        )}
      </Card>
    </>
  );
}
function ArchiveDetail({ id, success }: { id: string; success: boolean }) {
  const { data, error, reload } = useData("letters/" + id),
    { user, notify } = useApp(),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [cancelError, setCancelError] = useState(""),
    frame = useRef<PDFHandle>(null);
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Loading />;
  const l = data,
    s = l.snapshot,
    canWrite = user.role !== "PIMPINAN",
    canCancel = ["ADMIN", "SUPER_ADMIN"].includes(user.role);
  const actions = (
    <>
      <Button asChild variant="outline">
        <a href={"/api/letters/" + id + "/pdf?download=1"}>
          <Download size={16} />
          Download PDF
        </a>
      </Button>
      {l.has_companion_pdf && (
        <Button asChild variant="outline">
          <a href={"/api/letters/" + id + "/pdf?companion=1&download=1"}>
            <Download size={16} />
            Pernyataan Belum Menikah
          </a>
        </Button>
      )}
      <Button
        onClick={() => {
          void frame.current?.print();
        }}
      >
        <Printer size={16} />
        Print
      </Button>
    </>
  );
  async function doCancel() {
    setBusy(true);
    setCancelError("");
    try {
      await send("letters/" + id + "/cancel", { reason });
      setCancel(false);
      notify("Surat dibatalkan. Nomor tetap tercatat.");
      reload();
    } catch (e) {
      setCancelError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={
          success && l.status === "ISSUED"
            ? "Surat Berhasil Diterbitkan"
            : "Detail Arsip Surat"
        }
        description={l.number || `Tiket ${l.draft_ticket} | ${l.draft_type_name} | Berlaku sampai ${new Date(l.draft_expires_at).toLocaleString("id-ID")}. Nomor resmi belum dialokasikan.`}
        action={
          l.has_pdf ? (
            actions
          ) : (
            <Button asChild variant="outline">
              <Link href="/app/arsip">
                <ArrowLeft size={16} />
                Kembali
              </Link>
            </Button>
          )
        }
      />
      {l.status === "ISSUE_PENDING" ? (
        <Card>
          <Empty
            title="PDF sedang menunggu finalisasi"
            description={
              l.error ||
              "Nomor surat sudah tersimpan. Lanjutkan proses untuk membuat PDF."
            }
            action={
              canWrite ? (
                <Button asChild>
                  <Link href={"/app/pelayanan/pending/" + id}>
                    <RefreshCw size={17} />
                    Lanjutkan / Coba Lagi
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : ["DRAFT", "PREVIEW"].includes(l.status) ? (
        <Card title={l.type.name}>
          <div className="card-body">
            <dl className="summary-list">
              <div>
                <dt>Penduduk</dt>
                <dd>{l.resident.name}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge status={l.status} />
                </dd>
              </div>
            </dl>
            {canWrite && (
              <Button asChild className="section-gap">
                <Link href={"/app/pelayanan/draft/" + id}>
                  <FileText size={17} />
                  Lanjutkan Draft
                </Link>
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="stack">
          {success && l.status === "ISSUED" && (
            <Card>
              <div className="success-card">
                <div>
                  <span className="pill pill-green">
                    <Check
                      size={13}
                      style={{ display: "inline", marginRight: 4 }}
                    />
                    Surat berhasil diarsipkan
                  </span>
                  <h1>Pelayanan selesai.</h1>
                  <p>
                    {s.type.name} untuk <strong>{s.resident.name}</strong> sudah
                    siap diunduh dan dicetak.
                  </p>
                  <div className="success-number">{l.number}</div>
                  <div className="success-actions">
                    <Button asChild>
                      <Link
                        href={"/api/letters/" + id + "/pdf"}
                        target="_blank"
                      >
                        <Eye size={16} />
                        Buka PDF
                      </Link>
                    </Button>
                    {l.has_companion_pdf && (
                      <Button asChild variant="outline">
                        <Link href={"/api/letters/" + id + "/pdf?companion=1"} target="_blank">
                          <Eye size={16} />
                          Buka Pernyataan
                        </Link>
                      </Button>
                    )}
                    {canWrite && (
                      <Button asChild variant="outline">
                        <Link href="/app/pelayanan/baru/jenis-surat">
                          <Plus size={16} />
                          Buat Pelayanan Baru
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
                <Image
                  className="success-image"
                  src="/assets/success.webp"
                  width={300}
                  height={230}
                  alt="Dokumen surat siap diunduh"
                />
              </div>
            </Card>
          )}
          {l.status === "CANCELLED" && (
            <Alert kind="error">
              Surat dibatalkan: {l.cancel_reason}. Nomor dan dokumen historis
              tetap tersimpan.
            </Alert>
          )}
          <div className="two-column">
            <Card>
              <div className="pdf-toolbar">
                <FileText size={17} />
                {s.type.name}
                <span className="spacer" />
                <Badge status={l.status} />
              </div>
              <PDFViewer
                ref={frame}
                title="PDF surat terbit"
                src={"/api/letters/" + id + "/pdf"}
              />
            </Card>
            <div className="stack">
              <Card title="Informasi Surat" icon={<FileText size={21} />}>
                <div className="card-body">
                  <dl className="summary-list vertical">
                    {[
                      ["Nomor surat", l.number],
                      ["Tanggal terbit", dateID(l.issued_at, true)],
                      ["Jenis surat", s.type.name],
                      ["Kelurahan", s.village.name],
                      ["Penandatangan", s.official.name],
                      ["Jabatan", s.official.title],
                      ["Versi template", "Versi " + s.template.version],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {canCancel && l.status === "ISSUED" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="section-gap"
                      onClick={() => setCancel(true)}
                    >
                      Batalkan Surat
                    </Button>
                  )}
                </div>
              </Card>
              <Card
                title="Data Penduduk Saat Terbit"
                description="Disimpan sesuai kondisi saat penerbitan"
                icon={<ShieldCheck size={20} />}
              >
                <div className="card-body">
                  <dl className="summary-list vertical">
                    {[
                      ["Nama", s.resident.name],
                      ["NIK", s.resident.nik],
                      ["Pekerjaan", s.resident.occupation],
                      ["Alamat", s.resident.address],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Card>
              <Card title="Riwayat Aktivitas" icon={<Clock size={20} />}>
                <div className="timeline">
                  {l.timeline.slice(0, 6).map((a: Row) => (
                    <div className="timeline-item" key={a.id}>
                      <b>{a.action.replaceAll("_", " ")}</b>
                      <small>
                        {a.actor} · {dateID(a.created_at)}
                      </small>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
      <div className="section-gap">
        <Button asChild variant="ghost">
          <Link href="/app/arsip">
            <FolderOpen size={16} />
            Kembali ke Arsip
          </Link>
        </Button>
      </div>
      <Modal
        open={cancel}
        onOpenChange={(v) => !busy && setCancel(v)}
        title="Batalkan Surat?"
        description="Surat dan nomornya tetap tercatat dalam arsip. Nomor tidak digunakan ulang."
      >
        <div className="stack">
          <Alert kind="warning">{l.number}</Alert>
          <Field name="cancel_reason" label="Alasan pembatalan" required>
            <textarea
              id="cancel_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="Jelaskan alasan pembatalan surat"
            />
          </Field>
          {cancelError && <Alert kind="error">{cancelError}</Alert>}
        </div>
        <div className="form-actions">
          <Button variant="outline" onClick={() => setCancel(false)}>
            Kembali
          </Button>
          <SubmitButton busy={busy} variant="destructive" onClick={doCancel}>
            Konfirmasi Batalkan
          </SubmitButton>
        </div>
      </Modal>
    </>
  );
}
