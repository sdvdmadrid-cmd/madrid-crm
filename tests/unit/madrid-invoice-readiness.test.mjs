import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "../../scripts/load-env-local.mjs";
import { computeInvoicePaymentState } from "../../src/lib/invoice-payments.js";

loadEnvLocal(process.cwd());

const MADRID_TENANT = "d38fec7b-adac-4b7f-a46d-2ccadab6e452";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test("Madrid tenant has clients and company profile in production DB", async (t) => {
  const supabase = getSupabase();
  if (!supabase) {
    t.skip("Supabase env not configured");
    return;
  }

  const { count } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", MADRID_TENANT);

  assert.ok((count || 0) >= 50, `expected ~61 clients, got ${count}`);

  const { data: company } = await supabase
    .from("company_profiles")
    .select("company_name")
    .eq("tenant_id", MADRID_TENANT)
    .maybeSingle();

  assert.match(
    String(company?.company_name || "").toLowerCase(),
    /madrid/,
  );
});

test("Madrid invoice rows compute unpaid balance correctly", async (t) => {
  const supabase = getSupabase();
  if (!supabase) {
    t.skip("Supabase env not configured");
    return;
  }

  const { data: rows } = await supabase
    .from("invoices")
    .select("amount, balance_due, status, total_cents")
    .eq("tenant_id", MADRID_TENANT)
    .limit(5);

  assert.ok(rows?.length, "expected at least one Madrid invoice");

  for (const row of rows) {
    const state = computeInvoicePaymentState({
      amount: row.amount,
      balance_due: row.balance_due,
      status: row.status,
      total_cents: row.total_cents,
    });
    assert.ok(Number.isFinite(state.balanceDue));
    assert.ok(["Sent", "Partial", "Paid"].includes(state.status));
  }
});
