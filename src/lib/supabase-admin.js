import "server-only";
import { createClient } from "@supabase/supabase-js";

// Note: Connection pooling (postgresql://...pooling.supabase.co:6543) is for:
// - Prisma ORM operations
// - Direct PostgreSQL connections (via pg library)
// 
// The Supabase JavaScript client uses HTTP/HTTPS REST API, so we use the
// standard HTTPS URL below. Pooling optimizations happen at the database level.

let supabaseAdminClient = null;

function createSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
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
