# Apply June 2026 bug-fix migrations (PR #83)

**PR:** https://github.com/sdvdmadrid-cmd/madrid-crm/pull/83  
**Branch:** `feat/fieldbase-performance-bugfix-jun-2026`

Apply **before** or **immediately after** merging/deploying the app code. Order matters only if you deploy code first without columns (invoice send/PDF and calendar geo will degrade gracefully with legacy fallbacks where coded).

## Migrations (in timestamp order)

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260604130000_appointments_address_geo.sql` | `appointments.latitude`, `longitude`, `address_place_id` for calendar Places autocomplete |
| `supabase/migrations/20260604140000_invoice_client_addresses.sql` | `invoices.client_phone`, `client_address`, `property_address` snapshots for PDF/print/email |

---

## Option A — Supabase SQL Editor (recommended)

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/fhcbnupmdpphzdafmmgd/sql/new) → **SQL Editor**.
2. Paste and run **migration 1** (full file `20260604130000_appointments_address_geo.sql`).
3. Paste and run **migration 2** (full file `20260604140000_invoice_client_addresses.sql`).

Each file is idempotent (`IF NOT EXISTS` / safe defaults).

---

## Option B — CLI

```bash
# .env.local (not committed):
# SUPABASE_DB_PASSWORD=<Database password from Project Settings → Database>

npx supabase link --project-ref fhcbnupmdpphzdafmmgd
npm run db:migrate
# or: npx supabase db push
```

If `db push` fails with `permission denied to alter role`, use **Option A**.

---

## Verify (SQL Editor)

```sql
-- Appointments geo columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'appointments'
  and column_name in ('latitude', 'longitude', 'address_place_id');

-- Invoice party snapshot columns
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'invoices'
  and column_name in ('client_phone', 'client_address', 'property_address');
```

Expect **3 rows** for each query.

---

## Post-deploy smoke (preview or production)

| Area | Check |
| --- | --- |
| **Calendar** | Create/edit appointment → street autocomplete saves; reopen shows address |
| **Invoices** | Create invoice → line items UI; PDF/print shows Bill To / Job Site when client has addresses |
| **Invoice email** | Send invoice → no 500; email includes Powered by FieldBase footer |
| **Public site** | Incognito `https://<host>/sites/<slug>` → 200 when published; `/api/site/<slug>/lead-form-config` → 200 |
| **Nav** | Logged-in contractor with published site → sidebar **Website** opens `/sites/<slug>` in new tab |

### Playwright (local or against preview URL)

```bash
npx playwright test tests/e2e/audit/public-website-module.spec.js
npx playwright test tests/e2e/audit/invoices-module.spec.js
npx playwright test tests/e2e/audit/calendar-module.spec.js
```

---

## Rollback (only if needed)

```sql
alter table public.appointments
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists address_place_id;

alter table public.invoices
  drop column if exists client_phone,
  drop column if exists client_address,
  drop column if exists property_address;

notify pgrst, 'reload schema';
```

Rollback drops stored geo/address snapshots; app code from PR #83 tolerates missing columns via legacy selects where implemented.
