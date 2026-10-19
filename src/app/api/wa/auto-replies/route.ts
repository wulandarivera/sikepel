import { waDashboard } from "@/server/wa-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return waDashboard(req, "auto-replies");
}

export function POST(req: Request) {
  return waDashboard(req, "auto-replies");
}

export function PUT(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || undefined;
  return waDashboard(req, "auto-replies", id);
}

export function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || undefined;
  return waDashboard(req, "auto-replies", id);
}
