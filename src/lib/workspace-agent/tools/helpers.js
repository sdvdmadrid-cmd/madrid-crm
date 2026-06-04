import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ESTIMATE_LOOKUP_LIMIT,
  formatEstimateNumber,
  pickMaxEstimateSequence,
} from "@/lib/estimate-number";
import {
  INVOICE_LOOKUP_LIMIT,
  formatInvoiceNumber,
  pickMaxInvoiceSequence,
} from "@/lib/invoice-number";

export function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function scoreTextMatch(haystack, needle) {
  const h = normalizeQuery(haystack);
  const n = normalizeQuery(needle);
  if (!h || !n) return 0;
  if (h === n) return 100;
  if (h.includes(n)) return 80;
  const parts = n.split(" ").filter((p) => p.length > 2);
  if (!parts.length) return 0;
  const hits = parts.filter((p) => h.includes(p)).length;
  return Math.round((hits / parts.length) * 70);
}

export async function nextEstimateNumberForTenant(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("estimates")
    .select("estimate_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("estimate_number", "EST-%")
    .order("created_at", { ascending: false })
    .limit(ESTIMATE_LOOKUP_LIMIT);

  if (error) throw new Error(error.message);
  return formatEstimateNumber(pickMaxEstimateSequence(data) + 1);
}

export async function nextInvoiceNumberForTenant(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("invoice_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("invoice_number", "INV-%")
    .order("created_at", { ascending: false })
    .limit(INVOICE_LOOKUP_LIMIT);

  if (error) throw new Error(error.message);
  return formatInvoiceNumber(pickMaxInvoiceSequence(data) + 1);
}

export function parseEstimateItems(row) {
  const items = Array.isArray(row?.items) ? row.items : [];
  return items.map((it) => ({
    name: String(it?.name || "Service").trim(),
    description: String(it?.description || "").trim(),
    qty: Number(it?.qty || 1) || 1,
    unitPrice: Number(it?.unitPrice ?? it?.price ?? 0) || 0,
    price: Number(it?.price ?? it?.unitPrice ?? 0) || 0,
  }));
}
