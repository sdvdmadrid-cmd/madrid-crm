import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { listClientsForTenant } from "@/lib/clients-list-server";
import { normalizeAppRole } from "@/lib/access-control";
import ClientsPageClient from "./ClientsPageClient";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function ClientsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect("/login?next=/clients");
  }

  let initialList = null;
  try {
    initialList = await listClientsForTenant({
      tenantDbId: session.tenantDbId,
      role: normalizeAppRole(session.role),
      page: 1,
    });
  } catch (error) {
    console.error("[clients/page] initial list prefetch failed", error);
  }

  return <ClientsPageClient initialList={initialList} />;
}
