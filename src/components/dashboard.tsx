"use client";
import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  CalendarDays,
  FolderOpen,
  Users,
  ChartNoAxesCombined,
  ChartPie,
  Clock,
  Plus,
  ChevronRight,
  Download,
  Building2,
  Home,
  Briefcase,
  Heart,
  UserCheck,
  Contact,
  Truck,
  Coins,
  Calendar,
} from "lucide-react";
import { useApp } from "./workspace";
import {
  useData,
  PageHeader,
  Card,
  Loading,
  Alert,
  Empty,
  Badge,
} from "./common";
import { Button } from "./ui/button";
import { dateID, type Row } from "@/lib/types";

const serviceIcons: Record<string, any> = {
  domisili: Home,
  "tidak-mampu": Users,
  usaha: Briefcase,
  penghasilan: Coins,
  "belum-memiliki-rumah": Building2,
  "belum-menikah": UserCheck,
  "suami-istri": Users,
  pindah: Truck,
  ktp: Contact,
  nikah: Heart,
  umum: FileText,
};

const serviceColors: Record<string, string> = {
  domisili: "blue",
  "tidak-mampu": "green",
  usaha: "green",
  penghasilan: "orange",
  "belum-memiliki-rumah": "purple",
  "belum-menikah": "orange",
  "suami-istri": "pink",
  pindah: "pink",
  ktp: "blue",
  nikah: "pink",
  umum: "blue",
};

export function LetterTable({ items }: { items: Row[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Nomor Surat</th>
            <th>Jenis Surat</th>
            <th>Nama Pemohon</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <td>
                {dateID(l.created_at)}
                <small>
                  {new Date(l.created_at).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Jakarta",
                  })}
                </small>
              </td>
              <td className="mono">{l.number || "Belum bernomor"}</td>
              <td>{l.type_name.replace("Surat Keterangan ", "Keterangan ")}</td>
              <td>
                <strong>{l.resident_name}</strong>
              </td>
              <td>
                <Badge status={l.status} />
              </td>
              <td>
                <Button asChild variant="outline" size="sm">
                  <Link href={"/app/arsip/" + l.id}>
                    Lihat
                    <ChevronRight size={13} />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Dashboard() {
  const { user, village } = useApp();

  const now = new Date();
  const getTodayStr = () =>
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const getThisMonthStr = () =>
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const getThisYearStr = () => now.getFullYear().toString();

  const [period, setPeriod] = useState<"day" | "month" | "year">("day");
  const [selectedDate, setSelectedDate] = useState(getTodayStr);
  const [selectedMonth, setSelectedMonth] = useState(getThisMonthStr);
  const [selectedYear, setSelectedYear] = useState(getThisYearStr);

  const queryParam =
    period === "day"
      ? `period=day&date=${selectedDate}`
      : period === "month"
      ? `period=month&month=${selectedMonth}`
      : `period=year&year=${selectedYear}`;

  const { data, error } = useData(`dashboard?${queryParam}`);
  const recent = useData(user.village_id ? "letters" : null);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Loading />;
  const stats = data.stats;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: d.toLocaleDateString("id-ID", { month: "short" }),
      count: data.months.find((m: Row) => m.month === key)?.count || 0,
    };
  });
  const max = Math.max(5, ...months.map((m) => m.count));

  const getPeriodLabel = () => {
    try {
      if (period === "day") {
        const isToday = selectedDate === getTodayStr();
        const d = new Date(selectedDate + "T12:00:00");
        const formatted = d.toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        return isToday ? `Hari Ini (${formatted})` : formatted;
      }
      if (period === "month") {
        const isThisMonth = selectedMonth === getThisMonthStr();
        const d = new Date(selectedMonth + "-01T12:00:00");
        const formatted = d.toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
        });
        return isThisMonth ? `Bulan Ini (${formatted})` : `Bulan ${formatted}`;
      }
      const isThisYear = selectedYear === getThisYearStr();
      return isThisYear ? `Tahun Ini (${selectedYear})` : `Tahun ${selectedYear}`;
    } catch {
      return selectedDate || selectedMonth || selectedYear;
    }
  };

  return (
    <>
      <PageHeader
        title={
          user.role === "SUPER_ADMIN" && !village
            ? "Dashboard Kecamatan"
            : "Dashboard"
        }
        description={`Ringkasan informasi pelayanan ${village ? "di Kelurahan " + village.name : "seluruh kelurahan"}`}
        action={
          <div className="dashboard-welcome">
            {new Date().toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <p>Selamat bekerja, {user.name.split(" ")[0]}!</p>
          </div>
        }
      />
      <div className="row" style={{ marginBottom: 20 }}>
        {user.role !== "PIMPINAN" && village && (
          <Button asChild>
            <Link href="/app/pelayanan/baru/jenis-surat">
              <Plus size={18} />
              Buat Pelayanan
            </Link>
          </Button>
        )}
        <div className="spacer" />
        {village && (
          <div className="row">
            <Link className="pill pill-orange" href="/app/arsip?status=DRAFT">
              {stats.drafts} draft
            </Link>
            <Link
              className="pill pill-blue"
              href="/app/arsip?status=ISSUE_PENDING"
            >
              {stats.pending} diproses
            </Link>
          </div>
        )}
      </div>

      {/* JUMLAH SURAT BERDASARKAN JENIS PELAYANAN & FILTER HARI, BULAN, TAHUN */}
      <div className="dashboard-filter-section">
        <div className="dashboard-filter-bar">
          <div className="dashboard-filter-left">
            <div className="filter-period-tabs">
              <button
                type="button"
                className={`filter-tab-btn ${period === "day" ? "active" : ""}`}
                onClick={() => setPeriod("day")}
              >
                <Calendar size={14} />
                <span>Hari</span>
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${period === "month" ? "active" : ""}`}
                onClick={() => setPeriod("month")}
              >
                <CalendarDays size={14} />
                <span>Bulan</span>
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${period === "year" ? "active" : ""}`}
                onClick={() => setPeriod("year")}
              >
                <Clock size={14} />
                <span>Tahun</span>
              </button>
            </div>

            <div className="filter-picker-group">
              {period === "day" && (
                <>
                  <input
                    type="date"
                    className="filter-input"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                  <button
                    type="button"
                    className="filter-quick-btn"
                    onClick={() => setSelectedDate(getTodayStr())}
                  >
                    Hari Ini
                  </button>
                </>
              )}

              {period === "month" && (
                <>
                  <input
                    type="month"
                    className="filter-input"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                  <button
                    type="button"
                    className="filter-quick-btn"
                    onClick={() => setSelectedMonth(getThisMonthStr())}
                  >
                    Bulan Ini
                  </button>
                </>
              )}

              {period === "year" && (
                <>
                  <select
                    className="filter-input"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    {[2023, 2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y.toString()}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="filter-quick-btn"
                    onClick={() => setSelectedYear(getThisYearStr())}
                  >
                    Tahun Ini
                  </button>
                </>
              )}
            </div>

            <div className="filter-period-caption">
              Periode: <strong>{getPeriodLabel()}</strong>
            </div>
          </div>

          <div className="dashboard-filter-right">
            <div
              className="filter-total-badge"
              title="Total seluruh surat terbit pada periode filter ini"
            >
              <FolderOpen size={14} />
              <span>
                Total:{" "}
                {Number(data.filter?.total ?? 0).toLocaleString("id-ID")} Surat
              </span>
            </div>
          </div>
        </div>

        <div className="services-stats-grid">
          {(data.services || []).map((s: any) => {
            const Icon = serviceIcons[s.slug] || FileText;
            const color = serviceColors[s.slug] || "blue";
            const count = Number(s.count) || 0;
            const cleanName = s.name.replace("Surat Keterangan ", "Keterangan ");
            return (
              <div
                className={`card stat-card service-stat-card ${count > 0 ? "has-count" : "zero-count"}`}
                key={s.id}
              >
                <div className={`stat-icon pill-${color}`}>
                  <Icon size={22} />
                </div>
                <div className="service-stat-content">
                  <div className="service-stat-header">
                    <span className="service-stat-code">{s.code || "SURAT"}</span>
                    <span
                      className={`pill pill-${color}`}
                      style={{ fontSize: 10, padding: "2px 8px" }}
                    >
                      {s.category || "Pelayanan"}
                    </span>
                  </div>
                  <div className="service-stat-title" title={s.name}>
                    {cleanName}
                  </div>
                  <div className="service-stat-value">
                    {count.toLocaleString("id-ID")}
                  </div>
                  <div className="service-stat-note">
                    {count > 0 ? (
                      <span style={{ color: "#009866", fontWeight: 600 }}>
                        ● {count} surat terbit
                      </span>
                    ) : (
                      <span>Belum ada surat</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="dashboard-charts">
        <Card
          title="Grafik Pelayanan Surat"
          description="Jumlah surat yang diterbitkan 6 bulan terakhir"
          icon={<ChartNoAxesCombined size={23} />}
          action={<span className="pill pill-blue">6 bulan terakhir</span>}
        >
          <div className="chart">
            <div className="chart-grid">
              {[
                max,
                Math.ceil(max * 0.75),
                Math.ceil(max * 0.5),
                Math.ceil(max * 0.25),
                0,
              ].map((n, i) => (
                <div key={i}>
                  <span>{n}</span>
                </div>
              ))}
            </div>
            {months.map((m) => (
              <div className="chart-column" key={m.key}>
                <div
                  className="chart-bar"
                  style={{ height: Math.max(2, (m.count / max) * 100) + "%" }}
                >
                  <span>{m.count}</span>
                </div>
                <small>{m.label}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card
          title="Jenis Surat Terbanyak"
          description="5 jenis surat yang paling sering diterbitkan"
          icon={<ChartPie size={23} />}
        >
          {data.popular.length ? (
            <div className="popular-list">
              {data.popular.map((p: Row, i: number) => (
                <div className="popular-item" key={p.name}>
                  <span
                    className={`rank pill-${["blue", "green", "orange", "purple", "pink"][i]}`}
                  >
                    {i + 1}
                  </span>
                  <div className="popular-info">
                    <div className="popular-label">
                      <span>
                        {p.name.replace("Surat Keterangan ", "Keterangan ")}
                      </span>
                      <b>{p.count}</b>
                    </div>
                    <div className="progress-track">
                      <div
                        style={{
                          width:
                            Math.max(3, (p.count / stats.issued) * 100) + "%",
                          background: [
                            "#168dff",
                            "#09c28c",
                            "#ffac32",
                            "#966cff",
                            "#fa6086",
                          ][i],
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Belum ada surat terbit"
              description="Ringkasan akan tampil setelah pelayanan pertama selesai."
            />
          )}
        </Card>
      </div>
      {village ? (
        <Card
          title="Surat Terbaru"
          description={`Aktivitas pelayanan terakhir di Kelurahan ${village.name}`}
          icon={<Clock size={23} />}
          action={
            <Link
              className="text-button row"
              href="/app/arsip"
              style={{ fontSize: 12 }}
            >
              Lihat Semua
              <ChevronRight size={15} />
            </Link>
          }
        >
          {recent.data?.items.length ? (
            <LetterTable items={recent.data.items.slice(0, 5)} />
          ) : (
            <Empty
              title="Mulai pelayanan pertama Anda"
              description="Pilih jenis surat, temukan penduduk, lalu terbitkan surat."
              action={
                user.role !== "PIMPINAN" ? (
                  <Button asChild>
                    <Link href="/app/pelayanan/baru/jenis-surat">
                      <Plus size={16} />
                      Buat Pelayanan
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      ) : (
        <Card
          title="Ringkasan Kelurahan"
          description="Aktivitas pelayanan per kelurahan"
          icon={<Building2 />}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kelurahan</th>
                  <th>Status</th>
                  <th>Jumlah pelayanan</th>
                </tr>
              </thead>
              <tbody>
                {data.villages.map((v: Row) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>
                      <span
                        className={`pill ${v.active ? "pill-green" : "pill-orange"}`}
                      >
                        {v.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>{v.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
export function Reports() {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const params = new URLSearchParams({ from, to }),
    { data, error } = useData("report?" + params);
  return (
    <>
      <PageHeader
        title="Laporan Pelayanan"
        description="Rekap surat terbit berdasarkan jenis surat dan kelurahan."
        action={
          <Button asChild variant="outline">
            <a href={"/api/report?" + params + "&download=1"}>
              <Download size={17} />
              Unduh CSV
            </a>
          </Button>
        }
      />
      <Card>
        <div className="toolbar">
          <label className="row">
            Dari{" "}
            <input
              aria-label="Tanggal awal laporan"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="row">
            Sampai{" "}
            <input
              aria-label="Tanggal akhir laporan"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Reset
          </Button>
        </div>
        {error ? (
          <Alert kind="error">{error}</Alert>
        ) : !data ? (
          <Loading />
        ) : data.items.length ? (
          <>
            <div className="card-body">
              <span className="muted">Total surat terbit</span>
              <h1>
                {data.items.reduce((n: number, r: Row) => n + r.count, 0)}
              </h1>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kelurahan</th>
                    <th>Jenis Surat</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r: Row, i: number) => (
                    <tr key={i}>
                      <td>{r.village}</td>
                      <td>{r.type}</td>
                      <td>
                        <b>{r.count}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Empty
            title="Belum ada surat terbit pada periode ini"
            description="Ubah rentang tanggal untuk melihat laporan lainnya."
          />
        )}
      </Card>
    </>
  );
}
