import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const env = {};

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index <= 0) continue;
  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  env[key] = value;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase credentials");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 10,
});

if (usersError) {
  throw new Error(`Failed to list users: ${usersError.message}`);
}

const owner = (usersData?.users || [])[0];
if (!owner?.id || !owner?.email) {
  throw new Error("No owner user found");
}

const tenantId = String(
  owner.app_metadata?.tenant_id ||
    owner.app_metadata?.tenantId ||
    owner.user_metadata?.tenant_id ||
    owner.user_metadata?.tenantId ||
    owner.id,
).trim();

const now = Date.now();
const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${now.toString(36)}`;
const contactName = "Sdvd Madrid";
const contactEmail = String(owner.email).toLowerCase();
const signatureText = `Signed ${now}`;

const quoteInsert = {
  tenant_id: tenantId,
  user_id: owner.id,
  created_by: owner.id,
  quote_number: `SIG-${now}`,
  title: "Signature verification",
  client_id: null,
  client_name: contactName,
  client_email: contactEmail,
  client_phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "TX",
  zip: "",
  property_address: "",
  line_items: [{ id: "line-1", name: "Test", qty: 1, unitPrice: 100, total: 100 }],
  scope_of_work: "Verify public quote signature persistence",
  status: "sent",
  sent_at: new Date().toISOString(),
  viewed_at: null,
  email_opened_at: null,
  approved_at: null,
  quote_token: quoteToken,
  quote_shared_at: new Date().toISOString(),
  quote_approved_by_name: "",
  quote_approved_by_email: "",
  quote_signed_by_name: "",
  quote_signed_by_email: "",
  quote_signature_text: "",
};

const { data: insertedQuote, error: insertError } = await admin
  .from("quotes")
  .insert(quoteInsert)
  .select("id")
  .single();

if (insertError) {
  throw new Error(`Failed to insert quote: ${insertError.message}`);
}

try {
  const signResponse = await fetch(`${baseUrl}/api/public/quotes/${quoteToken}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sign",
      contactName,
      contactEmail,
      signatureText,
    }),
  });
  const signJson = await signResponse.json();
  if (!signResponse.ok || !signJson?.success) {
    throw new Error(`Sign request failed: ${JSON.stringify(signJson)}`);
  }

  const readResponse = await fetch(`${baseUrl}/api/public/quotes/${quoteToken}`);
  const readJson = await readResponse.json();
  if (!readResponse.ok || !readJson?.success) {
    throw new Error(`Read request failed: ${JSON.stringify(readJson)}`);
  }

  const { data: storedQuote, error: readDbError } = await admin
    .from("quotes")
    .select("status, approved_at, quote_approved_by_name, quote_approved_by_email, quote_signed_at, quote_signed_by_name, quote_signed_by_email, quote_signature_text")
    .eq("id", insertedQuote.id)
    .single();

  if (readDbError) {
    throw new Error(`DB read failed: ${readDbError.message}`);
  }

  const apiJob = readJson.data?.job || {};
  const checks = [
    storedQuote.status === "signed",
    storedQuote.quote_approved_by_name === contactName,
    storedQuote.quote_approved_by_email === contactEmail,
    storedQuote.quote_signed_by_name === contactName,
    storedQuote.quote_signed_by_email === contactEmail,
    storedQuote.quote_signature_text === signatureText,
    Boolean(storedQuote.quote_signed_at),
    apiJob.quoteStatus === "signed",
    apiJob.quoteApprovedByName === contactName,
    apiJob.quoteApprovedByEmail === contactEmail,
    apiJob.quoteSignedByName === contactName,
    apiJob.quoteSignedByEmail === contactEmail,
    apiJob.quoteSignatureText === signatureText,
    Boolean(apiJob.quoteSignedAt),
  ];

  if (checks.some((value) => !value)) {
    throw new Error(
      `Validation failed. DB=${JSON.stringify(storedQuote)} API=${JSON.stringify(apiJob)}`,
    );
  }

  console.log("PASS public quote signature persisted and returned correctly");
  console.log(JSON.stringify({ storedQuote, apiJob }, null, 2));
} finally {
  await admin.from("quotes").delete().eq("id", insertedQuote.id);
}
