import {
  listPlatformFeatureFlags,
  upsertPlatformFeatureFlag,
} from "@/lib/platform-feature-flags";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

function forbidden() {
  return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return forbidden();
    }

    const flags = await listPlatformFeatureFlags();
    return new Response(JSON.stringify({ success: true, data: flags }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/admin/feature-flags][GET]", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to load flags" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function POST(request) {
  try {
    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated || access.role !== "super_admin") {
      return forbidden();
    }

    const body = await request.json().catch(() => ({}));
    const key = String(body.key || "").trim();
    if (!key || typeof body.enabled !== "boolean") {
      return new Response(
        JSON.stringify({ success: false, error: "key and enabled are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const previousFlags = await listPlatformFeatureFlags();
    const previous = previousFlags.find((flag) => flag.key === key);

    await upsertPlatformFeatureFlag({
      key,
      enabled: body.enabled,
      description: String(body.description || ""),
      updatedBy: access.email || access.userId || "super_admin",
    });

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      user_id: String(access.userId || "system"),
      tenant_id: String(access.tenantDbId || ""),
      action: "platform_feature_flag.updated",
      metadata: {
        key,
        previousEnabled:
          typeof previous?.enabled === "boolean" ? previous.enabled : null,
        nextEnabled: body.enabled,
        previousDescription: previous?.description || "",
        nextDescription: String(body.description || ""),
        actorEmail: access.email || "",
      },
    });

    if (auditError) {
      console.error("[api/admin/feature-flags][POST] audit log insert failed", auditError);
    }

    const flags = await listPlatformFeatureFlags();

    return new Response(JSON.stringify({ success: true, data: flags }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/admin/feature-flags][POST]", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to update flag" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
