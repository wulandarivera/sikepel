import { Login } from "@/components/login";
import { redirect } from "next/navigation";
import { getDB } from "@/server/db";
import { setupPending } from "@/server/setup";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await setupPending(await getDB())) redirect("/setup");
  return <Login />;
}
