import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const hosts = [request.nextUrl.hostname, request.headers.get("host")?.split(":")[0], request.headers.get("x-forwarded-host")?.split(":")[0]];
  if (hosts.includes("mandiri.sikepel.biz.id")) {
    const pathname = request.nextUrl.pathname;
    if (pathname === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = "/mandiri";
      return NextResponse.rewrite(destination);
    }
    const allowed = pathname === "/mandiri" || pathname.startsWith("/mandiri/") || pathname.startsWith("/api/mandiri/") || pathname.startsWith("/_next/static/");
    if (!allowed) return new NextResponse("Tidak ditemukan.", {status:404,headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.next();
}
