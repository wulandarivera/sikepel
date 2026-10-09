import { waDashboard } from "@/server/wa-dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: Request) { return waDashboard(req, "status"); }
