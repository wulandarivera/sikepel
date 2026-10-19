import { waDashboard } from "@/server/wa-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  return waDashboard(req, "auto-replies", id);
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  return waDashboard(req, "auto-replies", id);
}
