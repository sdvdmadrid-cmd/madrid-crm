import "server-only";

import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export async function getSuperAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);
  if (!session || String(session.role || "").toLowerCase() !== "super_admin") {
    return null;
  }
  return session;
}
