import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export default async function EstimateBuilderLayout({ children }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session) {
    redirect("/login?next=/estimates/new");
  }

  const enabled = await isPlatformFeatureEnabled("feature_estimate_builder", true);
  if (!enabled) {
    redirect("/estimates/new");
  }

  return <Suspense fallback={null}>{children}</Suspense>;
}
