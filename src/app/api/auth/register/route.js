import { normalizeAppRole } from "@/lib/access-control";
import { getSessionFromRequest } from "@/lib/auth";
import { upsertCompanyProfileForTenant } from "@/lib/company-profile-store";
import { sendEmail } from "@/lib/email";
import { countProfilesInTenant, upsertProfile } from "@/lib/profiles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  findAuthUserByEmail,
  generateSignupVerificationLink,
  generateUniqueTenantId,
  getRequestOrigin,
} from "@/lib/supabase-auth";

const ALLOWED_ROLES = new Set(["admin", "worker", "contractor", "viewer"]);

function sanitizeBusinessType(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function sanitizeTenantSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function tenantSeedFromEmail(email) {
  const localPart = String(email || "").split("@")[0] || "workspace";
  return sanitizeTenantSlug(localPart) || "workspace";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").toString();
    const name = (body.name || "").trim();
    const companyName = (body.companyName || "").trim().slice(0, 120);
    const requestedTenantId = sanitizeTenantSlug(body.tenantId);
    const requestedRole = (body.role || "contractor").toString().toLowerCase();
    const role = ALLOWED_ROLES.has(requestedRole) ? requestedRole : "worker";
    const businessType = sanitizeBusinessType(
      body.businessType || body.industry,
    );

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid email is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!name) {
      return new Response(
        JSON.stringify({ success: false, error: "Name is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Password must be at least 8 characters",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!/[A-Z]/.test(password)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Password must contain at least one uppercase letter",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!/[0-9]/.test(password)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Password must contain at least one number",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Password must contain at least one special character",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const tenantId = requestedTenantId
      ? requestedTenantId
      : await generateUniqueTenantId(tenantSeedFromEmail(email));

    const existingUser = await findAuthUserByEmail(email);
    if (existingUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email is already registered",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const session = getSessionFromRequest(request);
    const sessionTenantDbId = session?.tenantDbId || session?.userId || null;

    if (requestedTenantId) {
      const isAdminSession =
        session?.tenantId === tenantId &&
        ["admin", "owner", "super_admin"].includes(
          (session?.role || "").toLowerCase(),
        );
      if (!isAdminSession) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Only tenant admins can add users",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    const isSelfSignup = !requestedTenantId;
    const sharedTenantDbId = isSelfSignup ? null : sessionTenantDbId;
    const usersInTenant = sharedTenantDbId
      ? await countProfilesInTenant(sharedTenantDbId)
      : 0;
    const finalRole =
      isSelfSignup || usersInTenant === 0 ? "admin" : normalizeAppRole(role);
    const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();
    const isSuperAdmin = Boolean(
      SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL,
    );
    const assignedRole = isSuperAdmin
      ? "super_admin"
      : normalizeAppRole(finalRole);
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000);
    const authPayload = {
      email,
      password,
      email_confirm: isSuperAdmin,
      app_metadata: {
        tenant_id: tenantId,
        role: assignedRole,
      },
      user_metadata: {
        name,
        companyName,
        businessType,
        status: isSuperAdmin ? "active" : "pending_verification",
        isSubscribed: isSuperAdmin,
        trialStartDate: isSuperAdmin ? now.toISOString() : null,
        trialEndDate: isSuperAdmin ? trialEnd.toISOString() : null,
      },
    };

    const { data: createdUserData, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser(authPayload);

    if (createUserError) {
      const message = String(createUserError.message || "").toLowerCase();
      const status =
        message.includes("already") || message.includes("exists") ? 409 : 500;

      return new Response(
        JSON.stringify({ success: false, error: createUserError.message }),
        {
          status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const createdUser = createdUserData?.user;
    if (!createdUser?.id) {
      throw new Error("Supabase did not return the created user");
    }

    const profileTenantId = isSuperAdmin
      ? createdUser.id
      : isSelfSignup
        ? createdUser.id
        : sharedTenantDbId;

    await upsertProfile({
      id: createdUser.id,
      tenantId: profileTenantId,
      role: assignedRole,
    });

    // Super admin skips email verification — they own the server config.
    if (isSuperAdmin) {
      if (companyName) {
        await upsertCompanyProfileForTenant({
          tenantId: profileTenantId,
          profile: { companyName, businessType },
          userId: createdUser.id,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { requiresVerification: false, email },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (companyName || businessType) {
      await upsertCompanyProfileForTenant({
        tenantId: profileTenantId,
        profile: { companyName, businessType },
        userId: createdUser.id,
      });
    }

    const origin = getRequestOrigin(request);
    if (!origin) {
      throw new Error(
        "APP_URL must be configured for signup verification links",
      );
    }
    const { verifyUrl } = await generateSignupVerificationLink({
      email,
      origin,
    });

    const emailResult = await sendEmail({
      to: email,
      subject: "Verify your ContractorFlow account",
      html: `<p>Hi ${name},</p><p>Click the link below to verify your email and activate your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
      text: `Hi ${name},\n\nVerify your account:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      metadata: { tenantId: profileTenantId },
    });

    if (!emailResult?.success) {
      console.error("Failed to send verification email after registration", {
        provider: emailResult?.provider || "unknown",
        error: emailResult?.error || "Unknown email provider error",
        email,
        tenantId: profileTenantId,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            requiresVerification: true,
            email,
            emailDeliveryFailed: true,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { requiresVerification: true, email },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
