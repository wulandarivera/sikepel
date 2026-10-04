"use client";
import { useState } from "react";
import {
  Plus,
  Pencil,
  Building2,
  Users,
  UserRound,
  FileText,
  Upload,
  Download,
  Check,
  ShieldCheck,
  History,
  ArrowUp,
  ArrowDown,
  Trash2,
  Settings,
  Save,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "./workspace";
import {
  useData,
  useDebounce,
  api,
  send,
  APIError,
  PageHeader,
  Card,
  SearchBox,
  Pagination,
  Loading,
  Alert,
  Empty,
  Field,
  SubmitButton,
} from "./common";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { TemplateEditorModal } from "./template-editor-modal";
import {
  roleLabels,
  dateID,
  type Row,
  type Role,
  type Field as DynamicField,
} from "@/lib/types";
type InputDef = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
const configs: Record<
  string,
  {
    endpoint: string;
    title: string;
    singular: string;
    description: string;
    icon: typeof Users;
    fields: InputDef[];
  }
> = {
  kelurahan: {
    endpoint: "villages",
    title: "Kelurahan",
    singular: "Kelurahan",
    description: "Kelola identitas dan profil kelurahan untuk kop surat.",
    icon: Building2,
    fields: [
      { key: "name", label: "Nama kelurahan", required: true },
      { key: "code", label: "Kode kelurahan", required: true },
      { key: "district", label: "Kecamatan", required: true },
      { key: "city", label: "Kabupaten / kota", required: true },
      { key: "province", label: "Provinsi", required: true },
      {
        key: "address",
        label: "Alamat kantor",
        type: "textarea",
        required: true,
      },
      { key: "phone", label: "Nomor telepon" },
      { key: "email", label: "Email", type: "email" },
      { key: "postal_code", label: "Kode pos", required: true },
    ],
  },
  pejabat: {
    endpoint: "officials",
    title: "Pejabat",
    singular: "Pejabat",
    description: "Kelola pejabat penandatangan dan periode jabatan.",
    icon: UserRound,
    fields: [
      { key: "name", label: "Nama lengkap", required: true },
      { key: "nip", label: "NIP", required: true },
      { key: "title", label: "Jabatan", required: true },
      {
        key: "start_date",
        label: "Tanggal mulai",
        type: "date",
        required: true,
      },
      { key: "end_date", label: "Tanggal selesai (opsional)", type: "date" },
    ],
  },
  pengguna: {
    endpoint: "users",
    title: "Pengguna",
    singular: "Pengguna",
    description: "Kelola akun, hak akses, dan status pengguna.",
    icon: Users,
    fields: [
      { key: "name", label: "Nama lengkap", required: true },
      { key: "username", label: "Username", required: true },
      { key: "password", label: "Kata sandi", type: "password" },
    ],
  },
  "jenis-surat": {
    endpoint: "types",
    title: "Jenis Surat",
    singular: "Jenis Surat",
    description: "Kelola katalog layanan dan konfigurasi formulir surat.",
    icon: FileText,
    fields: [
      { key: "name", label: "Nama jenis surat", required: true },
      { key: "code", label: "Kode klasifikasi surat", required: true },
      {
        key: "slug",
        label: "Kode layanan (huruf kecil dan tanda hubung)",
        required: true,
      },
      {
        key: "category",
        label: "Kategori",
        type: "select",
        options: ["Kependudukan", "Sosial", "Usaha", "Lainnya"],
        required: true,
      },
      { key: "description", label: "Deskripsi singkat", type: "textarea" },
    ],
  },
};
export function AdminPage({ kind }: { kind: string }) {
  const cfg = configs[kind],
    { user, notify, reload: reloadApp } = useApp(),
    { data, error, reload } = useData(cfg.endpoint),
    [q, setQ] = useState(""),
    [edit, setEdit] = useState<Row | null | undefined>(undefined);
  const canAdd = kind !== "kelurahan" || user.role === "SUPER_ADMIN";
  const rows =
    data?.items.filter((r: Row) =>
      (r.name + " " + (r.username || r.nip || r.code || ""))
        .toLowerCase()
        .includes(q.toLowerCase()),
    ) || [];
  return (
    <>
      <PageHeader
        title={
          kind === "kelurahan" && user.role === "ADMIN"
            ? "Profil Kelurahan"
            : cfg.title
        }
        description={cfg.description}
        action={
          canAdd && (
            <Button onClick={() => setEdit(null)}>
              <Plus size={17} />
              Tambah {cfg.singular}
            </Button>
          )
        }
      />
      {["kelurahan", "pejabat"].includes(kind) && (
        <div style={{ marginBottom: 20 }}>
          <Alert>
            Perubahan {kind === "pejabat" ? "pejabat" : "profil kelurahan"}{" "}
            hanya memengaruhi surat baru. Surat yang sudah terbit tetap
            menggunakan data saat penerbitan.
          </Alert>
        </div>
      )}
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={`Cari ${cfg.singular.toLowerCase()}…`}
          />
          <span className="spacer" />
          <span className="muted">{rows.length} data</span>
        </div>
        {error ? (
          <Alert kind="error">{error}</Alert>
        ) : !data ? (
          <Loading />
        ) : rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    {kind === "pengguna"
                      ? "Nama Pengguna"
                      : kind === "pejabat"
                        ? "Nama Pejabat"
                        : cfg.singular}
                  </th>
                  <th>
                    {kind === "pengguna"
                      ? "Username"
                      : kind === "pejabat"
                        ? "NIP"
                        : "Kode"}
                  </th>
                  <th>
                    {kind === "pengguna"
                      ? "Peran"
                      : kind === "pejabat"
                        ? "Jabatan"
                        : kind === "kelurahan"
                          ? "Kecamatan"
                          : "Kategori"}
                  </th>
                  {kind === "pejabat" && <th>Periode</th>}
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: Row) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {kind === "kelurahan" && <small>{r.address}</small>}
                    </td>
                    <td className="mono">{r.username || r.nip || r.code}</td>
                    <td>
                      {kind === "pengguna"
                        ? roleLabels[r.role as Role]
                        : r.title || r.district || r.category}
                    </td>
                    {kind === "pejabat" && (
                      <td>
                        {dateID(r.start_date)} —{" "}
                        {r.end_date ? dateID(r.end_date) : "Sekarang"}
                      </td>
                    )}
                    <td>
                      <span
                        className={`pill ${r.active ? "pill-green" : "pill-orange"}`}
                      >
                        {r.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEdit(r)}
                      >
                        <Pencil size={13} />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={`${cfg.singular} tidak ditemukan`}
            action={
              canAdd ? (
                <Button onClick={() => setEdit(null)}>
                  Tambah {cfg.singular}
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>
      <Modal
        open={edit !== undefined}
        onOpenChange={(v) => !v && setEdit(undefined)}
        title={(edit ? "Edit " : "Tambah ") + cfg.singular}
        description={cfg.description}
        wide
      >
        {edit !== undefined && (
          <AdminForm
            key={edit?.id || "new"}
            kind={kind}
            initial={edit}
            onCancel={() => setEdit(undefined)}
            onSaved={() => {
              setEdit(undefined);
              reload();
              reloadApp();
              notify(`${cfg.singular} berhasil disimpan.`);
            }}
          />
        )}
      </Modal>
    </>
  );
}
function AdminForm({
  kind,
  initial,
  onSaved,
  onCancel,
}: {
  kind: string;
  initial: Row | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const cfg = configs[kind],
    { user, villages } = useApp(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [formFields, setFormFields] = useState<DynamicField[]>(
      initial?.fields || [
        {
          key: "keperluan",
          label: "Keperluan surat",
          type: "textarea",
          required: true,
        },
      ],
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setErrors({});
    const f = new FormData(e.currentTarget);
    const input: any = Object.fromEntries(f);
    input.active = f.get("active") === "on";
    if (kind === "jenis-surat") input.fields = formFields;
    if (kind === "pengguna" && !input.password) delete input.password;
    if (
      initial &&
      ((!input.active && initial.active) ||
        (kind === "pengguna" && input.role !== initial.role)) &&
      !confirm(
        "Perubahan ini memengaruhi akses atau status data. Simpan perubahan?",
      )
    )
      return;
    setBusy(true);
    try {
      await send(
        cfg.endpoint + (initial ? "/" + initial.id : ""),
        input,
        initial ? "PATCH" : "POST",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof APIError) setErrors(e.fields || {});
    } finally {
      setBusy(false);
    }
  }
  function changeField(index: number, key: string, value: any) {
    setFormFields((fields) =>
      fields.map((f, i) => (i === index ? { ...f, [key]: value } : f)),
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="stack">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="form-grid">
          {cfg.fields.map((f) => (
            <div
              key={f.key}
              className={f.type === "textarea" ? "full-width" : ""}
            >
              <Field
                label={f.label}
                name={f.key}
                required={f.required}
                error={errors[f.key]}
                hint={
                  f.key === "password"
                    ? initial
                      ? "Minimal 6 karakter. Kosongkan jika tidak diubah."
                      : "Minimal 6 karakter."
                    : f.key === "code"
                      ? "Mendukung angka dan simbol pemisah (contoh: 400.8.2.7 atau 470)."
                      : undefined
                }
              >
                {f.type === "textarea" ? (
                  <textarea
                    id={f.key}
                    name={f.key}
                    defaultValue={initial?.[f.key] || ""}
                  />
                ) : f.type === "select" ? (
                  <select
                    id={f.key}
                    name={f.key}
                    defaultValue={initial?.[f.key] || f.options?.[0]}
                  >
                    {f.options?.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={f.key}
                    name={f.key}
                    type={f.type || "text"}
                    minLength={f.key === "password" ? 6 : undefined}
                    maxLength={f.key === "password" ? 256 : undefined}
                    required={f.key === "password" && !initial}
                    placeholder={
                      f.key === "code" ? "Contoh: 400.8.2.7" : undefined
                    }
                    defaultValue={
                      f.key === "password" ? "" : initial?.[f.key] || ""
                    }
                    autoComplete={
                      f.key === "password" ? "new-password" : undefined
                    }
                  />
                )}
              </Field>
            </div>
          ))}
          {kind === "pengguna" && (
            <>
              <Field label="Peran" name="role" required>
                <select
                  name="role"
                  id="role"
                  defaultValue={initial?.role || "OPERATOR"}
                >
                  {Object.entries(roleLabels)
                    .filter(
                      ([role]) =>
                        user.role === "SUPER_ADMIN" || role !== "SUPER_ADMIN",
                    )
                    .map(([role, label]) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                </select>
              </Field>
              {user.role === "SUPER_ADMIN" && (
                <Field label="Kelurahan" name="village_id">
                  <select
                    name="village_id"
                    id="village_id"
                    defaultValue={initial?.village_id || user.village_id || ""}
                  >
                    <option value="">Tanpa kelurahan (Super Admin)</option>
                    {villages.map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}
          <div className="full-width">
            <label className="row">
              <input
                type="checkbox"
                name="active"
                defaultChecked={initial?.active ?? true}
              />{" "}
              Aktif
            </label>
          </div>
        </div>
        {kind === "jenis-surat" && (
          <div>
            <div className="row" style={{ margin: "15px 0" }}>
              <h3>Field Formulir Surat</h3>
              <span className="spacer" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setFormFields((f) => [
                    ...f,
                    { key: "", label: "", type: "text", required: false },
                  ])
                }
              >
                <Plus size={14} />
                Tambah Field
              </Button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 15 }}>
              Gunakan kunci yang sama dengan placeholder pada template DOCX.
            </p>
            <div className="stack">
              {formFields.map((f, i) => (
                <div className="card card-body" key={i}>
                  <div className="form-grid">
                    <Field label="Kunci placeholder" name={"key" + i}>
                      <input
                        id={"key" + i}
                        value={f.key}
                        onChange={(e) => changeField(i, "key", e.target.value)}
                      />
                    </Field>
                    <Field label="Label field" name={"label" + i}>
                      <input
                        id={"label" + i}
                        value={f.label}
                        onChange={(e) =>
                          changeField(i, "label", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Tipe" name={"type" + i}>
                      <select
                        id={"type" + i}
                        value={f.type}
                        onChange={(e) => changeField(i, "type", e.target.value)}
                      >
                        {[
                          ["text", "Teks"],
                          ["textarea", "Teks panjang"],
                          ["number", "Angka"],
                          ["date", "Tanggal"],
                          ["select", "Pilihan"],
                          ["checkbox", "Kotak centang"],
                        ].map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="row">
                      <label className="row">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) =>
                            changeField(i, "required", e.target.checked)
                          }
                        />
                        Wajib
                      </label>
                      <span className="spacer" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Naikkan field"
                        disabled={i === 0}
                        onClick={() => {
                          const a = [...formFields];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          setFormFields(a);
                        }}
                      >
                        <ArrowUp size={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Turunkan field"
                        disabled={i === formFields.length - 1}
                        onClick={() => {
                          const a = [...formFields];
                          [a[i + 1], a[i]] = [a[i], a[i + 1]];
                          setFormFields(a);
                        }}
                      >
                        <ArrowDown size={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Hapus field"
                        onClick={() =>
                          setFormFields((a) => a.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    {f.type === "select" && (
                      <div className="full-width">
                        <Field
                          label="Pilihan (pisahkan dengan koma)"
                          name={"options" + i}
                        >
                          <input
                            id={"options" + i}
                            value={f.options?.join(",") || ""}
                            onChange={(e) =>
                              changeField(
                                i,
                                "options",
                                e.target.value.split(",").map((x) => x.trim()),
                              )
                            }
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="form-actions">
        <Button variant="outline" type="button" onClick={onCancel}>
          Batal
        </Button>
        <SubmitButton busy={busy} type="submit">
          <Save size={16} />
          Simpan Perubahan
        </SubmitButton>
      </div>
    </form>
  );
}
export function Templates() {
  const { types, notify, reload: reloadApp } = useApp(),
    { data, error, reload } = useData("templates"),
    [selected, setSelected] = useState(""),
    [upload, setUpload] = useState(false),
    [editingTemplate, setEditingTemplate] = useState<Row | null>(null),
    [validation, setValidation] = useState<Row | null>(null),
    [activation, setActivation] = useState<Row | null>(null),
    [deletion, setDeletion] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [problem, setProblem] = useState("");
  async function uploadFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      const form = new FormData(e.currentTarget);
      const file = form.get("file");
      const maxBytes = data?.max_template_bytes ?? 10 * 1024 * 1024;
      if (file instanceof File && file.size > maxBytes)
        throw new Error(`Ukuran maksimal ${maxBytes / 1024 / 1024} MB.`);
      const result = await api("templates", {
        method: "POST",
        body: form,
      });
      setUpload(false);
      setValidation(result);
      reload();
      notify("Versi baru diunggah dan diperiksa.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeTemplate() {
    if (!deletion) return;
    setBusy(true);
    setProblem("");
    try {
      await api("templates/" + deletion.id, { method: "DELETE" });
      setDeletion(null);
      reload();
      reloadApp();
      notify("Template berhasil dihapus dari daftar.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    if (!activation) return;
    setBusy(true);
    setProblem("");
    try {
      await send("templates/" + activation.id + "/activate");
      setActivation(null);
      reload();
      reloadApp();
      notify("Versi template berhasil diaktifkan.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Template Global"
        description="Satu template surat untuk seluruh kelurahan, dengan identitas yang terisi otomatis."
        action={
          <Button
            onClick={() => {
              setProblem("");
              setUpload(true);
            }}
          >
            <Upload size={17} />
            Upload Versi Baru
          </Button>
        }
      />
      <div className="two-column">
        <Card>
          <div className="toolbar">
            <select
              aria-label="Filter jenis surat template"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Semua jenis surat</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <Alert kind="error">{error}</Alert>
          ) : !data ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Template / Jenis Surat</th>
                    <th>Versi</th>
                    <th>Validasi</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items
                    .filter((t: Row) => !selected || t.type_id === selected)
                    .map((t: Row) => (
                      <tr key={t.id}>
                        <td>
                          <div className="template-file">
                            <FileText size={23} />
                            <div>
                              <strong>
                                {t.type_name.replace(
                                  "Surat Keterangan ",
                                  "Keterangan ",
                                )}
                              </strong>
                              <small>{t.file_name}</small>
                              <small>
                                {dateID(t.created_at)} · {t.uploader}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>v{t.version}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setValidation(t)}
                          >
                            {t.errors.length ? (
                              <span style={{ color: "#ca4059" }}>
                                {t.errors.length} masalah
                              </span>
                            ) : (
                              <span style={{ color: "#009568" }}>Valid</span>
                            )}
                          </button>
                        </td>
                        <td>
                          <span
                            className={`pill ${t.active ? "pill-green" : "pill-orange"}`}
                          >
                            {t.active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td>
                          <div className="row">
                            <Button
                              variant="outline"
                              size="sm"
                              title="Edit format dan teks template langsung di web app"
                              style={{ color: "#0066eb", borderColor: "#bfdbfe" }}
                              onClick={() => {
                                setProblem("");
                                setEditingTemplate(t);
                              }}
                            >
                              <Pencil size={14} /> Edit
                            </Button>
                            <Button asChild variant="outline" size="icon">
                              <a
                                href={"/api/templates/" + t.id + "/download"}
                                aria-label={"Unduh " + t.file_name}
                              >
                                <Download size={15} />
                              </a>
                            </Button>
                            {!t.active && (
                              <Button
                                size="sm"
                                disabled={!!t.errors.length}
                                onClick={() => {
                                  setProblem("");
                                  setActivation(t);
                                }}
                              >
                                Aktifkan
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Hapus ${t.file_name} versi ${t.version}`}
                              style={{ color: "#c43b52" }}
                              onClick={() => {
                                setProblem("");
                                setDeletion(t);
                              }}
                            >
                              <Trash2 size={15} /> Hapus
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title="Panduan Template" icon={<ShieldCheck size={21} />}>
            <div className="card-body">
              <p style={{ fontSize: 13, color: "#617b9e" }}>
                Gunakan dokumen DOCX dengan placeholder agar data kelurahan,
                penduduk, dan penandatangan terisi otomatis.
              </p>
              <div className="placeholder-list">
                {[
                  "nama_kelurahan",
                  "nama",
                  "nik",
                  "nomor_surat",
                  "nama_penandatangan",
                ].map((p) => (
                  <code key={p}>{"${" + p + "}"}</code>
                ))}
              </div>
              <hr
                style={{
                  border: 0,
                  borderTop: "1px solid #e1ebf5",
                  margin: "18px 0",
                }}
              />
              <dl className="summary-list">
                <div>
                  <dt>Format file</dt>
                  <dd>.docx</dd>
                </div>
                <div>
                  <dt>Ukuran maksimal</dt>
                  <dd>{(data?.max_template_bytes ?? 10 * 1024 * 1024) / 1024 / 1024} MB</dd>
                </div>
                <div>
                  <dt>Versi aktif</dt>
                  <dd>1 per jenis surat</dd>
                </div>
              </dl>
            </div>
          </Card>
          <Alert>
            Template baru tidak mengubah surat yang sudah terbit. Versi lama
            tetap disimpan untuk menjaga arsip.
          </Alert>
          <Alert kind="warning">
            Template awal merupakan contoh pengujian. Ganti dengan format yang
            disetujui instansi sebelum penggunaan operasional.
          </Alert>
        </div>
      </div>
      <Modal
        open={upload}
        onOpenChange={(v) => !busy && setUpload(v)}
        title="Upload Versi Template"
        description="File baru disimpan sebagai versi baru, lalu diperiksa sebelum aktivasi."
      >
        <form onSubmit={uploadFile}>
          <Field name="type_id" label="Jenis surat" required>
            <select
              id="type_id"
              name="type_id"
              defaultValue={selected || types[0]?.id}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="upload-box">
            <Upload
              size={30}
              style={{ margin: "0 auto 12px", color: "#3184d4" }}
            />
            <p>Pilih template DOCX</p>
            <small className="muted">Maksimal {(data?.max_template_bytes ?? 10 * 1024 * 1024) / 1024 / 1024} MB</small>
            <input
              style={{ display: "block", margin: "18px auto 0" }}
              name="file"
              type="file"
              accept=".docx"
              required
              aria-label="File template DOCX"
            />
          </div>
          {problem && <Alert kind="error">{problem}</Alert>}
          <div className="form-actions">
            <Button
              variant="outline"
              type="button"
              onClick={() => setUpload(false)}
            >
              Batal
            </Button>
            <SubmitButton busy={busy} type="submit">
              Upload & Validasi
            </SubmitButton>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!validation}
        onOpenChange={(v) => !v && setValidation(null)}
        title="Hasil Validasi Template"
        description={`Versi ${validation?.version || ""}`}
      >
        <div className="stack">
          <Alert kind={validation?.errors?.length ? "error" : "success"}>
            {validation?.errors?.length
              ? "Template belum dapat diaktifkan."
              : "Seluruh placeholder valid. Template siap diaktifkan."}
          </Alert>
          {validation?.errors?.length > 0 && (
            <ul>
              {validation?.errors.map((e: string) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div>
            <h3>Placeholder ditemukan</h3>
            <div className="placeholder-list">
              {validation?.placeholders?.map((p: string) => (
                <code key={p}>{"${" + p + "}"}</code>
              ))}
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!activation}
        onOpenChange={(v) => !busy && !v && setActivation(null)}
        title="Aktifkan Template?"
        description="Surat baru akan menggunakan versi ini. Surat terbit sebelumnya tetap menggunakan versinya sendiri."
      >
        <p>
          {activation?.type_name} — versi {activation?.version}
        </p>
        {problem && <Alert kind="error">{problem}</Alert>}
        <div className="form-actions">
          <Button variant="outline" onClick={() => setActivation(null)}>
            Kembali
          </Button>
          <SubmitButton busy={busy} onClick={activate}>
            Aktifkan Versi
          </SubmitButton>
        </div>
      </Modal>
      <Modal
        open={!!deletion}
        onOpenChange={(v) => !busy && !v && setDeletion(null)}
        title="Hapus Template?"
        description="Template akan dihapus dari daftar dan tidak dapat dipilih lagi."
      >
        <div className="stack">
          <p>
            <strong>{deletion?.type_name}</strong>
            <br />
            {deletion?.file_name} — versi {deletion?.version}
          </p>
          {deletion?.active && (
            <Alert kind="warning">
              Template ini sedang aktif. Setelah dihapus, pelayanan jenis surat
              ini memerlukan template aktif pengganti sebelum bisa membuat
              pratinjau atau menerbitkan surat baru.
            </Alert>
          )}
          <p>
            {Number(deletion?.usage_count) > 0
              ? `${deletion?.usage_count} surat pernah menggunakan template ini. `
              : ""}
            Arsip surat dan berkas sumbernya tetap disimpan untuk riwayat serta
            penyelesaian surat yang sedang diproses.
          </p>
          {problem && <Alert kind="error">{problem}</Alert>}
        </div>
        <div className="form-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setDeletion(null)}
          >
            Batal
          </Button>
          <SubmitButton
            busy={busy}
            onClick={removeTemplate}
            variant="destructive"
          >
            <Trash2 size={16} /> Hapus Template
          </SubmitButton>
        </div>
      </Modal>
      {editingTemplate && (
        <TemplateEditorModal
          templateId={editingTemplate.id}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => {
            reload();
            reloadApp();
            notify("Versi baru template berhasil disimpan & diperbarui.");
          }}
        />
      )}
    </>
  );
}
export function AuditPage() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    query = useDebounce(q),
    { data, error } = useData(
      "audit?" + new URLSearchParams({ q: query, page: String(page) }),
    );
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Jejak aktivitas pelayanan dan perubahan administrasi."
      />
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Cari aktivitas atau nama pengguna…"
          />
          <span className="spacer" />
          <span className="pill pill-blue">Hanya baca</span>
        </div>
        {error ? (
          <Alert kind="error">{error}</Alert>
        ) : !data ? (
          <Loading />
        ) : data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Pengguna</th>
                    <th>Aktivitas</th>
                    <th>Modul</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a: Row) => (
                    <tr key={a.id}>
                      <td>
                        {dateID(a.created_at)}
                        <small>
                          {new Date(a.created_at).toLocaleTimeString("id-ID", {
                            timeZone: "Asia/Jakarta",
                          })}
                        </small>
                      </td>
                      <td>
                        <strong>{a.actor}</strong>
                      </td>
                      <td>
                        <span className="pill pill-blue">
                          {a.action.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>{a.target_type}</td>
                      <td>
                        {a.metadata.reason ||
                          a.metadata.number ||
                          (a.metadata.version &&
                            "Versi " + a.metadata.version) ||
                          "—"}
                        {a.target_id && (
                          <small className="mono">
                            {a.target_id.slice(0, 8)}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.total}
              size={20}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty title="Aktivitas tidak ditemukan" />
        )}
      </Card>
    </>
  );
}
export function Profile() {
  const { user, village, notify, reload } = useApp(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      if (f.get("new_password") !== f.get("confirm_password"))
        throw new Error("Konfirmasi kata sandi tidak sesuai.");
      await send("profile", Object.fromEntries(f), "PATCH");
      notify("Profil berhasil diperbarui.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Profil Saya"
        description="Kelola nama dan keamanan akun Anda."
      />
      <div className="two-column">
        <Card title="Informasi Akun" icon={<UserRound />}>
          <form className="card-body" onSubmit={submit}>
            <div className="stack">
              {error && <Alert kind="error">{error}</Alert>}
              <Field name="name" label="Nama lengkap" required>
                <input id="name" name="name" defaultValue={user.name} />
              </Field>
              <h3 className="section-gap">Ubah Kata Sandi</h3>
              <p className="muted" style={{ fontSize: 12 }}>
                Kosongkan bagian ini jika Anda hanya mengubah nama.
              </p>
              <Field name="current_password" label="Kata sandi saat ini">
                <input
                  id="current_password"
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                />
              </Field>
              <Field
                name="new_password"
                label="Kata sandi baru"
                hint="Minimal 6 karakter. Kosongkan jika tidak diubah."
              >
                <input
                  id="new_password"
                  name="new_password"
                  minLength={6}
                  maxLength={256}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
              <Field name="confirm_password" label="Konfirmasi kata sandi baru">
                <input
                  id="confirm_password"
                  name="confirm_password"
                  minLength={6}
                  maxLength={256}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div className="form-actions">
              <SubmitButton busy={busy} type="submit">
                <Save size={16} />
                Simpan Profil
              </SubmitButton>
            </div>
          </form>
        </Card>
        <Card title="Hak Akses" icon={<ShieldCheck />}>
          <div className="card-body">
            <dl className="summary-list vertical">
              <div>
                <dt>Username</dt>
                <dd>{user.username}</dd>
              </div>
              <div>
                <dt>Peran</dt>
                <dd>{roleLabels[user.role]}</dd>
              </div>
              <div>
                <dt>Lingkup</dt>
                <dd>{village ? "Kelurahan " + village.name : "Kecamatan"}</dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>
    </>
  );
}
export function SettingsPage() {
  const { data, error, reload } = useData("settings"),
    { user, types, notify } = useApp(),
    counters = useData(user.village_id ? "counters" : null),
    [busy, setBusy] = useState(false),
    [problem, setProblem] = useState(""),
    [counterDialog, setCounterDialog] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await send(
        "settings",
        Object.fromEntries(new FormData(e.currentTarget)),
        "PATCH",
      );
      notify("Pengaturan global berhasil disimpan.");
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (
      !confirm(
        "Sesuaikan nomor terakhir? Nomor yang dilewati tidak dialokasikan otomatis.",
      )
    )
      return;
    setBusy(true);
    setProblem("");
    try {
      await send(
        "counters",
        { ...f, year: Number(f.year), last_sequence: Number(f.last_sequence) },
        "PATCH",
      );
      counters.reload();
      setCounterDialog(false);
      notify("Counter disesuaikan dan alasan dicatat.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader
        title="Pengaturan Global"
        description="Identitas kecamatan dan pengaturan penomoran surat."
      />
      <div className="stack">
        <Card title="Identitas Kecamatan" icon={<Building2 />}>
          <form onSubmit={save} className="card-body">
            <div className="form-grid">
              <Field name="district" label="Nama kecamatan">
                <input
                  id="district"
                  name="district"
                  defaultValue={data.district}
                />
              </Field>
              <Field name="city" label="Kabupaten / kota">
                <input id="city" name="city" defaultValue={data.city} />
              </Field>
            </div>
            {problem && !counterDialog && <Alert kind="error">{problem}</Alert>}
            <div className="form-actions">
              <SubmitButton type="submit" busy={busy}>
                Simpan Pengaturan
              </SubmitButton>
            </div>
          </form>
        </Card>
        <Card
          title="Penomoran Surat"
          description="Counter terpisah per kelurahan, jenis surat, dan tahun."
          icon={<Settings />}
          action={
            user.village_id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProblem("");
                  setCounterDialog(true);
                }}
              >
                Sesuaikan Counter
              </Button>
            )
          }
        >
          <div className="card-body">
            <Alert>
              Format: B / nomor urut / klasifikasi / bulan Romawi /
              tahun (contoh: B/001/400.8.2.7/IX/2026). Nomor dialokasikan saat penerbitan.
            </Alert>
            {!user.village_id ? (
              <Empty title="Pilih kelurahan untuk melihat counter" />
            ) : counters.data?.items.length ? (
              <div className="table-wrap section-gap">
                <table>
                  <thead>
                    <tr>
                      <th>Jenis Surat</th>
                      <th>Tahun</th>
                      <th>Nomor Terakhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counters.data.items.map((c: Row) => (
                      <tr key={c.type_id + c.year}>
                        <td>{c.name}</td>
                        <td>{c.year}</td>
                        <td>{c.last_sequence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Belum ada nomor dialokasikan" />
            )}
          </div>
        </Card>
      </div>
      <Modal
        open={counterDialog}
        onOpenChange={setCounterDialog}
        title="Sesuaikan Counter"
        description="Counter hanya dapat dinaikkan. Setiap perubahan wajib menyertakan alasan."
      >
        <form onSubmit={adjust}>
          <div className="stack">
            <Field name="type_id" label="Jenis surat" required>
              <select id="type_id" name="type_id">
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="year" label="Tahun" required>
              <input
                name="year"
                id="year"
                type="number"
                defaultValue={new Date().getFullYear()}
              />
            </Field>
            <Field name="last_sequence" label="Nomor terakhir" required>
              <input
                name="last_sequence"
                id="last_sequence"
                type="number"
                min={0}
              />
            </Field>
            <Field name="reason" label="Alasan penyesuaian" required>
              <textarea id="reason" name="reason" minLength={5} />
            </Field>
            {problem && <Alert kind="error">{problem}</Alert>}
          </div>
          <div className="form-actions">
            <SubmitButton type="submit" busy={busy}>
              Simpan Penyesuaian
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
