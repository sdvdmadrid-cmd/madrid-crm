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

console.log("Checking contractor_websites table...");
const { data, error } = await admin.from("contractor_websites").select("id, tenant_id, slug, published").limit(5);
if (error) {
  console.error("ERROR:", error.message, "| code:", error.code);
} else {
  console.log("Table OK. Rows found:", data.length);
  data.forEach(r => console.log(" -", r.id, r.slug, "published:", r.published));
}
