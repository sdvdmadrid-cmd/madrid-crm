# CRM navigation map (FieldBase)

Quick reference for users and developers. Goal: **dashboard → client → job → invoice** in few clicks.

## Tenant users (contractor, owner, admin)

| Goal | Path |
|------|------|
| Home / metrics | `/dashboard` |
| Clients & leads | `/clients`, `/lead-inbox` |
| Jobs | `/jobs` |
| Invoices & payments | `/invoices` |
| Estimates | `/estimates` (full nav) or hidden for `contractor` role |
| Calendar | `/calendar` |
| Bill payments | `/bill-payments` |
| Website | `/website` (redirect from `/website-builder`) |

**Typical flow:** Lead inbox → convert → Client → Job → Invoice → send / Stripe checkout.

## Platform operator (`super_admin`)

| Goal | Path |
|------|------|
| Command center | `/owner/overview` |
| Tenants & revenue | `/owner/tenants`, `/owner/revenue` |
| Legacy (redirect planned) | `/admin` |

> Note: URL `/owner/*` is the **platform** console. Role **`owner`** is a **tenant** business owner — different concepts.

## Implemented

- `/admin` → `/owner/overview`; ajustes en `/owner/settings`
- Breadcrumbs + back (`CrmNavBar`)
- `PublicPageShell` en marketing
- Middleware: plataforma solo `super_admin`
- Clientes UI usa `/api/clients` (no `/api/supabase/clients`)
- Overview unificado: `src/lib/platform-overview.js`

## Docs relacionados

- `docs/CRM_PIPELINE.md` — flujo lead → factura
- `docs/ROLES.md` — roles vs URLs `/owner`
- `docs/DEPLOY_VERCEL.md` — crons y env en Vercel
