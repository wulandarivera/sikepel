import { waDashboard } from "@/server/wa-dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(req: Request) { return waDashboard(req, "send"); }
