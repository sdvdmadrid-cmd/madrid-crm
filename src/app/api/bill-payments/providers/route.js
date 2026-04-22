import {
  BILL_PROVIDER_TABLE,
  requireBillPaymentsAccess,
  serializeBillProvider,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "")
    .trim()
    .toLowerCase();

  let providerQuery = supabaseAdmin
    .from(BILL_PROVIDER_TABLE)
    .select("*")
    .order("provider_name", { ascending: true })
    .limit(25);

  if (query) {
    providerQuery = providerQuery.or(
      `normalized_name.ilike.%${query}%,search_terms.cs.{${query}}`,
    );
  }

  const { data, error } = await providerQuery;
  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: (data || []).map(serializeBillProvider),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
