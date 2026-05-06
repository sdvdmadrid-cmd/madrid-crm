// Simulate exactly what the POST /api/website-builder route does
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = process.argv[2] || "sdvdmadrid@gmail.com";
console.log("Testing save flow for:", email);

// 1. Get user
const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) { console.error("listUsers error:", listError.message); process.exit(1); }
const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.error("User not found"); process.exit(1); }

console.log("User found:", user.id);
console.log("  role:", user.app_metadata?.role);
console.log("  tenantDbId:", user.app_metadata?.tenantDbId || "(using user.id)");

const tenantDbId = user.app_metadata?.tenant_db_id || user.app_metadata?.tenantDbId || user.id;

// 2. Check company profile
const { data: profile, error: profileError } = await admin
  .from("company_profiles")
  .select("*")
  .eq("tenant_id", tenantDbId)
  .maybeSingle();

if (profileError) console.error("company_profiles error:", profileError.message);
console.log("Company profile:", profile ? `found (${profile.company_name})` : "NULL");

// 3. Check existing website
const { data: existingWebsite, error: websiteError } = await admin
  .from("contractor_websites")
  .select("*")
  .eq("tenant_id", tenantDbId)
  .maybeSingle();

if (websiteError) console.error("contractor_websites error:", websiteError.message);
console.log("Website row:", existingWebsite ? `found (slug: ${existingWebsite.slug}, id: ${existingWebsite.id})` : "NULL");

if (!existingWebsite) {
  console.log("No website row — need to create one");
  if (!profile) {
    console.error("ERROR: profile is null AND no website row — findOrCreateWebsite would CRASH on companyProfile.companyName");
    process.exit(1);
  }
}

// 4. Try a test UPDATE
if (existingWebsite) {
  const patch = {
    headline: "Test Save " + new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data: updated, error: updateError } = await admin
    .from("contractor_websites")
    .update(patch)
    .eq("id", existingWebsite.id)
    .select("*")
    .single();

  if (updateError) {
    console.error("UPDATE ERROR:", updateError.message, updateError.code, updateError.details);
  } else {
    console.log("UPDATE OK:", updated.headline);
    // Restore
    await admin.from("contractor_websites").update({ headline: existingWebsite.headline || "" }).eq("id", existingWebsite.id);
  }
}

// 5. Check can_access_tenant RLS function
console.log("\nChecking RLS policy...");
const { data: rpcResult, error: rpcError } = await admin.rpc("can_access_tenant", { p_tenant_id: tenantDbId });
if (rpcError) console.error("can_access_tenant RPC error:", rpcError.message);
else console.log("can_access_tenant:", rpcResult);
