# Estimates module — final sign-off

**Module:** Estimates (kanban `/estimates` + editor `/estimates/new`)  
**Sign-off date:** 2026-05-28  
**Signed off by:** Contractor usability audit (automated E2E + code review)  
**Status:** **APPROVED** — safe to proceed to Jobs module  

**Evidence:** `tests/e2e/audit/estimates-module.spec.js` (**17/17 passed** on 2026-05-28), `tests/e2e/contractor-usability.spec.js`, `tests/e2e/contractor-workflows.spec.js`, `tests/e2e/estimate-public-respond.spec.js`

---

## Feature matrix

| Feature | Tested | Passed | Failed | Not tested | Notes |
|---------|:------:|:------:|:------:|:----------:|-------|
| **Create Estimate** | Yes | Yes | — | — | + New Estimate → client search → Save as draft → kanban |
| **Edit Estimate** | Yes | Yes | — | — | Kanban “Edit estimate” + editor `?edit=`; scope/fields persist |
| **Save Draft** | Yes | Yes | — | — | Editor Save as draft; reload retains job description |
| **Send Estimate** | Yes | Yes | — | — | Kanban “Send to client”; editor Save & Send → preview → “Send to customer” (`?clientId=` prefill) |
| **Duplicate Estimate** | Yes | Yes | — | — | Kanban duplicate → new `?edit=` id |
| **Generate Contract** | Yes | Yes | — | — | Category/option/language → Save contract → persisted id |
| **Print Estimate** | Yes | Yes | — | — | `DocumentPdfActions` “Print estimate” (kanban + editor) |
| **PDF Generation** | Yes | Yes | — | — | `GET /api/estimates/:id/pdf` + `?download=1`; content-type PDF |
| **Kanban Workflow** | Yes | Yes | — | — | Five columns; card open/close; status actions; history loads |
| **Search** | Yes | Yes | — | — | Toolbar search; client name / # / address; `N shown` |
| **Filters** | Yes | Yes | — | — | Status dropdown; hide test data; `?clientId=` + clear |
| **Mobile Layout** | Yes | Yes | — | — | 390×844: kanban toolbar + editor actions scroll into view |
| **Desktop Layout** | Yes | Yes | — | — | 1280×800: kanban columns + detail drawer |
| **Client Linking** | Yes | Yes | — | — | `?clientId=` prefill; sent estimate has active Client link (`/estimate/…`) |
| **Data Persistence** | Yes | Yes | — | — | Save draft + full page reload; kanban shows updated scope notes |
| **Approval Workflow** | Yes | Yes | — | — | Approve + Confirm → Approved badge; Decline + Confirm → declined filter |

**Legend:** Tested = exercised in E2E or targeted API check this audit cycle. Passed = met contractor-ready bar. Failed = blocking defect (none). Not tested = intentionally out of scope for sign-off row.

---

## Sub-features (documented, non-blocking)

| Item | Tested | Passed | Notes |
|------|:------:|:------:|-------|
| Request changes (kanban) | No | — | Same confirm pattern as Approve/Decline; manual smoke only |
| Resend to client | Partial | Yes | Covered implicitly after first send (button label changes) |
| Print contract PDF | Yes | Yes | After contract save |
| Optimize with AI (editor) | No | — | Requires AI API; button present |
| SMS send (editor checkbox) | No | — | Email path verified; SMS not E2E |
| Public customer respond | Yes | Yes | `estimate-public-respond.spec.js` |

---

## Defects fixed during Estimates audit

- Estimate edit hydration race (scope notes wiped)
- Print/download split via `DocumentPdfActions`
- Contract panel auto-dismiss hiding PDF actions
- Contract PDF footer when panel closed
- `aria-label` on hide test data, close details, contract language

---

## Run verification

```powershell
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/estimates-module.spec.js
npx playwright test tests/e2e/contractor-workflows.spec.js -g "estimate"
```

---

## Approval

**Estimates module is signed off.** Next module in audit sequence: **Jobs / Work Orders**.

See also: [MODULE_AUDIT_ESTIMATES.md](./MODULE_AUDIT_ESTIMATES.md), [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md).
