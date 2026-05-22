import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const DOMAINS_TABLE = "contractor_website_domains";

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
}

export function buildDomainVerificationToken() {
  return `fieldbase-verify-${Math.random().toString(36).slice(2, 12)}`;
}

export async function resolveSlugByCustomHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return "";
  }

  const { data, error } = await supabaseAdmin
    .from(DOMAINS_TABLE)
    .select("slug")
    .eq("hostname", host)
    .not("verified_at", "is", null)
    .maybeSingle();

  if (error) {
    if (String(error.message || "").includes("does not exist")) {
      return "";
    }
    console.error("[public-website-domains] lookup", error.message);
    return "";
  }

  return String(data?.slug || "").trim().toLowerCase();
}

export async function upsertWebsiteDomain({
  tenantId,
  websiteId,
  slug,
  hostname,
}) {
  const host = normalizeHostname(hostname);
  if (!host || !tenantId || !slug) {
    throw new Error("Invalid domain configuration");
  }

  const token = buildDomainVerificationToken();
  const { data, error } = await supabaseAdmin
    .from(DOMAINS_TABLE)
    .upsert(
      {
        tenant_id: tenantId,
        website_id: websiteId,
        slug,
        hostname: host,
        verification_token: token,
        verified_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hostname" },
    )
    .select("hostname, verification_token, verified_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function verifyWebsiteDomain(hostname, tenantId) {
  const host = normalizeHostname(hostname);
  const { data, error } = await supabaseAdmin
    .from(DOMAINS_TABLE)
    .update({ verified_at: new Date().toISOString() })
    .eq("hostname", host)
    .eq("tenant_id", tenantId)
    .select("hostname, slug, verified_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
