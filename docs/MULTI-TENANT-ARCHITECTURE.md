# Multi-tenant architecture (FieldBase)

## Two levels

| Level | Identity | Domain | Users |
|-------|----------|--------|-------|
| **Platform** | FieldBase | fieldbaseapp.net | `super_admin` (platform owner) |
| **Tenant / company** | Contractor business name | `/site/{slug}` public site | `admin`, `contractor`, `viewer` |

FieldBase is always the SaaS product brand in the app shell (sidebar logo, login, marketing).

Contractor company names come from `company_profiles` and appear only in the **workspace** (sidebar company card, documents, public `/site/*` pages).

## Session & tenant mapping

- JWT session (`madrid_session`): `tenantId`, `tenantDbId`, `role`, `companyName`
- Supabase `profiles.tenant_id`: row-level tenant isolation
- `company_profiles.tenant_id`: business branding + Stripe Connect (`stripe_connect_*`)
- `/api/auth/me` and `/api/workspace/context` return `workspace: { platform, tenant, mode, actor }`

## Stripe Connect

Connect Express accounts are created per **tenant** (`company_profiles.tenant_id`), not per FieldBase platform brand.

Platform Stripe account (`sk_live_` on Vercel) processes Connect; payouts go to contractor connected accounts.

## Roles

- `super_admin` → `/owner/*` Mission Control (platform)
- `admin` / `contractor` / `viewer` → `/dashboard` CRM (tenant workspace)

Platform operator emails are reconciled to `super_admin` via `isPlatformOperatorEmail`.

## Future: multiple companies per user

Architecture prep:

- `TenantWorkspaceProvider` + `/api/workspace/context`
- Placeholder for tenant switcher (not enabled until `tenant_memberships` table exists)

Recommended schema (future migration):

```sql
-- tenant_memberships (user_id, tenant_id, role, is_default)
```

## Dev profiles

Dev login uses generic FieldBase emails (`contractor@FieldBase.local`), not a seeded Madrid company name. Company display name should be set in **Settings → Company profile** or `company_profiles` for each tenant.
