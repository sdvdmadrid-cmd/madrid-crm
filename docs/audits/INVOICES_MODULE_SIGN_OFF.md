# Invoices module — final sign-off

**Module:** Invoices (`/invoices`)  
**Sign-off date:** 2026-05-28  
**Status:** **APPROVED** — proceed to Payments module  

**Evidence:** `tests/e2e/audit/invoices-module.spec.js` (**9/9 passed** on 2026-05-28)

---

## Feature matrix

| Feature | Tested | Passed | Notes |
|---------|:------:|:------:|-------|
| Create invoice (UI) | Yes | Yes | Client combobox + amount + due date |
| Edit / Update | Yes | Yes | Amount persists after reload |
| List search | Yes | Yes | After `filterAndRankRecords` import fix |
| Client filter (`?clientId=`) | Yes | Yes | Show all clears filter |
| Print / PDF | Yes | Yes | API + card links |
| Download PDF | Yes | Yes | API `?download=1` |
| Register payment | Yes | Yes | Cash partial → Partial + balances |
| Clear form | Yes | Yes | Exits edit mode |
| Mobile / tablet / desktop layout | Yes | Yes | Viewport specs |
| Send email / text / share / Stripe | Partial | — | Present; not full E2E in module spec |
| Delete invoice | No | — | Manual smoke |

---

## Blocking fix in this pass

- Missing `filterAndRankRecords` import caused **ReferenceError** on every list search — **fixed**.

---

## Run verification

```powershell
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/invoices-module.spec.js
```

---

## Approval

**Invoices module is signed off.** Next: **Payments** (`/settings/payments` + subscription billing flows).
