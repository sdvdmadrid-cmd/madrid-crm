import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";
import { isSuperAdminRole } from "@/lib/access-control";

function serializeLeadRow(row) {
  return {
    id: row.id,
    status: row.status || "new",
    name: row.name || "",
    serviceNeeded: row.service_needed || "",
    createdAt: row.created_at || null,
    phone: row.phone || "",
    budgetRange: row.budget_range || "",
  };
}

/** Lead inbox snapshot for workspace agent context (server-only). */
export async function fetchCrmLeadSnapshot(tenantDbId, role) {
  let query = supabaseAdmin
    .from("contractor_website_leads")
    .select("id, status, name, service_needed, created_at, phone, budget_range")
    .order("created_at", { ascending: false })
    .limit(40);

  if (!isSuperAdminRole(role)) {
    query = scopeByTenant(query, { tenantDbId, role });
  }

  const { data, error } = await query;
  if (error) {
    console.error("[workspace-agent] fetchCrmLeadSnapshot", error);
    return { leads: [], newCount: 0, error: error.message };
  }

  const leads = (data || []).map(serializeLeadRow);
  const newCount = leads.filter((l) => l.status === "new").length;
  const contactedCount = leads.filter((l) => l.status === "contacted").length;

  return {
    leads,
    newCount,
    contactedCount,
    total: leads.length,
  };
}
