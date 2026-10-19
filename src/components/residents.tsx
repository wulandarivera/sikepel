"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Users,
  UserRound,
  MapPin,
  Pencil,
  FilePlus2,
  ArrowLeft,
  Save,
} from "lucide-react";
import { useApp } from "./workspace";
import {
  useData,
  useDebounce,
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
  Badge,
} from "./common";
import { Button } from "./ui/button";
import { dateID, type Row } from "@/lib/types";
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a?.href &&
        a.target !== "_blank" &&
        a.origin === location.origin &&
        a.pathname !== location.pathname &&
        !window.confirm(
          "Ada perubahan yang belum disimpan. Tinggalkan halaman ini?",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}
const residentFields = [
  ["nik", "NIK", "text"],
  ["no_kk", "Nomor Kartu Keluarga", "text"],
  ["name", "Nama lengkap", "text"],
  ["birth_place", "Tempat lahir", "text"],
  ["birth_date", "Tanggal lahir", "date"],
  ["gender", "Jenis kelamin", "select", "Laki-laki|Perempuan"],
  [
    "religion",
    "Agama",
    "select",
    "Islam|Kristen|Katolik|Hindu|Buddha|Konghucu|Kepercayaan",
  ],
  [
    "marital_status",
    "Status perkawinan",
    "select",
    "Belum Kawin|Kawin|Cerai Hidup|Cerai Mati",
  ],
  ["occupation", "Pekerjaan", "text"],
  ["address", "Alamat lengkap", "textarea"],
  ["rt", "RT", "text"],
  ["rw", "RW", "text"],
];
export function ResidentForm({
  initial,
  onSaved,
  onCancel,
  inFlow = false,
}: {
  initial?: Row;
  onSaved: (r: Row) => void;
  onCancel: () => void;
  inFlow?: boolean;
}) {
  const [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useUnsaved(dirty);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const r = await send(
        "residents" + (initial ? "/" + initial.id : ""),
        f,
        initial ? "PATCH" : "POST",
      );
      setDirty(false);
      onSaved(r);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof APIError) setFields(e.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} noValidate>
      <div className="stack">
        {initial && (
          <Alert kind="warning">
            Perubahan data ini tidak mengubah surat yang sudah terbit.
          </Alert>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="form-grid">
          {residentFields.map(([name, label, type, options]) => (
            <div key={name} className={type === "textarea" ? "full-width" : ""}>
              <Field
                name={name}
                label={label}
                required
                error={fields[name]}
                hint={
                  name === "nik"
                    ? "16 digit. Data berasal dari input pelayanan lokal."
                    : undefined
                }
              >
                {type === "select" ? (
                  <select
                    id={name}
                    name={name}
                    defaultValue={initial?.[name] || ""}
                    aria-invalid={!!fields[name]}
                  >
                    <option value="">Pilih {label.toLowerCase()}</option>
                    {options.split("|").map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : type === "textarea" ? (
                  <textarea
                    id={name}
                    name={name}
                    defaultValue={initial?.[name] || ""}
                    placeholder="Nama jalan, nomor rumah, dan lingkungan"
                    aria-invalid={!!fields[name]}
                  />
                ) : (
                  <input
                    id={name}
                    name={name}
                    type={type}
                    maxLength={
                      ["nik", "no_kk"].includes(name)
                        ? 16
                        : ["rt", "rw"].includes(name)
                          ? 3
                          : 200
                    }
                    inputMode={
                      ["nik", "no_kk", "rt", "rw"].includes(name)
                        ? "numeric"
                        : undefined
                    }
                    defaultValue={initial?.[name] || ""}
                    placeholder={
                      name === "nik"
                        ? "Masukkan 16 digit NIK"
                        : name === "no_kk"
                          ? "Masukkan 16 digit nomor KK"
                          : undefined
                    }
                    aria-invalid={!!fields[name]}
                  />
                )}
              </Field>
            </div>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!dirty || confirm("Batalkan perubahan yang belum disimpan?"))
              onCancel();
          }}
        >
          Batal
        </Button>
        <SubmitButton busy={busy} type="submit">
          <Save size={16} />
          {inFlow
            ? "Simpan & Lanjutkan Pelayanan"
            : initial
              ? "Simpan Perubahan"
              : "Simpan Penduduk"}
        </SubmitButton>
      </div>
    </form>
  );
}
export function ResidentSummary({
  resident,
  action,
}: {
  resident: Row;
  action?: React.ReactNode;
}) {
  return (
    <Card
      title="Data Penduduk"
      description="Data penduduk yang akan diterbitkan surat"
      icon={<UserRound size={23} />}
      action={action}
    >
      <div className="resident-summary">
        <span className="avatar">
          <UserRound size={33} />
        </span>
        <div>
          <h3>{resident.name}</h3>
          <span className="pill pill-green">Dari Data Penduduk</span>
        </div>
        <dl>
          <div>
            <dt>NIK</dt>
            <dd className="mono">{resident.nik}</dd>
          </div>
          <div>
            <dt>Pekerjaan</dt>
            <dd>{resident.occupation}</dd>
          </div>
          <div>
            <dt>Tempat / tanggal lahir</dt>
            <dd>
              {resident.birth_place}, {dateID(resident.birth_date)}
            </dd>
          </div>
          <div>
            <dt>Alamat</dt>
            <dd>
              {resident.address}, RT {resident.rt} / RW {resident.rw}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
export function ResidentPicker({
  onPick,
  onAdd,
}: {
  onPick: (r: Row) => void;
  onAdd: () => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    query = useDebounce(q),
    { data, error, loading } = useData(
      "residents?" + new URLSearchParams({ q: query, page: String(page) }),
    );
  return (
    <Card
      title="Cari Data Penduduk"
      description="Cari berdasarkan NIK atau nama penduduk"
      icon={<Users size={22} />}
    >
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Cari NIK atau nama penduduk…"
        />
        <Button variant="outline" onClick={onAdd}>
          <Plus size={16} />
          Tambah Penduduk
        </Button>
      </div>
      {error ? (
        <Alert kind="error">{error}</Alert>
      ) : loading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nama Penduduk</th>
                  <th>NIK</th>
                  <th>Alamat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r: Row) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>
                        {r.birth_place}, {dateID(r.birth_date)}
                      </small>
                    </td>
                    <td className="mono">{r.nik}</td>
                    <td>
                      {r.address}
                      <small>
                        RT {r.rt} / RW {r.rw}
                      </small>
                    </td>
                    <td>
                      <Button size="sm" onClick={() => onPick(r)}>
                        Pilih Penduduk
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} onChange={setPage} />
        </>
      ) : (
        <Empty
          title="Data penduduk tidak ditemukan"
          description="Tambahkan data penduduk untuk melanjutkan pelayanan."
          action={
            <Button onClick={onAdd}>
              <Plus size={16} />
              Tambah Penduduk & Lanjutkan
            </Button>
          }
        />
      )}
    </Card>
  );
}
export function Residents() {
  const path = usePathname(),
    router = useRouter(),
    { notify } = useApp();
  const parts = path.split("/").filter(Boolean),
    id = parts[2],
    editing = parts[3] === "edit";
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    query = useDebounce(q);
  const list = useData(
      !id
        ? "residents?" + new URLSearchParams({ q: query, page: String(page) })
        : null,
    ),
    detail = useData(id && id !== "baru" ? "residents/" + id : null);
  const back = (
    <Button asChild variant="outline">
      <Link href="/app/penduduk">
        <ArrowLeft size={16} />
        Kembali
      </Link>
    </Button>
  );
  if (id === "baru" || editing)
    return (
      <>
        <PageHeader
          title={editing ? "Edit Data Penduduk" : "Tambah Penduduk"}
          description="Lengkapi identitas, status, dan alamat penduduk."
          action={back}
        />
        <Card
          title="Identitas Penduduk"
          description="Data lokal hasil pelayanan kelurahan"
          icon={<UserRound />}
        >
          <div className="card-body">
            {editing && !detail.data ? (
              <Loading />
            ) : (
              <ResidentForm
                initial={editing ? detail.data : undefined}
                onSaved={(r) => {
                  notify("Data penduduk berhasil disimpan.");
                  router.push("/app/penduduk/" + r.id);
                }}
                onCancel={() => router.push("/app/penduduk")}
              />
            )}
          </div>
        </Card>
      </>
    );
  if (id) {
    if (detail.error) return <Alert kind="error">{detail.error}</Alert>;
    const r = detail.data;
    if (!r) return <Loading />;
    return (
      <>
        <PageHeader
          title={r.name}
          description="Identitas penduduk dan riwayat pelayanan"
          action={
            <>
              {back}
              <Button asChild>
                <Link href={`/app/penduduk/${r.id}/edit`}>
                  <Pencil size={16} />
                  Edit Data
                </Link>
              </Button>
            </>
          }
        />
        <div className="two-column">
          <div className="stack">
            <ResidentSummary resident={r} />
            <Card title="Riwayat Surat" icon={<FilePlus2 />}>
              {r.history.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nomor</th>
                        <th>Jenis Surat</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.history.map((l: Row) => (
                        <tr key={l.id}>
                          <td>{l.number || "Belum bernomor"}</td>
                          <td>{l.type_name}</td>
                          <td>
                            <Badge status={l.status} />
                          </td>
                          <td>
                            <Link
                              href={"/app/arsip/" + l.id}
                              className="table-action"
                            >
                              Lihat
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Belum ada riwayat pelayanan" />
              )}
            </Card>
          </div>
          <Card title="Informasi Penduduk" icon={<MapPin />}>
            <div className="card-body">
              <dl className="summary-list vertical">
                {[
                  ["Nomor KK", r.no_kk],
                  ["Jenis kelamin", r.gender],
                  ["Agama", r.religion],
                  ["Status perkawinan", r.marital_status],
                  ["Diperbarui", dateID(r.updated_at, true)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <Button asChild className="section-gap">
                <Link href={"/app/pelayanan/baru/jenis-surat?resident=" + r.id}>
                  <FilePlus2 size={17} />
                  Buat Surat
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Data Penduduk"
        description="Kelola data penduduk lokal hasil pelayanan kelurahan."
        action={
          <Button asChild>
            <Link href="/app/penduduk/baru">
              <Plus size={18} />
              Tambah Penduduk
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Cari NIK atau nama penduduk…"
          />
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            {list.data?.total || 0} penduduk
          </span>
        </div>
        {list.error ? (
          <Alert kind="error">{list.error}</Alert>
        ) : list.loading ? (
          <Loading />
        ) : list.data?.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nama Penduduk</th>
                    <th>NIK</th>
                    <th>No. KK</th>
                    <th>Alamat</th>
                    <th>Diperbarui</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r: Row) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={"/app/penduduk/" + r.id}>
                          <strong>{r.name}</strong>
                        </Link>
                        <small>{r.gender}</small>
                      </td>
                      <td className="mono">{r.nik}</td>
                      <td className="mono">{r.no_kk}</td>
                      <td>
                        {r.address}
                        <small>
                          RT {r.rt} / RW {r.rw}
                        </small>
                      </td>
                      <td>{dateID(r.updated_at)}</td>
                      <td>
                        <Button asChild size="sm" variant="outline">
                          <Link href={"/app/penduduk/" + r.id}>Lihat</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={list.data.total}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty
            title="Data penduduk tidak ditemukan"
            description="Coba kata kunci lain atau tambahkan penduduk baru."
            action={
              <Button asChild>
                <Link href="/app/penduduk/baru">Tambah Penduduk</Link>
              </Button>
            }
          />
        )}
      </Card>
    </>
  );
}
