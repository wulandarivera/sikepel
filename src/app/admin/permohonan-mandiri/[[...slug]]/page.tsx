import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/server/security";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function AdminPermohonanMandiriPage() {
  const user = await sessionUser(
    (await cookies()).get("sikepel_session")?.value,
  );
  if (!user) redirect("/login");
  return <Workspace />;
}
