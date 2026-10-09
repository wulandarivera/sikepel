import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/server/security";
import { waAccess } from "@/lib/wa-dashboard";
import { WaDashboard } from "@/components/wa-dashboard";
import "./wa.css";
export const dynamic = "force-dynamic";
export default async function WaPage() {
  const user = await sessionUser((await cookies()).get("sikepel_session")?.value);
  if (!user) redirect("/wa/login");
  if (!waAccess(user, process.env.WA_GATEWAY_VILLAGE_ID)) return <main className="wa-shell"><h1>Akses dashboard dibatasi</h1><p>Gunakan akun operator atau administrator dalam lingkup kelurahan gateway. Hubungi administrator untuk konfigurasi akses.</p><a href="/wa/login">Masuk dengan akun lain</a></main>;
  return <WaDashboard />;
}
