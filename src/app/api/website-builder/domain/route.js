import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import {
  upsertWebsiteDomain,
  verifyWebsiteDomain,
} from "@/lib/public-website-domains";
import { supabaseAdmin } from "@/lib/supabase-admin";

const WEBSITE_TABLE = "contractor_websites";

export async function GET(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();

  const { data: website } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("id, slug")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  if (!website?.id) {
    return Response.json({ success: true, data: { domain: null } });
  }

  const { data: rows } = await supabaseAdmin
    .from("contractor_website_domains")
    .select("hostname, verification_token, verified_at, ssl_status")
    .eq("tenant_id", access.tenantDbId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const domain = rows?.[0] || null;
  return Response.json({
    success: true,
    data: {
      domain,
      dnsHint: domain
        ? `Add TXT record: fieldbase-verify=${domain.verification_token}`
        : null,
      slug: website.slug,
    },
  });
}

export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "register").trim().toLowerCase();
  const hostname = String(body.hostname || "").trim();

  const { data: website } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("id, slug")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  if (!website?.id) {
    return Response.json({ success: false, error: "Website not found" }, { status: 404 });
  }

  if (action === "verify") {
    try {
      const verified = await verifyWebsiteDomain(hostname, access.tenantDbId);
      return Response.json({ success: true, data: { domain: verified } });
    } catch (error) {
      return Response.json(
        { success: false, error: error?.message || "Verification failed" },
        { status: 400 },
      );
    }
  }

  try {
    const row = await upsertWebsiteDomain({
      tenantId: access.tenantDbId,
      websiteId: website.id,
      slug: website.slug,
      hostname,
    });
    return Response.json({
      success: true,
      data: {
        domain: row,
        dnsHint: `Add TXT: fieldbase-verify=${row.verification_token}`,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to register domain" },
      { status: 400 },
    );
  }
}
