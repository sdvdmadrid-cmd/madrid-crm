import "server-only";

import { enrichEstimatesWithPartyBatch } from "@/lib/client-document-party";
import {
  buildPublicEstimateLink,
  isPublicEstimateStatus,
} from "@/lib/estimate-public-access";
import { serializeEstimateBase } from "@/lib/estimate-serializer";
import { logSupabaseError } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";

const ESTIMATES_TABLE = "estimates";

export const ESTIMATES_UI_PAGE_SIZE = 50;

function serializeEstimate(row) {
  const base = serializeEstimateBase(row);
  const publicLink =
    isPublicEstimateStatus(base.status) && base.id
      ? buildPublicEstimateLink(base.id)
      : null;
  return { ...base, publicLink };
}

export async function listEstimatesForTenant(
  { tenantDbId, role, page = 1, limit = ESTIMATES_UI_PAGE_SIZE } = {},
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || ESTIMATES_UI_PAGE_SIZE));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const query = scopeByTenant(
    supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
    { tenantDbId, role },
  );

  const { data, error, count } = await query;
  if (error) {
    logSupabaseError("[estimates-list-server] Supabase query error", error, {
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }

  const total = Number(count || 0);
  const serialized = (data || []).map(serializeEstimate);
  const enriched = await enrichEstimatesWithPartyBatch(
    supabaseAdmin,
    tenantDbId,
    serialized,
  );

  return {
    data: enriched,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}
