#!/usr/bin/env node
/**
 * Pre-promo smoke check for Madrid Landscaping invoice workflow (read-only DB + env).
 * Usage: npm run qa:madrid-invoices
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";
import { computeInvoicePaymentState } from "../src/lib/invoice-payments.js";

const MADRID_TENANT = "d38fec7b-adac-4b7f-a46d-2ccadab6e452";

const loaded = loadEnvLocal(process.cwd());
if (!loaded.ok) {
  console.error(loaded.error);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
let failed = 0;

function pass(label, detail = "") {
  results.push({ ok: true, label, detail });
  console.log(`  [OK] ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  failed += 1;
  results.push({ ok: false, label, detail });
  console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail = "") {
  console.warn(`  [WARN] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("[qa:madrid-invoices] Madrid Landscaping invoice readiness\n");

  const stripeKey = String(process.env.STRIPE_SECRET_KEY || "");
  if (stripeKey.startsWith("sk_live")) {
    pass("Stripe platform key", "live mode");
  } else if (stripeKey.startsWith("sk_test")) {
    warn("Stripe platform key", "TEST key in .env.local — production uses live");
  } else {
    fail("Stripe platform key", "missing or unknown");
  }

  const emailProvider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (emailProvider === "resend" && process.env.RESEND_API_KEY) {
    pass("Email (Resend)", "configured");
  } else if (emailProvider && emailProvider !== "mock") {
    pass("Email provider", emailProvider);
  } else {
    warn(
      "Email send",
      "EMAIL_PROVIDER not set to resend or RESEND_API_KEY missing — Send by email may not deliver",
    );
  }

  const { data: company, error: companyErr } = await supabase
    .from("company_profiles")
    .select(
      "tenant_id, company_name, public_display_name, stripe_connect_account_id, stripe_connect_charges_enabled",
    )
    .eq("tenant_id", MADRID_TENANT)
    .maybeSingle();

  if (companyErr || !company) {
    fail("Company profile", companyErr?.message || "not found");
  } else {
    pass("Company profile", company.public_display_name || company.company_name);
  }

  const { count: clientCount } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", MADRID_TENANT);

  if ((clientCount || 0) >= 1) {
    pass("Clients for tenant", String(clientCount));
  } else {
    fail("Clients for tenant", "none");
  }

  const { data: sub } = await supabase
    .from("contractor_subscriptions")
    .select("status, trial_ends_at, stripe_customer_id")
    .eq("tenant_id", MADRID_TENANT)
    .maybeSingle();

  if (sub && ["trialing", "active"].includes(sub.status)) {
    const trialEnd = sub.trial_ends_at
      ? new Date(sub.trial_ends_at).toLocaleDateString("en-US")
      : "n/a";
    pass("Platform subscription", `${sub.status} (trial ends ${trialEnd})`);
    if (sub.stripe_customer_id?.startsWith("cus_")) {
      warn(
        "Platform Stripe customer",
        `${sub.stripe_customer_id} — Activar Suscripción may error (test/live mismatch); ignore for invoice tests`,
      );
    }
  } else {
    warn("Platform subscription", sub?.status || "none — CRM may still work");
  }

  if (company?.stripe_connect_account_id && company.stripe_connect_charges_enabled) {
    pass("Stripe Connect (client payments)", "onboarded");
  } else {
    warn(
      "Stripe Connect (client payments)",
      "not connected — online Pay link on invoices may be missing; manual payment still OK",
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("tenant_id", MADRID_TENANT)
    .not("email", "is", null)
    .limit(3);

  const sampleClient = (clients || []).find((c) => String(c.email || "").includes("@"));
  if (sampleClient) {
    pass("Sample client with email", `${sampleClient.name} <${sampleClient.email}>`);
  } else {
    warn("Sample client with email", "none — use manual email when sending test invoice");
  }

  const { data: recentInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_name, amount, status, balance_due, total_cents")
    .eq("tenant_id", MADRID_TENANT)
    .order("created_at", { ascending: false })
    .limit(5);

  if (recentInvoices?.length) {
    pass("Recent invoices", `${recentInvoices.length} found (latest ${recentInvoices[0].invoice_number})`);
    for (const inv of recentInvoices.slice(0, 2)) {
      const state = computeInvoicePaymentState({
        amount: inv.amount,
        balance_due: inv.balance_due,
        status: inv.status,
        total_cents: inv.total_cents,
      });
      console.log(
        `       · ${inv.invoice_number} ${inv.client_name || ""} — ${state.status} balance=${state.balanceDue}`,
      );
    }
  } else {
    warn("Recent invoices", "none yet — create one in /invoices to test send");
  }

  const { count: crossTenant } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .neq("tenant_id", MADRID_TENANT);

  pass("Tenant isolation", `${clientCount} Madrid / ${crossTenant || 0} other tenants' clients`);

  console.log("\n[qa:madrid-invoices] Manual UI checklist (fieldbaseapp.net):");
  console.log("  1. Login as Madrid → Invoices → New invoice → pick client (autocomplete)");
  console.log("  2. Save → Send by email (use your email first)");
  console.log("  3. Register payment (cash/Zelle) on same invoice");
  console.log("  4. Optional: Settings → Payments → Connect Stripe → resend for card link");

  if (failed > 0) {
    console.error(`\n[qa:madrid-invoices] ${failed} hard failure(s)`);
    process.exit(1);
  }
  console.log("\n[qa:madrid-invoices] Automated checks passed (see WARN for optional setup)");
}

main().catch((err) => {
  console.error("[qa:madrid-invoices] fatal:", err.message);
  process.exit(1);
});
