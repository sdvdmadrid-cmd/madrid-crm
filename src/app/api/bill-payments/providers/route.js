import {
  BILL_PROVIDER_TABLE,
  requireBillPaymentsAccess,
  serializeBillProvider,
} from "@/lib/bill-payments";
import {
  sanitizeProviderCategory,
  sanitizeProviderSearchQuery,
} from "@/lib/bill-payments-security";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_RESULTS = 200;

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  const { searchParams } = new URL(request.url);
  const query = sanitizeProviderSearchQuery(searchParams.get("q"));
  const category = sanitizeProviderCategory(searchParams.get("category"));

  let providerQuery = supabaseAdmin
    .from(BILL_PROVIDER_TABLE)
    .select("*")
    .order("provider_name", { ascending: true })
    .limit(MAX_RESULTS);

  if (category) {
    providerQuery = providerQuery.eq("category", category);
  }

  if (query) {
    const pattern = `%${query}%`;
    providerQuery = providerQuery.or(
      `normalized_name.ilike.${pattern},provider_name.ilike.${pattern}`,
    );
  }

  const { data, error } = await providerQuery;
  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let rows = data || [];
  if (query && rows.length < MAX_RESULTS) {
    const extra = rows;
    const terms = query.split(" ").filter((t) => t.length >= 2);
    if (terms.length > 0) {
      const { data: tagRows } = await supabaseAdmin
        .from(BILL_PROVIDER_TABLE)
        .select("*")
        .contains("search_terms", terms)
        .limit(MAX_RESULTS);
      const seen = new Set(extra.map((r) => r.id));
      for (const row of tagRows || []) {
        if (!seen.has(row.id)) {
          extra.push(row);
          seen.add(row.id);
        }
      }
      rows = extra.slice(0, MAX_RESULTS);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: rows.map(serializeBillProvider),
      meta: { count: rows.length, maxResults: MAX_RESULTS },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
