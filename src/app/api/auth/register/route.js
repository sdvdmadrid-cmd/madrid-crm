import { normalizeAppRole } from "@/lib/access-control";
import { buildSessionCookie, createSessionToken } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/auth";
import { upsertCompanyProfileForTenant } from "@/lib/company-profile-store";
import { logEmailAttempt, sendEmail } from "@/lib/email";
import { countProfilesInTenant, upsertProfile } from "@/lib/profiles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildAppSessionFromSupabaseUser,
  findAuthUserByEmail,
  generateSignupVerificationLink,
  generateUniqueTenantId,
  getRequestOrigin,
} from "@/lib/supabase-auth";

const ALLOWED_ROLES = new Set(["admin", "owner", "worker", "contractor", "viewer"]);

function shouldRecycleEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;

  const configured = String(process.env.RELEASED_SIGNUP_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(normalized);
}

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
      const canRecycle = shouldRecycleEmail(email);
      if (!canRecycle) {
        if (!existingUser.email_confirmed_at) {
          try {
            const origin = getRequestOrigin(request);
            if (!origin) {
              throw new Error("APP_URL must be configured for verification links");
            }

            const { verifyUrl } = await generateSignupVerificationLink({
              email,
              origin,
              userId: existingUser.id,
            });

            const emailResult = await sendEmail({
              to: email,
              subject: "Verify your FieldBase account",
              html: `<p>Hi there,</p><p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
              text: `Hi there,\n\nVerify your account:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
              metadata: { tenantId: existingUser.id },
            });

            await logEmailAttempt({
              tenantId: existingUser.id,
              userId: existingUser.id,
              recipient: email,
              provider: emailResult?.provider || "unknown",
              providerMessageId: emailResult?.providerMessageId || null,
              success: emailResult?.success === true,
              error: emailResult?.error || null,
              eventType: "signup_verification_existing_user",
            });

            if (!emailResult?.success) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: "Unable to send verification email right now",
                  code: "EMAIL_DELIVERY_FAILED",
                }),
                {
                  status: 502,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
          } catch (verificationError) {
            return new Response(
              JSON.stringify({
                success: false,
                error:
                  verificationError instanceof Error
                    ? verificationError.message
                    : "Unable to send verification email",
              }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              data: { requiresVerification: true, email: existingUser.email },
              message:
                "This email is already registered but not verified. A new verification link was sent.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

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

      // One-time legacy cleanup: free explicitly released emails for reuse.
      const existingUserId = String(existingUser.id || "").trim();
      if (existingUserId) {
        const { error: profileDeleteError } = await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("id", existingUserId);

        if (profileDeleteError) {
          console.warn("Failed to remove legacy profile during recycle", {
            email,
            userId: existingUserId,
            error: profileDeleteError.message,
          });
        }

        const { error: authDeleteError } =
          await supabaseAdmin.auth.admin.deleteUser(existingUserId);
        if (authDeleteError) {
          throw new Error(
            `Unable to recycle existing account for signup: ${authDeleteError.message}`,
          );
        }
      }
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
      isSelfSignup || usersInTenant === 0 ? "owner" : normalizeAppRole(role);
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
    const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
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

    const profile = await upsertProfile({
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

      const sessionUser = buildAppSessionFromSupabaseUser(
        createdUser,
        null,
        profile,
      );
      const token = createSessionToken(sessionUser);

      return new Response(
        JSON.stringify({
          success: true,
          data: sessionUser,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildSessionCookie(token),
          },
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
      userId: createdUser.id,
    });

    const emailResult = await sendEmail({
      to: email,
      subject: "Verify your FieldBase account",
      html: `<p>Hi ${name},</p><p>Click the link below to verify your email and activate your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
      text: `Hi ${name},\n\nVerify your account:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      metadata: { tenantId: profileTenantId },
    });

    await logEmailAttempt({
      tenantId: profileTenantId,
      userId: createdUser.id,
      createdBy: session?.userId || null,
      recipient: email,
      provider: emailResult?.provider || "unknown",
      providerMessageId: emailResult?.providerMessageId || null,
      success: emailResult?.success === true,
      error: emailResult?.error || null,
      eventType: "signup_verification",
    });

    console.info("[api/auth/register] verification email attempt", {
      userId: createdUser.id,
      tenantId: profileTenantId,
      email,
      provider: emailResult?.provider || "unknown",
      providerMessageId: emailResult?.providerMessageId || null,
      success: emailResult?.success === true,
      error: emailResult?.error || null,
    });

    if (!emailResult?.success) {
      console.error("Failed to send verification email after registration", {
        provider: emailResult?.provider || "unknown",
        error: emailResult?.error || "Unknown email provider error",
        email,
        tenantId: profileTenantId,
      });

      const activatedMetadata = {
        ...(createdUser.user_metadata || {}),
        status: "active",
        trialStartDate: now.toISOString(),
        trialEndDate: trialEnd.toISOString(),
      };

      const { data: activatedUserData, error: activateError } =
        await supabaseAdmin.auth.admin.updateUserById(createdUser.id, {
          email_confirm: true,
          user_metadata: activatedMetadata,
        });

      if (activateError) {
        throw new Error(
          `Signup succeeded but activation fallback failed: ${activateError.message}`,
        );
      }

      const activatedUser = activatedUserData?.user || createdUser;
      const sessionUser = buildAppSessionFromSupabaseUser(
        activatedUser,
        null,
        profile,
      );
      const token = createSessionToken(sessionUser);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            ...sessionUser,
            activatedWithoutEmailVerification: true,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildSessionCookie(token),
          },
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
