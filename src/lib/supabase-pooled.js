import "server-only";
import { createClient } from "@supabase/supabase-js";

// ── Pooled Supabase client for high-concurrency reads ──────────────────────
//
// Regular direct connection (port 5432): max ~20-50 simultaneous queries
// PgBouncer pooled connection (port 6543): scales to 500+ simultaneous queries
//
// How to enable:
// 1. Supabase Dashboard → Settings → Database → Connection Pooling → Enable
// 2. Mode: Transaction (best for serverless)
// 3. Pool size: 100
// 4. Copy the "Pooled connection URL" shown below
// 5. Add to .env: SUPABASE_POOLED_URL=postgresql://...@...supabase.co:6543/postgres
//
// NOTE: supabaseAdmin (direct) is still needed for:
//   - Migrations, schema changes
//   - Long transactions
//   - LISTEN/NOTIFY
//   - Prepared statements
//   - Functions that need session-level settings
// ─────────────────────────────────────────────────────────────────────────────

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY"
  );
}

// Pooled URL uses port 6543 (PgBouncer) instead of 5432 (direct)
// Falls back to standard URL if pooled not configured
const pooledUrl =
  process.env.SUPABASE_POOLED_URL || supabaseUrl;

/**
 * Pooled Supabase client — use for all standard CRUD operations.
 * Backed by PgBouncer when SUPABASE_POOLED_URL is configured.
 * Maximises connection reuse under high concurrent load.
 */
export const supabasePooled = createClient(pooledUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: "public",
  },
  global: {
    headers: {
      "x-client-info": "madrid-app-pooled",
    },
  },
});

/**
 * Direct (non-pooled) admin client — use for:
 * - Schema migrations
 * - Long-running transactions
 * - LISTEN/NOTIFY operations
 */
export { supabaseAdmin } from "@/lib/supabase-admin";
