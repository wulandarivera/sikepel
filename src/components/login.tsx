"use client";
import { APP_VERSION } from "@/lib/version";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LogIn,
  LockKeyhole,
  UserRound,
  ShieldCheck,
  Clock3,
  Files,
  ArrowRight,
} from "lucide-react";
import { send, Alert, SubmitButton } from "./common";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
export function Login() {
  const router = useRouter();
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [modal, setModal] = useState<"password" | "help" | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("expired"))
      setError("Sesi Anda telah berakhir. Silakan masuk kembali.");
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await send("login", {
        username: f.get("username"),
        password: f.get("password"),
        remember: f.get("remember") === "on",
      });
      router.push("/app/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidak dapat terhubung.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-art">
        <div className="login-motto">
          Melayani <i /> Mudah <i /> Transparan <i /> Untuk Warga
        </div>
        <div className="login-brand">
          <Image
            src="/assets/icon.webp"
            alt=""
            width={96}
            height={96}
            priority
          />
          <h1>
            SIKE<span>PEL</span>
          </h1>
          <p>Sistem Informasi Pelayanan Kelurahan</p>
          <div className="gold-line" />
          <h2>
            Pelayanan lebih cepat,
            <br />
            akurat, dan terpusat.
          </h2>
        </div>
        <div className="login-art-image" />
        <div className="login-benefits">
          <div>
            <Clock3 />
            <b>Lebih Cepat</b>
            <span>Pelayanan lebih efisien</span>
          </div>
          <div>
            <Files />
            <b>Lebih Mudah</b>
            <span>Dokumen terpusat</span>
          </div>
          <div>
            <ShieldCheck />
            <b>Lebih Tertib</b>
            <span>Arsip terjaga</span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <header>
            <p>Selamat Datang di</p>
            <Image
              src="/assets/logo.webp"
              width={250}
              height={166}
              alt="SIKEPEL"
              className="login-logo"
              priority
            />
            <h2>Masuk petugas</h2>
            <div className="gold-line" />
            <p className="login-instruction">
              Masuk untuk melanjutkan pelayanan
            </p>
          </header>
          <form onSubmit={submit}>
            {error && <Alert kind="error">{error}</Alert>}
            <label htmlFor="username">Username</label>
            <div className="login-input">
              <UserRound size={20} />
              <input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Masukkan username"
                required
              />
            </div>
            <label htmlFor="password">Kata sandi</label>
            <div className="login-input">
              <LockKeyhole size={20} />
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi"
                required
              />
              <button
                type="button"
                aria-label={
                  show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                }
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            <div className="login-options">
              <label>
                <input type="checkbox" name="remember" /> Ingat saya
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() => setModal("password")}
              >
                Lupa kata sandi?
              </button>
            </div>
            <SubmitButton busy={busy} type="submit" className="login-submit">
              <LogIn size={20} />
              Masuk
              <ArrowRight size={19} />
            </SubmitButton>
          </form>
          <div className="login-note">
            <ShieldCheck size={22} />
            <span>
              Gunakan akun yang diberikan oleh administrator kelurahan Anda.
            </span>
          </div>
        </div>
        <footer>
          © {new Date().getFullYear()} SIKEPEL
          <small className="muted">Versi {APP_VERSION}</small>
          <button className="text-button" onClick={() => setModal("help")}>
            Bantuan masuk
          </button>
        </footer>
      </section>
      <Modal
        open={modal === "password"}
        onOpenChange={(v) => !v && setModal(null)}
        title="Ubah & Lupa Kata Sandi"
        description="Pengaturan ulang kata sandi akun pelayanan."
      >
        <div className="stack" style={{ gap: 12 }}>
          <p>
            Untuk menjaga keamanan data kependudukan dan ketertiban sistem pelayanan,
            pengaturan ulang (reset) atau perubahan kata sandi dilakukan melalui Administrator.
          </p>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              background: "var(--surface-sunken, #f1f5f9)",
              border: "1px solid var(--border, #e2e8f0)",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            Silakan <strong>hubungi Admin Kelurahan</strong> atau <strong>Super Admin Kecamatan</strong> untuk melakukan reset kata sandi atau penerbitan kredensial baru akun Anda.
          </div>
          <p className="muted" style={{ fontSize: "12px" }}>
            Administrator dapat mengatur ulang kata sandi Anda melalui menu <strong>Pengguna</strong> pada panel administrasi.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button type="button" onClick={() => setModal(null)}>
              Mengerti
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={modal === "help"}
        onOpenChange={(v) => !v && setModal(null)}
        title="Bantuan Masuk"
        description="Kendala akses akun dan sistem pelayanan SIKEPEL."
      >
        <div className="stack" style={{ gap: 12 }}>
          <p>
            Jika Anda mengalami kendala saat masuk ke sistem, belum memiliki akun, atau akun Anda dinonaktifkan:
          </p>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              background: "var(--surface-sunken, #f1f5f9)",
              border: "1px solid var(--border, #e2e8f0)",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            Silakan <strong>hubungi Admin Kelurahan</strong> atau <strong>Administrator Sistem</strong> setempat untuk pemeriksaan status akun dan hak akses Anda.
          </div>
          <p className="muted" style={{ fontSize: "12px" }}>
            Pastikan username dan kata sandi yang Anda masukkan sudah benar dan sesuai dengan hak akses yang terdaftar.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button type="button" onClick={() => setModal(null)}>
              Mengerti
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
