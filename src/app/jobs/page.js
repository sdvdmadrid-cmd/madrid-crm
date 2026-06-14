import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { buildLoginRedirectPath } from "@/lib/auth-redirect";
import { listJobsForTenant } from "@/lib/jobs-list-server";
import { normalizeAppRole } from "@/lib/access-control";
import JobsPageClient from "./JobsPageClient";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function JobsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect(buildLoginRedirectPath("/jobs"));
  }

  let initialList = null;
  try {
    initialList = await listJobsForTenant({
      tenantDbId: session.tenantDbId,
      role: normalizeAppRole(session.role),
      page: 1,
    });
  } catch (error) {
    console.error("[jobs/page] initial list prefetch failed", error);
  }

  return <JobsPageClient initialList={initialList} />;
}
