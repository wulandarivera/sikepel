"use client";
import { APP_VERSION } from "@/lib/version";
import { environmentLabel } from "@/lib/environment-label";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  FolderOpen,
  Files,
  Building2,
  UserRound,
  Settings,
  ChartNoAxesCombined,
  History,
  Menu,
  MapPin,
  LogOut,
  ChevronRight,
  X,
  Check,
  ShieldCheck,
  Inbox,
} from "lucide-react";
import { useData, Loading, Alert, send, Empty } from "./common";
import { roleLabels, type User, type Row } from "@/lib/types";
import { Dashboard, Reports } from "./dashboard";
import { Residents } from "./residents";
import { Service, Archive } from "./service";
import {
  AdminPage,
  Templates,
  AuditPage,
  Profile,
  SettingsPage,
} from "./administration";
import { PermohonanMandiri } from "./permohonan-mandiri";
import { Button } from "./ui/button";
type Context = {
  user: User;
  villages: Row[];
  village?: Row;
  types: Row[];
  officials: Row[];
  reload: () => void;
  notify: (s: string) => void;
  pendingCount?: number;
  reloadCounter?: () => void;
};
const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
const all = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "PIMPINAN"];
const nav = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: all },
  {
    href: "permohonan-mandiri",
    label: "Permohonan Mandiri",
    icon: Inbox,
    roles: ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  },
  {
    href: "pelayanan/baru/jenis-surat",
    label: "Pelayanan Surat",
    icon: FileText,
    roles: ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  },
  {
    href: "penduduk",
    label: "Data Penduduk",
    icon: Users,
    roles: ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  },
  { href: "arsip", label: "Arsip Surat", icon: FolderOpen, roles: all },
  {
    href: "template",
    label: "Template Global",
    icon: Files,
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "jenis-surat",
    label: "Jenis Surat",
    icon: FileText,
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "kelurahan",
    label: "Kelurahan",
    icon: Building2,
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "pejabat",
    label: "Pejabat",
    icon: UserRound,
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "pengguna",
    label: "Pengguna",
    icon: Users,
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "audit",
    label: "Audit Log",
    icon: History,
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "laporan",
    label: "Laporan",
    icon: ChartNoAxesCombined,
    roles: ["SUPER_ADMIN", "ADMIN", "PIMPINAN"],
  },
  {
    href: "pengaturan",
    label: "Pengaturan",
    icon: Settings,
    roles: ["SUPER_ADMIN"],
  },
  { href: "profil", label: "Profil Saya", icon: UserRound, roles: all },
];
export function Workspace() {
  const path = usePathname(),
    router = useRouter(),
    { data, error, reload } = useData("bootstrap"),
    [menu, setMenu] = useState(false),
    [message, setMessage] = useState("");
  const notify = useCallback((s: string) => setMessage(s), []);
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 4500);
      return () => clearTimeout(t);
    }
  }, [message]);
  useEffect(() => setMenu(false), [path]);

  const user = data?.user as User | undefined;
  const village = data?.villages?.find((v: Row) => v.id === user?.village_id);
  const villageId = user?.village_id || village?.id;
  const { data: counterData, reload: reloadCounter } = useData<{
    count?: number;
    pending_verification?: number;
  }>(villageId ? "permohonan-mandiri/count" : null);

  if (error)
    return (
      <div className="error-page">
        <Alert kind="error">{error}</Alert>
        <Button onClick={reload}>Coba Lagi</Button>
      </div>
    );
  if (!data || !user) return <Loading />;

  const segment = path.split("/")[2] || "dashboard";
  const allowed = nav
    .find((n) => n.href.split("/")[0] === segment)
    ?.roles.includes(user.role);
  const needsVillage = [
    "pelayanan",
    "penduduk",
    "arsip",
    "pejabat",
    "permohonan-mandiri",
  ].includes(segment);
  const scopeMissing = needsVillage && !village;
  const pendingCount =
    counterData?.count ?? counterData?.pending_verification ?? 0;
  const context: Context = {
    user,
    villages: data.villages,
    village,
    types: data.types,
    officials: data.officials,
    reload,
    notify,
    pendingCount,
    reloadCounter,
  };
  async function logout() {
    try {
      await send("logout");
      router.push("/login");
      router.refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal keluar.");
    }
  }
  return (
    <AppContext.Provider value={context}>
      <div className="app-shell">
        <div
          className={`mobile-shade ${menu ? "open" : ""}`}
          onClick={() => setMenu(false)}
        />
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <button
            className="mobile-close"
            aria-label="Tutup navigasi"
            onClick={() => setMenu(false)}
          >
            <X />
          </button>
          <Link
            href="/app/dashboard"
            className="sidebar-brand"
            aria-label="SIKEPEL — Dashboard"
          >
            <Image
              src="/assets/icon.webp"
              width={78}
              height={78}
              alt=""
              priority
            />
            <div className="sidebar-wordmark">
              SIKE<span>PEL</span>
            </div>
            <small>
              Sistem Informasi
              <br />
              Pelayanan Kelurahan
            </small>
          </Link>
          <nav aria-label="Navigasi utama">
            {nav
              .filter((n) => n.roles.includes(user.role))
              .map((n, i) => (
                <div key={n.href}>
                  {i === 0 && (
                    <div className="nav-section-label">MENU UTAMA</div>
                  )}
                  {n.href === "template" && (
                    <div className="nav-section-label">ADMINISTRASI</div>
                  )}
                  <Link
                    href={"/app/" + n.href}
                    className={`nav-link ${segment === n.href.split("/")[0] ? "active" : ""}`}
                    aria-current={
                      segment === n.href.split("/")[0] ? "page" : undefined
                    }
                  >
                    <n.icon />
                    <span>
                      {n.href === "kelurahan" && user.role === "ADMIN"
                        ? "Profil Kelurahan"
                        : n.label}
                    </span>
                    {n.href === "permohonan-mandiri" && pendingCount > 0 && (
                      <span
                        className="nav-badge"
                        aria-label={`${pendingCount} permohonan baru`}
                      >
                        {pendingCount}
                      </span>
                    )}
                    {n.href.startsWith("pelayanan") && (
                      <ChevronRight className="nav-chevron" />
                    )}
                  </Link>
                </div>
              ))}
          </nav>
          <div className="sidebar-footer">
            Melayani Masyarakat
            <br />
            Membangun Kelurahan
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <button
              className="topbar-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Buka navigasi"
            >
              <Menu size={22} />
            </button>
            <div className="topbar-title">
              <b>
                Pemerintah{" "}
                {village?.city || data.settings?.city || "Kota Sejahtera"}
              </b>
              <small>SIKEPEL · Sistem Informasi Pelayanan Kelurahan</small>
            </div>
            <div className="tenant-chip">
              <MapPin size={17} />
              {user.role === "SUPER_ADMIN" ? (
                <select
                  aria-label="Lingkup kelurahan"
                  value={user.village_id || ""}
                  onChange={async (e) => {
                    try {
                      await send("scope", {
                        village_id: e.target.value || null,
                      });
                      reload();
                      router.refresh();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <option value="">Seluruh Kecamatan</option>
                  {data.villages.map((v: Row) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>Kelurahan {village?.name}</span>
              )}
            </div>
            <Link href="/app/profil" className="top-user">
              <span className="avatar">
                {user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <div>
                <b>{user.name}</b>
                <small>{roleLabels[user.role]}</small>
              </div>
            </Link>
            <button
              className="topbar-logout"
              aria-label="Keluar"
              title="Keluar"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </header>
          <main className="content" key={user.village_id || "all"}>
            {!allowed ? (
              <Empty
                title="Anda tidak memiliki akses ke halaman ini"
                description="Pilih menu yang tersedia untuk peran Anda."
                action={
                  <Button asChild>
                    <Link href="/app/dashboard">Kembali ke Dashboard</Link>
                  </Button>
                }
              />
            ) : scopeMissing ? (
              <Empty
                title="Pilih lingkup kelurahan"
                description="Gunakan pilihan kelurahan di bagian atas untuk membuka data pelayanan."
              />
            ) : (
              <>
                {segment === "dashboard" && <Dashboard />}
                {segment === "permohonan-mandiri" && <PermohonanMandiri />}
                {segment === "penduduk" && <Residents />}
                {segment === "pelayanan" && <Service />}
                {segment === "arsip" && <Archive />}
                {segment === "template" && <Templates />}
                {["kelurahan", "pejabat", "pengguna", "jenis-surat"].includes(
                  segment,
                ) && <AdminPage kind={segment} />}{" "}
                {segment === "audit" && <AuditPage />}
                {segment === "laporan" && <Reports />}
                {segment === "profil" && <Profile />}
                {segment === "pengaturan" && <SettingsPage />}
              </>
            )}
            <footer className="content-footer">
              <span>
                © {new Date().getFullYear()} SIKEPEL · Sistem Informasi
                Pelayanan Kelurahan
              </span>
              <span className="row">
                <ShieldCheck size={12} />{" "}
                {environmentLabel(data)} · <small>Versi {APP_VERSION}</small>
              </span>
            </footer>
          </main>
        </div>
        {message && (
          <div className="notification" role="status">
            <Check size={19} />
            {message}
            <button
              onClick={() => setMessage("")}
              className="text-button"
              aria-label="Tutup pemberitahuan"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
