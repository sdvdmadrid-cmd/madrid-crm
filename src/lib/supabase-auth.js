import "server-only";

import { createClient } from "@supabase/supabase-js";
import { normalizeAppRole } from "@/lib/access-control";
import { getSessionFromRequest } from "@/lib/auth";
import { ensureProfileForUser, getProfileByUserId } from "@/lib/profiles";
import { supabaseAdmin } from "@/lib/supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

export function createSupabaseServerAuthClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function normalizeAuthUser(user, profile = null) {
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};

  return {
    id: user?.id || "",
    email: user?.email || "",
    name: userMetadata.name || userMetadata.fullName || "",
    companyName: userMetadata.companyName || "",
    tenantId:
      appMetadata.tenant_id ||
      appMetadata.tenantId ||
      userMetadata.tenant_id ||
      userMetadata.tenantId ||
      "default",
    tenantDbId:
      profile?.tenantId ||
      appMetadata.tenant_db_id ||
      appMetadata.tenantDbId ||
      user?.id ||
      null,
    role: normalizeAppRole(
      // app_metadata.role=super_admin always wins — profiles table constraint
      // does not allow that value so it can only come from app_metadata.
      appMetadata.role === "super_admin"
        ? "super_admin"
        : profile?.role || appMetadata.role || userMetadata.role,
    ),
    businessType: userMetadata.businessType || userMetadata.industry || "",
    isSubscribed: userMetadata.isSubscribed === true,
    trialEndDate: userMetadata.trialEndDate || null,
    emailConfirmedAt: user?.email_confirmed_at || null,
    appMetadata,
    userMetadata,
  };
}

export async function resolveProfileForUser(user, fallback = {}) {
  if (!user?.id) {
    return null;
  }

  const existing = await getProfileByUserId(user.id);
  if (existing) {
    return existing;
  }

  const fallbackTenantId =
    fallback.tenantId ||
    user?.app_metadata?.tenant_db_id ||
    user?.app_metadata?.tenantDbId ||
    user?.id;

  return ensureProfileForUser({
    userId: user.id,
    tenantId: fallbackTenantId,
    role:
      fallback.role || user?.app_metadata?.role || user?.user_metadata?.role,
  });
}

export function buildAppSessionFromSupabaseUser(
  user,
  authSession = null,
  profile = null,
) {
  const normalized = normalizeAuthUser(user, profile);
  return {
    userId: normalized.id,
    tenantId: normalized.tenantId,
    tenantDbId: normalized.tenantDbId,
    email: normalized.email,
    name: normalized.name,
    companyName: normalized.companyName || "",
    role: normalized.role,
    businessType: normalized.businessType,
    industry: normalized.businessType,
    isSubscribed: normalized.isSubscribed,
    trialEndDate: normalized.trialEndDate,
    supabaseAccessToken: authSession?.access_token || null,
    supabaseRefreshToken: authSession?.refresh_token || null,
  };
}

export async function getSupabaseUserFromRequest(request) {
  const session = getSessionFromRequest(request);
  let accessToken = String(session?.supabaseAccessToken || "").trim();
  const refreshToken = String(session?.supabaseRefreshToken || "").trim();
  if (!accessToken && !refreshToken) {
    return { user: null, error: null };
  }

  const authClient = createSupabaseServerAuthClient();
  if (refreshToken) {
    const { data: sessionData, error: sessionError } =
      await authClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

    if (!sessionError && sessionData?.session?.access_token) {
      accessToken = sessionData.session.access_token;
    }
  }

  if (!accessToken) {
    return { user: null, error: null };
  }

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  return { user: user || null, error: error || null };
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.origin;
  } catch {
    return "";
  }
}

function isLocalOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function getForwardedRequestOrigin(request) {
  const proto = String(request?.headers?.get("x-forwarded-proto") || "")
    .trim()
    .toLowerCase();
  const host = String(request?.headers?.get("x-forwarded-host") || "")
    .trim()
    .toLowerCase();

  if (!proto || !host) {
    return "";
  }

  return normalizeOrigin(`${proto}://${host}`);
}

export function getRequestOrigin(request) {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredOrigin =
    normalizeOrigin(process.env.APP_URL) ||
    normalizeOrigin(process.env.APP_BASE_URL);

  if (configuredOrigin) {
    if (isProduction && isLocalOrigin(configuredOrigin)) {
      // In production, never use a localhost URL
      console.error(
        "[supabase-auth] Ignoring localhost APP_URL/APP_BASE_URL in production",
      );
    } else if (!isProduction && !isLocalOrigin(configuredOrigin)) {
      // In development, ignore a production URL — use the actual request origin instead
      // so verification links point to localhost, not the production server.
    } else {
      return configuredOrigin;
    }
  }

  const forwardedOrigin = getForwardedRequestOrigin(request);
  if (forwardedOrigin) {
    return forwardedOrigin;
  }

  const requestOrigin = normalizeOrigin(request?.url);
  if (requestOrigin && isProduction) {
    return requestOrigin;
  }

  if (!isProduction && requestOrigin) {
    return requestOrigin;
  }

  return "";
}

function buildOriginCandidates(origin) {
  const candidates = [];
  const isProduction = process.env.NODE_ENV === "production";
  const push = (value) => {
    const normalized = normalizeOrigin(value);
    if (!normalized) return;
    // In development, skip production (non-local) URLs so links point to localhost
    if (!isProduction && !isLocalOrigin(normalized)) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  push(origin);
  push(process.env.APP_URL);
  push(process.env.APP_BASE_URL);

  return candidates;
}

export function getAuthCallbackUrl(origin) {
  const productionCallback = "https://fieldbaseapp.net/auth/callback";
  if (process.env.NODE_ENV === "production") {
    return productionCallback;
  }

  const candidates = buildOriginCandidates(origin);
  const baseOrigin = candidates[0] || "http://localhost:3000";
  return `${baseOrigin}/auth/callback`;
}

export async function generateSignupVerificationLink({ email, origin, userId }) {
  if (!userId) {
    throw new Error("userId is required to generate a signed verification token");
  }

  // Use our own HMAC-signed JWT for email verification.
  // This bypasses the fragile verifyOtp / token_hash / SSR-cookie flow entirely.
  // The callback verifies this token, confirms the user via admin API, and builds
  // the app session directly — no Supabase SSR client involved.
  const { createEmailConfirmToken } = await import("@/lib/auth");
  const callbackUrl = getAuthCallbackUrl(origin);
  const confirmToken = createEmailConfirmToken(userId, email);
  const verifyUrl = `${callbackUrl}?vt=${encodeURIComponent(confirmToken)}`;

  return { verifyUrl, callbackUrl };
}

export async function generatePasswordRecoveryLink({ email, origin }) {
  const errors = [];
  const candidates = buildOriginCandidates(origin);

  for (const candidate of candidates) {
    const redirectTo = `${candidate}/reset-password`;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error) {
      errors.push(`redirect=${redirectTo} error=${error.message || "unknown"}`);
      continue;
    }

    const tokenHash = data?.properties?.hashed_token;
    if (!tokenHash) {
      errors.push(
        `redirect=${redirectTo} error=Supabase did not return a recovery token`,
      );
      continue;
    }

    return {
      tokenHash,
      resetUrl: `${redirectTo}?token=${tokenHash}`,
    };
  }

  throw new Error(
    `Unable to generate password recovery link: ${errors.join(" | ") || "no valid origin candidates"}`,
  );
}

export async function sendPasswordRecoveryEmailViaSupabase({ email, origin }) {
  const authClient = createSupabaseServerAuthClient();
  const errors = [];

  const normalizeUrl = (value) => String(value || "").trim().replace(/\/$/, "");
  const redirectCandidates = [];

  const requestOrigin = normalizeUrl(origin);
  const appUrl = normalizeUrl(process.env.APP_URL);
  const appBaseUrl = normalizeUrl(process.env.APP_BASE_URL);

  for (const candidate of [requestOrigin, appUrl, appBaseUrl]) {
    if (!candidate) continue;
    const redirectTo = `${candidate}/reset-password`;
    if (!redirectCandidates.includes(redirectTo)) {
      redirectCandidates.push(redirectTo);
    }
  }

  for (const redirectTo of redirectCandidates) {
    const { error } = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (!error) {
      return { success: true, redirectTo };
    }

    errors.push(`redirect=${redirectTo} error=${error.message || "unknown"}`);
  }

  // Last fallback: let Supabase use its configured Site URL.
  const { error: fallbackError } = await authClient.auth.resetPasswordForEmail(email);
  if (!fallbackError) {
    return { success: true, redirectTo: null };
  }

  errors.push(`default error=${fallbackError.message || "unknown"}`);
  throw new Error(`Supabase recovery email failed: ${errors.join(" | ")}`);
}

export async function listAllAuthUsers() {
  const users = [];
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }

  return users;
}

export async function findAuthUserByEmail(email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) return null;

  const users = await listAllAuthUsers();
  return (
    users.find(
      (user) =>
        String(user.email || "")
          .trim()
          .toLowerCase() === normalizedEmail,
    ) || null
  );
}

export async function countAuthUsersInTenant(tenantId) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) return 0;

  const users = await listAllAuthUsers();
  return users.filter((user) => {
    const normalized = normalizeAuthUser(user);
    return normalized.tenantId === normalizedTenantId;
  }).length;
}

export async function generateUniqueTenantId(seed) {
  const users = await listAllAuthUsers();
  const existingTenantIds = new Set(
    users.map((user) => normalizeAuthUser(user).tenantId).filter(Boolean),
  );

  const base = String(seed || "workspace") || "workspace";
  let candidate = base;
  let suffix = 1;

  while (existingTenantIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
