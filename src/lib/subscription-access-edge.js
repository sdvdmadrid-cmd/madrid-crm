/**
 * Edge-safe subscription lookup (middleware). Uses Supabase REST — no server-only imports.
 */

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function fetchStripeSubscriptionStatusEdge(tenantDbId) {
  const id = String(tenantDbId || "").trim();
  const baseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!id || !baseUrl || !serviceKey) {
    return null;
  }

  try {
    const query = new URLSearchParams({
      select: "status",
      tenant_id: `eq.${id}`,
      status: "in.(active,trialing)",
      order: "created_at.desc",
      limit: "1",
    });

    const response = await fetch(`${baseUrl}/rest/v1/contractor_subscriptions?${query}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const rows = await response.json();
    const status = String(rows?.[0]?.status || "").toLowerCase();
    return ACTIVE_STATUSES.has(status) ? status : null;
  } catch {
    return null;
  }
}
