import { createClient } from "@supabase/supabase-js";

let supabaseAdminClient = null;

function createSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = createSupabaseAdminClient();
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);
