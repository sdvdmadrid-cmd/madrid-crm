import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function OwnerEntryPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect("/login?redirect=%2Fadmin");
  }

  if (String(session.role || "").toLowerCase() === "super_admin") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
