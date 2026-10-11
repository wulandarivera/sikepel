"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  AlertCircle,
  FolderOpen,
  Check,
  Clock,
  FileText,
  XCircle,
  Info,
} from "lucide-react";
import { Button } from "./ui/button";
import { statusLabels, type Status } from "@/lib/types";
export class APIError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
    public status?: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let result: Response;
  try {
    result = await fetch("/api/" + path, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  } catch {
    throw new APIError("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
  }
  if (result.status === 401 && path !== "login" && typeof window !== "undefined")
    window.location.assign("/login?expired=1");
  let data: any;
  try {
    data = await result.json();
    if (!data || typeof data !== "object") throw new Error("Invalid response");
  } catch {
    throw new APIError("Respons server tidak dapat dibaca. Coba lagi nanti.", undefined, result.status);
  }
  if (!result.ok) {
    throw new APIError(
      data.error || "Terjadi kesalahan.",
      data.fields,
      result.status,
    );
  }
  return data;
}
export const send = (path: string, data: unknown = {}, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
export function useData<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, loading, reload };
}
export function useDebounce(value: string, delay = 250) {
  const [v, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Memuat data…
    </div>
  );
}
export function Alert({
  children,
  kind = "info",
}: {
  children: React.ReactNode;
  kind?: "info" | "error" | "success" | "warning";
}) {
  const Icon =
    kind === "error" ? AlertCircle : kind === "success" ? Check : Info;
  return (
    <div
      className={`alert alert-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon size={19} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title = "Belum ada data",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FolderOpen size={30} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="header-actions">{action}</div>}
    </div>
  );
}
export function Card({
  title,
  description,
  icon,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-heading">
          {icon && <span className="card-heading-icon">{icon}</span>}
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Cari…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Hapus pencarian" onClick={() => onChange("")}>
          ×
        </button>
      )}
    </div>
  );
}
export function Pagination({
  page,
  total,
  size = 10,
  onChange,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} dari ${total} data`
          : "0 data"}
      </span>
      <div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={17} />
        </Button>
        <span className="page-number">{page}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Halaman berikutnya"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={17} />
        </Button>
      </div>
    </div>
  );
}
export function Badge({ status }: { status: Status }) {
  const Icon =
    status === "ISSUED"
      ? Check
      : status === "CANCELLED"
        ? XCircle
        : status === "ISSUE_PENDING"
          ? Clock
          : FileText;
  return (
    <span className={`badge badge-${status}`}>
      <Icon size={13} />
      {statusLabels[status] || status}
    </span>
  );
}
export function Field({
  label,
  name,
  error,
  required,
  children,
  hint,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {children}
      {error ? (
        <small className="error-text">{error}</small>
      ) : (
        hint && <small>{hint}</small>
      )}
    </div>
  );
}
export function SubmitButton({
  busy,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { busy: boolean }) {
  return (
    <Button disabled={busy} {...props}>
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </Button>
  );
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Terjadi kesalahan. Coba kembali.";
