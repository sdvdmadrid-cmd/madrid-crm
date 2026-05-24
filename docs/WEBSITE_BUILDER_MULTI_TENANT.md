# Website Builder — multi-tenant public URLs

## Routes

| Purpose | Path | Who |
|---------|------|-----|
| **Private editor** | `/website` | Authenticated tenant only (one site per `tenant_id`) |
| **Published public site** | `/sites/{slug}` | Anyone (only when `published = true`) |
| **Quote / lead form** | `/sites/{slug}/request` | Public |
| **Legacy alias** | `/site/{slug}` | 301 → `/sites/{slug}` |

`{slug}` is **globally unique** across all tenants (`contractor_websites.slug` unique index).  
Optional: `{slug}.NEXT_PUBLIC_SITE_DOMAIN` (subdomain) rewrites to `/sites/{slug}`.

## Tenant isolation

- **DB:** `contractor_websites.tenant_id` unique — one website row per company.
- **API:** All `/api/website-builder/*` routes use `getAuthenticatedTenantContext` → `tenantDbId`.
- **Public read:** `getPublicWebsiteBySlug` requires `published = true` and loads `company_profiles` by `tenant_id` from that row.
- **Storage:** `website-media/{tenantId}/{slug}/…`
- **Leads:** `contractor_website_leads.tenant_id` set from resolved website on contact POST.

## Draft vs published

- `published = false` → `/sites/{slug}` returns **404** (no public leak).
- Builder preview is **in-app only** (`WebsiteBuilderPreview`), not a shareable URL.

## Industry templates

- Default: `company_profiles.business_type` → pack (`general` fallback for `other`).
- Override: `site_meta.industryKeyOverride` (manual template in builder).
- “Reset to industry preset” applies the **effective** pack and saves immediately.

## Custom domains (future-ready)

`contractor_website_domains` + middleware host rewrite → `/sites/{slug}`.

## Related code

- `src/lib/public-website-routing.js` — canonical paths, reserved slugs
- `src/lib/public-website.js` — public loader
- `src/app/api/website-builder/route.js` — CRUD + publish
