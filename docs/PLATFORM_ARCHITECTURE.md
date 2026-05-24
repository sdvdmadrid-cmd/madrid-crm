# FieldBase platform architecture

FieldBase is split into two **separate systems**. They must never share authentication, data APIs, or UI without explicit boundaries.

## Public contractor website (`PLATFORM_ZONE.PUBLIC_WEBSITE`)

**Audience:** Homeowners and prospects.

**Includes:**

- Published site at `/sites/{slug}` (services, gallery, reviews, CTAs)
- Public request/quote forms → creates leads only
- Public SEO pages, branding, testimonials shown on site
- Public API allowlist: `/api/site/*`, `/api/public/*`

**Must NOT expose:**

- CRM clients, internal notes, invoices, estimates
- Lead inbox details beyond form submission acknowledgment
- Team members, analytics, scheduling internals
- Draft/unpublished website content

## Private FieldBase dashboard (`PLATFORM_ZONE.PRIVATE_DASHBOARD`)

**Audience:** Company owner and authorized team (session + tenant scope).

**Includes:**

- Leads, lead inbox, scheduling, CRM
- Invoices, estimates, internal files
- Website **builder** (customization), settings, team permissions
- Reviews **management** (import, pin, hide — separate from public display flags)

**Protection:**

- Middleware session validation on app routes
- `getAuthenticatedTenantContext` on private APIs
- Row-level security (`can_access_tenant`) in Supabase
- Role-based write/delete via `access-control.js`

## Reviews & reputation

| Layer | Location |
|--------|----------|
| Manage reviews | Private `/reputation` + `/api/reputation/*` |
| Display reviews | Public site only when `show_on_website = true` and `hidden = false` |
| Public read | `GET /api/site/{slug}/reviews` (sanitized fields only) |

## Code references

- `src/lib/platform-architecture.js` — route zone constants
- `src/lib/api-zone-guard.js` — private vs public API helpers
- `middleware.js` — public path allowlist, subdomain isolation
