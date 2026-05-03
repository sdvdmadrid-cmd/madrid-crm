import { normalizeAppRole } from "@/lib/access-control";
import { buildSessionCookie, createSessionToken } from "@/lib/auth";
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
    tenantId: process.env.DEV_ADMIN_TENANT_ID || "tenant-admin",
    email: (process.env.DEV_ADMIN_EMAIL || "admin@FieldBase.local")
      .trim()
      .toLowerCase(),
    password: String(process.env.DEV_ADMIN_PASSWORD || "").trim(),
    name: process.env.DEV_ADMIN_NAME || "Admin Dev",
    role: "admin",
  },
  viewer: {
    tenantId: process.env.DEV_VIEWER_TENANT_ID || "tenant-admin",
    email: (process.env.DEV_VIEWER_EMAIL || "viewer@FieldBase.local")
      .trim()
      .toLowerCase(),
    password: String(process.env.DEV_VIEWER_PASSWORD || "").trim(),
    name: process.env.DEV_VIEWER_NAME || "Viewer Dev",
    role: "viewer",
  },
  contractor: {
    tenantId: process.env.DEV_CONTRACTOR_TENANT_ID || "tenant-admin",
    email: (
      process.env.DEV_CONTRACTOR_EMAIL || "contractor@FieldBase.local"
    )
      .trim()
      .toLowerCase(),
    password: String(process.env.DEV_CONTRACTOR_PASSWORD || "").trim(),
    name: process.env.DEV_CONTRACTOR_NAME || "Contractor Dev",
    role: "contractor",
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

function getRedirectTarget(request) {
  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "/";
  return redirect.startsWith("/") ? redirect : "/";
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
      status: "active",
      isSubscribed: true,
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
    const sessionUser = buildAppSessionFromSupabaseUser(user, null, profileRow);

    return new Response(null, {
      status: 302,
      headers: {
        Location: getRedirectTarget(request),
        "Cache-Control": "no-store",
        "Set-Cookie": buildSessionCookie(createSessionToken(sessionUser)),
      },
    });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}
