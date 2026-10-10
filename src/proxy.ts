import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const hosts = [request.nextUrl.hostname, request.headers.get("host")?.split(":")[0], request.headers.get("x-forwarded-host")?.split(":")[0]];
  if (hosts.includes("wa.sikepel.biz.id")) {
    const pathname = request.nextUrl.pathname;
    const destination = request.nextUrl.clone();
    if (pathname === "/" || pathname === "/login") {
      destination.pathname = pathname === "/" ? "/wa" : "/wa/login";
      return NextResponse.rewrite(destination);
    }
    // Existing shared login redirects here; no operator workspace is exposed.
    if (pathname === "/app/dashboard") {
      destination.pathname = "/wa";
      return NextResponse.redirect(destination);
    }
    const allowed = [
      "/wa",
      "/wa/login",
      "/api/login",
      "/api/wa/status",
      "/api/wa/send",
      "/api/wa/logout",
      "/assets/icon.webp",
      "/assets/logo.webp",
    ].includes(pathname) ||
      pathname === "/api/wa/auto-replies" ||
      pathname.startsWith("/api/wa/auto-replies/") ||
      pathname.startsWith("/_next/static/");
    if (!allowed) return new NextResponse("Tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (hosts.includes("mandiri.sikepel.biz.id")) {
    const pathname = request.nextUrl.pathname;
    if (pathname === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = "/mandiri";
      return NextResponse.rewrite(destination);
    }
    const allowed =
      pathname === "/mandiri" ||
      pathname.startsWith("/mandiri/") ||
      pathname.startsWith("/api/mandiri/") ||
      pathname.startsWith("/_next/static/") ||
      pathname.startsWith("/assets/");
    if (!allowed) return new NextResponse("Tidak ditemukan.", {status:404,headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.next();
}
