# Module audit: Payments (client collections)

**Status:** Complete — **signed off** ([PAYMENTS_MODULE_SIGN_OFF.md](./PAYMENTS_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Money **from your clients** (not Bill Payments / utilities)

---

## What this module includes

| Surface | Path / API | Contractor purpose |
|---------|------------|-------------------|
| Stripe Connect settings | `/settings/payments` | Connect payout account; charges & bank payouts |
| Settings hub entry | `/settings` → Client payments | Discoverability |
| Dashboard banner | `/dashboard` | Setup nudge + “Collect payment” |
| Invoice payment UI | `/invoices` | Register cash/Zelle/etc.; see history on card |
| Manual payment API | `POST /api/invoices/:id/payments` | Record offline payments; updates status |
| Stripe Checkout | `POST /api/invoices/:id/checkout` | Client pays online |
| Webhook | `POST /api/payments/webhooks/stripe` | Marks Stripe payments paid |
| Return URLs | `/invoices?payment=success\|cancel` | Post-checkout feedback |

**Out of scope (separate future audit):** [Bill Payments](/bill-payments) — pay utilities/credit cards via Stripe/Plaid.

---

## Workflows tested

### Stripe Connect (`/settings/payments`)
| Control | Result |
|---------|--------|
| Status badge (not connected / pending / active) | ✅ Loads from `/api/payments/connect/status` |
| Connect / Continue setup | ✅ POST `/api/payments/connect/onboard` (redirect in prod) |
| Open Stripe dashboard | ✅ When onboarded |
| Go to invoices | ✅ When active |
| How it works (4 steps) | ✅ Readable on dark theme |
| Account status (charges / payouts) | ✅ |
| `?connect=return` notice | ✅ |
| Responsive layout | ✅ Desktop / tablet / mobile |

### Recording payments (invoice-linked)
| Workflow | Result |
|----------|--------|
| Full cash payment → **Paid** | ✅ API + card UI after refresh |
| Two partial payments → **Partial** + history lines | ✅ Paid/balance + method lines |
| UI register second partial | ✅ Register payment panel |
| Over-balance rejected | ✅ 400 API |
| Zelle without reference rejected | ✅ 400 API |
| Payment receipt (print HTML) | ✅ Opens after save (manual smoke) |

### Stripe online pay
| Workflow | Result |
|----------|--------|
| Create checkout session | ✅ Returns URL when configured; else clear API error |
| Success / cancel return banners | ✅ On invoices page |

### Contractor visibility
| Item | Result |
|------|--------|
| Get-paid guide on invoices | ✅ 4-step workflow |
| Dashboard “Collect payment” + readiness banner | ✅ |
| Settings hub “Open payments” | ✅ |

---

## Payment status model

| Status | When |
|--------|------|
| Unpaid | No payments |
| Partial | `paidAmount > 0` and `balanceDue > 0` |
| Paid | `balanceDue <= 0` |

Statuses surface on invoice cards and drive search (token includes status text).

---

## UX / friction findings

| Issue | Severity | Notes |
|-------|----------|-------|
| Invoice list not live-updated after background API changes | Low | UI register updates state; full reload needed if another tab/API changed data |
| No global “Payments” history page | Medium | History only per invoice card (`paymentsPre` block) |
| No Paid/Partial filter dropdown on invoices | Low | Search by status keyword works but noisy on large tenants |
| Many actions per invoice card (email, text, share, Stripe) | Low | Wraps on mobile; busy but functional |
| Stripe Connect may be disabled in dev | Info | Clear platform/owner messaging |
| Bill Payments name collision | Info | Nav “Client payments” vs `/bill-payments` — guide text clarifies |

---

## Related fixes this audit cycle

- **Invoices:** `filterAndRankRecords` import (list search crash) — required for payment status search.

---

## E2E evidence

```text
tests/e2e/audit/payments-module.spec.js — 17/17 passed (2026-05-28)
tests/e2e/audit/invoices-module.spec.js — partial cash payment
tests/e2e/contractor-workflows.spec.js — invoice send + PDF smoke
```

---

## Related

- [PAYMENTS_MODULE_SIGN_OFF.md](./PAYMENTS_MODULE_SIGN_OFF.md)  
- [MODULE_AUDIT_INVOICES.md](./MODULE_AUDIT_INVOICES.md)  
- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md)  
- [docs/payments-money-flow-and-monetization.md](../payments-money-flow-and-monetization.md)
