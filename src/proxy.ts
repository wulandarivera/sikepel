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
    const imageUrl = request.nextUrl.searchParams.get("url") || "";
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
      pathname.startsWith("/_next/static/") ||
      (pathname === "/_next/image" && imageUrl.startsWith("/assets/"));
    if (!allowed) return new NextResponse("Tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (hosts.includes("mandiri.sikepel.biz.id")) {
    const pathname = request.nextUrl.pathname;
    if (pathname === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = "/mandiri";
      return NextResponse.rewrite(destination);
    }
    if (pathname === "/ajukan" || pathname.startsWith("/ajukan/")) {
      const destination = request.nextUrl.clone();
      destination.pathname = pathname.replace(/^\/ajukan/, "/mandiri/ajukan");
      return NextResponse.rewrite(destination);
    }
    if (pathname === "/lacak" || pathname.startsWith("/lacak/")) {
      const destination = request.nextUrl.clone();
      destination.pathname = pathname.replace(/^\/lacak/, "/mandiri/lacak");
      return NextResponse.rewrite(destination);
    }
    const allowed =
      pathname === "/mandiri" ||
      pathname.startsWith("/mandiri/") ||
      pathname.startsWith("/api/mandiri/") ||
      pathname.startsWith("/_next/static/") ||
      pathname.startsWith("/_next/image") ||
      pathname.startsWith("/assets/");
    if (!allowed) return new NextResponse("Tidak ditemukan.", {status:404,headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.next();
}
