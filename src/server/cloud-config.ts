type Environment = Record<string, string | undefined>;
export function cloudConfigErrors(env: Environment = process.env): string[] {
  const errors: string[] = [];
  for (const key of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BUCKET", "PDF_CONVERTER_URL"])
    if (!env[key]?.trim()) errors.push(`${key} wajib diisi`);
  if (!env.PDF_CONVERTER_TOKEN && !(env.PDF_CONVERTER_USERNAME && env.PDF_CONVERTER_PASSWORD))
    errors.push("Isi PDF_CONVERTER_USERNAME dan PDF_CONVERTER_PASSWORD, atau PDF_CONVERTER_TOKEN untuk gateway Bearer");
  for (const key of ["SUPABASE_URL", "PDF_CONVERTER_URL"]) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]!);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
        errors.push(`${key} harus URL HTTPS tanpa kredensial/query`);
    } catch { errors.push(`${key} tidak valid`); }
  }
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) errors.push("DATABASE_URL harus PostgreSQL");
      if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || ""))
        errors.push("DATABASE_URL harus memakai sslmode=require atau verify-full");
    } catch { errors.push("DATABASE_URL tidak valid"); }
  }
  if (env.SUPABASE_BUCKET && !/^[a-zA-Z0-9_-]+$/.test(env.SUPABASE_BUCKET)) errors.push("SUPABASE_BUCKET tidak valid");
  if (env.PDF_CONVERTER_PROVIDER && !["gotenberg", "convertapi"].includes(env.PDF_CONVERTER_PROVIDER))
    errors.push("PDF_CONVERTER_PROVIDER harus gotenberg atau convertapi");
  if ((env.PDF_CONVERTER_PROVIDER === "convertapi" || /convertapi\.com/i.test(env.PDF_CONVERTER_URL || "")) && !env.PDF_CONVERTER_TOKEN)
    errors.push("PDF_CONVERTER_TOKEN wajib diisi untuk ConvertAPI");
  return errors;
}
export function assertCloudConfig() {
  if (process.env.VERCEL !== "1") return;
  const errors = cloudConfigErrors();
  if (errors.length) throw new Error(`Konfigurasi cloud belum lengkap: ${errors.join("; ")}`);
}
export const maxTemplateBytes = () => (process.env.VERCEL === "1" ? 4 : 10) * 1024 * 1024;
