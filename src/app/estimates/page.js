import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { buildLoginRedirectPath } from "@/lib/auth-redirect";
import { listEstimatesForTenant } from "@/lib/estimates-list-server";
import { normalizeAppRole } from "@/lib/access-control";
import EstimatesPageClient from "./EstimatesPageClient";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function EstimatesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect(buildLoginRedirectPath("/estimates"));
  }

  let initialList = null;
  try {
    initialList = await listEstimatesForTenant({
      tenantDbId: session.tenantDbId,
      role: normalizeAppRole(session.role),
      page: 1,
    });
  } catch (error) {
    console.error("[estimates/page] initial list prefetch failed", error);
  }

  return <EstimatesPageClient initialList={initialList} />;
}
