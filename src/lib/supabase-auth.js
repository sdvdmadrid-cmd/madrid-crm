import "server-only";

import { createClient } from "@supabase/supabase-js";
import { normalizeAppRole } from "@/lib/access-control";
import { isPlatformOperatorEmail } from "@/lib/platform-operator";
import { getSessionFromRequest } from "@/lib/auth";
import { applyComplimentarySessionFields, isComplimentaryTenant } from "@/lib/complimentary-access";
import { resolveSubscriptionAccess } from "@/lib/subscription-access-core";
import { ensureProfileForUser, getProfileByUserId } from "@/lib/profiles";

let supabaseAdminClientPromise = null;
const DEFAULT_DEV_ORIGIN = "http://localhost:3000";

async function getSupabaseAdminClient() {
  if (!supabaseAdminClientPromise) {
    supabaseAdminClientPromise = import("@/lib/supabase-admin").then(
      (module) => module.supabaseAdmin,
    );
  }
  return supabaseAdminClientPromise;
}

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return { supabaseUrl, supabasePublishableKey };
}

export function createSupabaseServerAuthClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
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

  const tenantDbId =
      profile?.tenantId ||
      appMetadata.tenant_db_id ||
      appMetadata.tenantDbId ||
      user?.id ||
      null;

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
    tenantDbId,
    role: normalizeAppRole(
      // Platform operator emails always resolve to super_admin (Mission Control).
      appMetadata.role === "super_admin" || isPlatformOperatorEmail(user?.email)
        ? "super_admin"
        : profile?.role || appMetadata.role || userMetadata.role,
    ),
    businessType: userMetadata.businessType || userMetadata.industry || "",
    isSubscribed: userMetadata.isSubscribed === true,
    billPaymentsSubscribed: userMetadata.billPaymentsSubscribed === true,
    trialEndDate: userMetadata.trialEndDate || null,
    complimentaryAccess:
      userMetadata.complimentaryAccess === true ||
      isComplimentaryTenant(tenantDbId),
    emailConfirmedAt: user?.email_confirmed_at || null,
    appMetadata,
    userMetadata,
  };
}

/**
 * Ensures platform operator emails keep super_admin in app_metadata after login.
 * Strips mistaken super_admin from tenant users.
 */
export async function reconcileUserRoleOnLogin(user) {
  if (!user?.id || !user?.email) {
    return user;
  }

  const email = String(user.email).trim().toLowerCase();
  const currentRole = String(user.app_metadata?.role || "").toLowerCase();
  const shouldBeSuperAdmin = isPlatformOperatorEmail(email);

  if (shouldBeSuperAdmin && currentRole !== "super_admin") {
    try {
      const supabaseAdmin = await getSupabaseAdminClient();
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          app_metadata: {
            ...(user.app_metadata || {}),
            role: "super_admin",
          },
        },
      );
      if (error) {
        console.warn("[supabase-auth] reconcileUserRoleOnLogin failed", error.message);
        return user;
      }
      return data?.user || user;
    } catch (error) {
      console.warn(
        "[supabase-auth] reconcileUserRoleOnLogin error",
        error instanceof Error ? error.message : error,
      );
      return user;
    }
  }

  if (!shouldBeSuperAdmin && currentRole === "super_admin") {
    const fallbackRole =
      String(user.user_metadata?.role || "").toLowerCase() === "owner"
        ? "owner"
        : "owner";
    try {
      const supabaseAdmin = await getSupabaseAdminClient();
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          app_metadata: {
            ...(user.app_metadata || {}),
            role: fallbackRole,
          },
        },
      );
      if (error) {
        console.warn(
          "[supabase-auth] reconcileUserRoleOnLogin downgrade failed",
          error.message,
        );
        return user;
      }
      return data?.user || user;
    } catch (error) {
      console.warn(
        "[supabase-auth] reconcileUserRoleOnLogin downgrade error",
        error instanceof Error ? error.message : error,
      );
      return user;
    }
  }

  return user;
}

export async function syncTenantDbIdToAppMetadata(user, profile = null) {
  if (!user?.id) {
    return user;
  }

  const tenantDbId =
    profile?.tenantId ||
    profile?.tenant_id ||
    user.app_metadata?.tenant_db_id ||
    user.app_metadata?.tenantDbId ||
    user.id;

  const current =
    user.app_metadata?.tenant_db_id || user.app_metadata?.tenantDbId || null;

  if (String(current) === String(tenantDbId)) {
    return user;
  }

  try {
    const supabaseAdmin = await getSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata || {}),
        tenant_db_id: tenantDbId,
      },
    });

    if (error) {
      console.warn("[supabase-auth] syncTenantDbIdToAppMetadata failed", error.message);
      return user;
    }

    return data?.user || user;
  } catch (error) {
    console.warn(
      "[supabase-auth] syncTenantDbIdToAppMetadata unexpected error",
      error instanceof Error ? error.message : error,
    );
    return user;
  }
}

export async function resolveProfileForUser(user, fallback = {}) {
  if (!user?.id) {
    return null;
  }

  const existing = await getProfileByUserId(user.id);
  if (existing) {
    await syncTenantDbIdToAppMetadata(user, existing);
    return existing;
  }

  const fallbackTenantId =
    fallback.tenantId ||
    user?.app_metadata?.tenant_db_id ||
    user?.app_metadata?.tenantDbId ||
    user?.id;

  const created = await ensureProfileForUser({
    userId: user.id,
    tenantId: fallbackTenantId,
    role:
      fallback.role || user?.app_metadata?.role || user?.user_metadata?.role,
  });
  await syncTenantDbIdToAppMetadata(user, created);
  return created;
}

export function buildAppSessionFromSupabaseUser(
  user,
  authSession = null,
  profile = null,
  subscriptionFields = {},
) {
  const normalized = normalizeAuthUser(user, profile);
  const base = applyComplimentarySessionFields({
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
    billPaymentsSubscribed: normalized.billPaymentsSubscribed,
    trialEndDate: normalized.trialEndDate,
    complimentaryAccess: normalized.complimentaryAccess,
    stripeSubscriptionStatus: subscriptionFields.stripeSubscriptionStatus || "",
    supabaseAccessToken: authSession?.access_token || null,
    supabaseRefreshToken: authSession?.refresh_token || null,
  });

  const access = resolveSubscriptionAccess(base);
  return {
    ...base,
    hasBusinessAccess: access.hasBusinessAccess,
    subscriptionState: access.state,
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

function getFirstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function getProxyOrHostRequestOrigin(request) {
  const forwardedProto = getFirstHeaderValue(
    request?.headers?.get("x-forwarded-proto"),
  ).toLowerCase();
  const forwardedHost = getFirstHeaderValue(
    request?.headers?.get("x-forwarded-host"),
  ).toLowerCase();

  if (forwardedProto && forwardedHost) {
    return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
  }

  const directHost = getFirstHeaderValue(request?.headers?.get("host")).toLowerCase();
  if (!directHost) {
    return "";
  }

  let inferredProto = forwardedProto;
  if (!inferredProto) {
    inferredProto = normalizeOrigin(request?.url).startsWith("https://")
      ? "https"
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";
  }

  return normalizeOrigin(`${inferredProto}://${directHost}`);
}

function getHeaderRequestOrigin(request) {
  const hostOrigin = getProxyOrHostRequestOrigin(request);
  const isProduction = process.env.NODE_ENV === "production";
  const originHeader = normalizeOrigin(request?.headers?.get("origin"));
  if (
    originHeader &&
    (!isProduction || !hostOrigin || originHeader === hostOrigin)
  ) {
    return originHeader;
  }

  const refererHeader = normalizeOrigin(request?.headers?.get("referer"));
  if (
    refererHeader &&
    (!isProduction || !hostOrigin || refererHeader === hostOrigin)
  ) {
    return refererHeader;
  }

  if (isProduction && hostOrigin) {
    if (originHeader && originHeader !== hostOrigin) {
      console.warn("[supabase-auth] Ignoring mismatched Origin header", {
        originHeader,
        hostOrigin,
      });
    }
    if (refererHeader && refererHeader !== hostOrigin) {
      console.warn("[supabase-auth] Ignoring mismatched Referer header", {
        refererHeader,
        hostOrigin,
      });
    }
  }

  return hostOrigin;
}

function isUsableRequestOrigin(origin, isProduction) {
  return Boolean(origin) && (!isProduction || !isLocalOrigin(origin));
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

  const headerOrigin = getHeaderRequestOrigin(request);
  if (isUsableRequestOrigin(headerOrigin, isProduction)) {
    return headerOrigin;
  }

  const requestOrigin = normalizeOrigin(request?.url);
  if (isUsableRequestOrigin(requestOrigin, isProduction)) {
    return requestOrigin;
  }

  if (!isProduction) {
    return headerOrigin || requestOrigin || "";
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
  const candidates = buildOriginCandidates(origin);
  const baseOrigin = candidates[0];

  if (baseOrigin) {
    return `${baseOrigin}/auth/callback`;
  }

  return process.env.NODE_ENV === "production"
    ? ""
    : `${DEFAULT_DEV_ORIGIN}/auth/callback`;
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
  if (!callbackUrl) {
    throw new Error(
      "Unable to determine the public app URL for verification links. Configure APP_URL or APP_BASE_URL, or access the app through its public URL.",
    );
  }
  const confirmToken = createEmailConfirmToken(userId, email);
  const verifyUrl = `${callbackUrl}?vt=${encodeURIComponent(confirmToken)}`;

  return { verifyUrl, callbackUrl };
}

export async function generatePasswordRecoveryLink({ email, origin }) {
  const supabaseAdmin = await getSupabaseAdminClient();
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
      user: data?.user || null,
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
  const supabaseAdmin = await getSupabaseAdminClient();
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
