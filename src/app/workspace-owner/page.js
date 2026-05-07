import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function OwnerWorkspacePage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    redirect("/login");
  }

  const session = verifySessionToken(sessionToken);
  if (!session?.userId) {
    redirect("/login");
  }

  // Check if super admin
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(session.userId);
  const userRole = String(userData?.user?.app_metadata?.role || "").toLowerCase();

  if (userRole === "super_admin") {
    redirect("/admin/settings");
  }

  redirect("/dashboard");
}
