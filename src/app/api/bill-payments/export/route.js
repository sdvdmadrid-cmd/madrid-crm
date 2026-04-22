import {
  BILL_PAYMENT_TRANSACTION_TABLE,
  requireBillPaymentsAccess,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

function toCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  const { context } = access;
  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .select("*")
    .eq("tenant_id", context.tenantDbId)
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const header = [
    "provider",
    "amount",
    "currency",
    "status",
    "source",
    "scheduled_for",
    "processed_at",
    "created_at",
  ];
  const lines = [header.map(toCsvCell).join(",")];
  for (const row of data || []) {
    lines.push(
      [
        row.provider_name,
        row.amount,
        row.currency,
        row.status,
        row.source,
        row.scheduled_for,
        row.processed_at,
        row.created_at,
      ]
        .map(toCsvCell)
        .join(","),
    );
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bill-payment-history.csv"',
    },
  });
}
