import { normalizeAppRole } from "@/lib/access-control";
import { buildSessionCookie, createSessionToken } from "@/lib/auth";
import {
  buildLegalCookieValue,
  LEGAL_COOKIE_MAX_AGE,
  LEGAL_COOKIE_NAME,
} from "@/lib/legal";
import { getCurrentLegalVersionForTenant } from "@/lib/legal-versions";
import { upsertProfile } from "@/lib/profiles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildAppSessionFromSupabaseUser,
  findAuthUserByEmail,
} from "@/lib/supabase-auth";

const DEV_PROFILES = {
  super_admin: {
    tenantId: process.env.DEV_SUPERADMIN_TENANT_ID || "platform",
    email: (process.env.DEV_SUPERADMIN_EMAIL || "owner@FieldBase.local")
      .trim()
      .toLowerCase(),
    password: String(process.env.DEV_SUPERADMIN_PASSWORD || "").trim(),
    name: process.env.DEV_SUPERADMIN_NAME || "Platform Owner",
    role: "super_admin",
  },
  admin: {
    tenantId: process.env.DEV_ADMIN_TENANT_ID || "platform",
    email: (process.env.DEV_ADMIN_EMAIL || "contractor@FieldBase.local")
      .trim()
      .toLowerCase(),
    password: String(process.env.DEV_ADMIN_PASSWORD || "").trim(),
    name: process.env.DEV_ADMIN_NAME || "Contractor Admin",
    role: "admin",
  },
  viewer: {
    tenantId: process.env.DEV_VIEWER_TENANT_ID || process.env.DEV_ADMIN_TENANT_ID || "tenant-admin",
    email: (process.env.DEV_VIEWER_EMAIL || "viewer@fieldbase.local")
      .trim()
      .toLowerCase(),
    password: String(
      process.env.DEV_VIEWER_PASSWORD || process.env.DEV_ADMIN_PASSWORD || "",
    ).trim(),
    name: process.env.DEV_VIEWER_NAME || "Viewer Dev",
    role: "viewer",
  },
  contractor: {
    tenantId:
      process.env.DEV_CONTRACTOR_TENANT_ID ||
      process.env.DEV_ADMIN_TENANT_ID ||
      "tenant-admin",
    email: (
      process.env.DEV_CONTRACTOR_EMAIL ||
      process.env.DEV_ADMIN_EMAIL ||
      "contractor@fieldbase.local"
    )
      .trim()
      .toLowerCase(),
    password: String(
      process.env.DEV_CONTRACTOR_PASSWORD ||
        process.env.DEV_ADMIN_PASSWORD ||
        "",
    ).trim(),
    name: process.env.DEV_CONTRACTOR_NAME || "Contractor Dev",
    role: "contractor",
  },
  expired_trial: {
    tenantId: process.env.DEV_EXPIRED_TRIAL_TENANT_ID || "tenant-expired-trial",
    email: (process.env.DEV_EXPIRED_TRIAL_EMAIL || "expired.trial@fieldbase.local")
      .trim()
      .toLowerCase(),
    password: String(
      process.env.DEV_EXPIRED_TRIAL_PASSWORD ||
        process.env.DEV_ADMIN_PASSWORD ||
        "",
    ).trim(),
    name: process.env.DEV_EXPIRED_TRIAL_NAME || "Expired Trial Dev",
    role: "owner",
    isSubscribed: false,
    trialEndDate: "2020-01-01T00:00:00.000Z",
  },
};

function getConfiguredProfile(profileName) {
  const profile = DEV_PROFILES[profileName] || DEV_PROFILES.admin;
  if (!profile.email || !profile.password) {
    return null;
  }
  return profile;
}

function isLocalHost(host) {
  return (
    /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host)
  );
}

function extractHostHeader(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
}

function isAllowed(request) {
  const host = request.nextUrl.host || "";
  const originHost = extractHostHeader(request.headers.get("origin"));
  const refererHost = extractHostHeader(request.headers.get("referer"));
  const enabled = process.env.DEV_LOGIN_ENABLED === "true";
  const sameLocalOrigin =
    (!originHost || isLocalHost(originHost)) &&
    (!refererHost || isLocalHost(refererHost));

  return (
    enabled &&
    process.env.NODE_ENV !== "production" &&
    isLocalHost(host) &&
    sameLocalOrigin
  );
}

function getRedirectTarget(request, role) {
  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect");
  if (redirect?.startsWith("/")) {
    return redirect;
  }
  if (String(role || "").toLowerCase() === "super_admin") {
    return "/owner/overview";
  }
  return "/dashboard";
}

function getProfile(request) {
  const url = new URL(request.url);
  const profile = (url.searchParams.get("profile") || "admin")
    .toLowerCase()
    .replace(/-/g, "_");
  return DEV_PROFILES[profile] ? profile : "admin";
}

async function ensureDevUser(profileName) {
  const profile = getConfiguredProfile(profileName);
  if (!profile) {
    throw new Error("Dev profile is not configured");
  }
  const existingUser = await findAuthUserByEmail(profile.email);
  const authPayload = {
    password: profile.password,
    email_confirm: true,
    app_metadata: {
      tenant_id: profile.tenantId,
      role: profile.role,
    },
    user_metadata: {
      name: profile.name,
      status: profile.isSubscribed === false ? "expired" : "active",
      isSubscribed: profile.isSubscribed !== false,
      trialEndDate:
        profile.trialEndDate ||
        (profile.isSubscribed === false ? "2020-01-01T00:00:00.000Z" : null),
    },
  };

  if (!existingUser) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: profile.email,
      ...authPayload,
    });

    if (error) {
      throw new Error(error.message);
    }

    await upsertProfile({
      id: data.user.id,
      tenantId: profile.role === "super_admin" ? data.user.id : data.user.id,
      role: normalizeAppRole(profile.role),
    });

    return data.user;
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    existingUser.id,
    authPayload,
  );

  if (error) {
    throw new Error(error.message);
  }

  await upsertProfile({
    id: existingUser.id,
    tenantId:
      normalizeAppRole(profile.role) === "admin"
        ? existingUser.id
        : existingUser.id,
    role: normalizeAppRole(profile.role),
  });

  return data.user || existingUser;
}

export async function GET(request) {
  if (!isAllowed(request)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const profile = getProfile(request);
    const user = await ensureDevUser(profile);
    if (!user) {
      return new Response(
        "Unable to create dev user. Set DEV_*_PASSWORD env vars for dev-login profiles.",
        { status: 500 },
      );
    }

    const profileRow = await upsertProfile({
      id: user.id,
      tenantId: user.id,
      role: normalizeAppRole(DEV_PROFILES[profile]?.role),
    });
    const devProfileRole = normalizeAppRole(DEV_PROFILES[profile]?.role || "admin");
    let sessionUser = buildAppSessionFromSupabaseUser(user, null, profileRow);
    // Honor the selected dev profile so E2E/local QA can exercise tenant CRM routes
    // even when the dev admin email is also listed in SUPER_ADMIN_EMAIL(S).
    if (devProfileRole !== "super_admin") {
      sessionUser = { ...sessionUser, role: devProfileRole };
    }

    const cookieHeaders = [
      buildSessionCookie(
        createSessionToken({ ...sessionUser, devProfile: profile }),
      ),
    ];
    try {
      const legal = await getCurrentLegalVersionForTenant({
        tenantId: sessionUser.tenantDbId || user.id,
        userId: user.id,
      });
      const legalValue = buildLegalCookieValue(
        sessionUser.tenantDbId || user.id,
        legal?.version_name,
      );
      if (legalValue) {
        cookieHeaders.push(
          `${LEGAL_COOKIE_NAME}=${encodeURIComponent(legalValue)}; Path=/; Max-Age=${LEGAL_COOKIE_MAX_AGE}; SameSite=Lax`,
        );
      }
    } catch (legalError) {
      console.warn("[dev-login] legal cookie bootstrap skipped", legalError);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: getRedirectTarget(request, devProfileRole),
        "Cache-Control": "no-store",
        "Set-Cookie": cookieHeaders,
      },
    });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}
