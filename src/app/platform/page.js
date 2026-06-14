import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { buildLoginRedirectPath } from "@/lib/auth-redirect";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect(buildLoginRedirectPath("/owner/overview"));
  }

  const role = String(session.role || "").toLowerCase();
  if (role !== "super_admin") {
    redirect("/dashboard");
  }

  redirect("/owner/overview");
}
