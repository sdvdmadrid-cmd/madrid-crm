# Payments module — final sign-off

**Module:** Client payments (Stripe Connect + invoice payments)  
**Sign-off date:** 2026-05-28  
**Status:** **APPROVED** — proceed to **Contracts** (or next module in sequence)

**Evidence:** `tests/e2e/audit/payments-module.spec.js` (**17/17 passed** on 2026-05-28)

---

## Feature matrix

| Feature | Tested | Passed | Notes |
|---------|:------:|:------:|-------|
| **Stripe Connect settings page** | Yes | Yes | Layout ×3, status API, return notice |
| **Connect / continue onboarding** | Partial | Yes | Button visible; full Stripe redirect manual |
| **Open Stripe dashboard** | Partial | Yes | When `onboarded` in dev |
| **Create payment (checkout session)** | Yes | Yes | API success or documented error |
| **Record manual payment** | Yes | Yes | API + UI panel |
| **Partial payments** | Yes | Yes | Two API payments + UI second draw |
| **Full payment → Paid** | Yes | Yes | |
| **Payment history on invoice** | Yes | Yes | Lines per method/date |
| **Payment validation** | Yes | Yes | Over balance; reference required |
| **Payment status updates** | Yes | Yes | Unpaid → Partial → Paid |
| **Invoice ↔ payment workflow** | Yes | Yes | Register on card; amounts sync |
| **Client payment visibility (guide)** | Yes | Yes | Invoices get-paid guide |
| **Return URL notices** | Yes | Yes | `?payment=success\|cancel` |
| **Dashboard payments CTA** | Yes | Yes | Collect payment + banner |
| **Settings hub navigation** | Yes | Yes | Open payments |
| **Search / filter by status** | Partial | Yes | Status on card; no global filter UI |
| **Send email / text / share link** | No | — | Present on invoice; not payments-spec E2E |
| **Stripe webhook E2E** | No | — | Requires Stripe CLI / live event |
| **Mobile / tablet / desktop** | Yes | Yes | Settings + invoices paths |

---

## Explicitly not in this sign-off

| Area | Reason |
|------|--------|
| Bill Payments (`/bill-payments`) | Different product surface (pay bills, not collect) |
| FieldBase subscription billing (`/subscriptions`) | Platform SaaS billing — separate audit |
| Owner platform Stripe env (`/api/invoices/payment-setup-status`) | Super-admin only |

---

## Open items (non-blocking)

| Item | Recommendation |
|------|----------------|
| Dedicated payment history report | Future module or export |
| Invoice list auto-refresh after external payment | Optional `fetchInvoices` on focus |
| Stripe webhook smoke in CI | Stripe CLI fixture job |

---

## Run verification

```powershell
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/payments-module.spec.js
npx playwright test tests/e2e/audit/invoices-module.spec.js -g "register partial"
```

---

## Approval

**Payments (client collections) module is signed off.**
