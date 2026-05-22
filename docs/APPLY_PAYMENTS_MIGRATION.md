# Apply payments migration (production)

Migration file: `supabase/migrations/20260523100000_payments_hardening_connect_prep.sql`

## Option A — Supabase Dashboard (recommended if CLI fails)

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/fhcbnupmdpphzdafmmgd/sql/new) → SQL Editor.
2. Paste the full contents of the migration file above.
3. Run. You should see success and `notify pgrst, 'reload schema'` at the end.

## Option B — CLI from your machine

```bash
# In .env.local (not committed):
SUPABASE_DB_PASSWORD=<Database password from Project Settings → Database>

npx supabase link --project-ref fhcbnupmdpphzdafmmgd
npx supabase db push
```

If you see `permission denied to alter role` for `cli_login_postgres`, use **Option A** or ask the project owner to run `db push`.

## What this migration adds

- `payments.contractor_id` + index
- `payments.status` includes `paid` (backfill from `completed`)
- `stripe_webhook_events` idempotency table
- `company_profiles` Stripe Connect columns
