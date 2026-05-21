# Bill Payments — Security & scope

## What this module does

- **Funding**: Card/ACH charges via Stripe (PCI vault).
- **Remittance**: Workflow to record when you post payment on the biller’s site (not automatic biller settlement like full Doxo/RPPS unless integrated later).

## Hardening (implemented)

| Control | Detail |
|---------|--------|
| Tenant isolation | APIs filter by `tenant_id`; payment methods also by `user_id`. |
| Role gate | **Viewers** cannot access Bill Payments. Pay/Plaid/setup require **owner/admin**. |
| CSRF | Mutations use `enforceSameOriginForMutation`. |
| Rate limits | Pay, card setup, Plaid link (per IP, tenant, user). |
| Bulk pay caps | Max 25 bills, $50k batch, $25k per bill. |
| Provider search | Sanitized query; no unsafe `search_terms` injection. |
| Account numbers | Hashed + masked in DB; never returned in full. |
| Plaid tokens | **Not stored by default**. Set `BILL_PAYMENTS_STORE_PLAID_ACCESS_TOKEN=true` only if you accept encrypted-at-rest tokens (not recommended for production). |
| Auto-remittance | Off unless `BILL_REMITTANCE_*_AUTOSUBMIT=true` — never implies biller paid without your confirmation. |
| Platform fees RLS | `bill_payment_platform_fees` tenant-scoped via RLS. |
| Trusted IP | Set `TRUST_PROXY_HEADERS=true` on Vercel for ACH mandates. |

## Production env

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
TRUST_PROXY_HEADERS=true
# Do NOT enable unless you understand the risk:
# BILL_PAYMENTS_STORE_PLAID_ACCESS_TOKEN=false
# BILL_REMITTANCE_SYNCHRONY_AUTOSUBMIT=false
# BILL_REMITTANCE_ALLOW_MANUAL_PORTAL_AUTOSUBMIT=false
```

## Payee catalog

Seeded providers cover utilities, cards, auto lenders, insurance, telecom, tax/HOA placeholders. Users can always add a **custom payee** by name. Full national biller directory requires a **biller network partner** (RPPS, PayNearMe, etc.).

## Run migration

Apply `20260520130000_bill_payments_hardening_and_catalog.sql` in Supabase SQL editor or `supabase db push`.
