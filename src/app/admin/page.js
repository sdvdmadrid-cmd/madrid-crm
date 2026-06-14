import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { buildLoginRedirectPath } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

/**
 * Legacy /admin entry — canonical platform console is /owner/overview.
 */
export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);
  const role = String(session?.role || "").toLowerCase();

  if (!session || role !== "super_admin") {
    redirect(buildLoginRedirectPath("/owner/overview"));
  }

  redirect("/owner/overview");
}
