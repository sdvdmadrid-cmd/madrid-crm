/** Lets platform owners preview the contractor CRM (same UI as localhost dev-login). */

export const CONTRACTOR_WORKSPACE_COOKIE = "fb_contractor_workspace";

export function readContractorWorkspaceCookie(cookieHeader) {
  const raw = String(cookieHeader || "");
  if (!raw) return false;
  const match = raw.match(
    new RegExp(`(?:^|;\\s*)${CONTRACTOR_WORKSPACE_COOKIE}=([^;]+)`),
  );
  return String(match?.[1] || "").trim() === "1";
}

export function contractorWorkspaceCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    name: CONTRACTOR_WORKSPACE_COOKIE,
    value: "1",
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
