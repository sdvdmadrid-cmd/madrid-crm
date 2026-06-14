import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { buildLoginRedirectPath } from "@/lib/auth-redirect";
import { listInvoicesForTenant } from "@/lib/invoices-list-server";
import { normalizeAppRole } from "@/lib/access-control";
import InvoicesPageClient from "./InvoicesPageClient";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function InvoicesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect(buildLoginRedirectPath("/invoices"));
  }

  let initialList = null;
  try {
    initialList = await listInvoicesForTenant({
      tenantDbId: session.tenantDbId,
      role: normalizeAppRole(session.role),
      page: 1,
    });
  } catch (error) {
    console.error("[invoices/page] initial list prefetch failed", error);
  }

  return <InvoicesPageClient initialList={initialList} />;
}
