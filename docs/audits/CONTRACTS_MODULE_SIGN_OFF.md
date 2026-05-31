# Contracts module — final sign-off

**Module:** Contracts (library + estimate-originated agreements)  
**Sign-off date:** 2026-05-28  
**Status:** **APPROVED** — proceed to **Lead Inbox** (next in sequence)

**Evidence:** `tests/e2e/audit/contracts-module.spec.js` (**8/8 passed** on 2026-05-28)

---

## Feature matrix

| Feature | Tested | Passed | Notes |
|---------|:------:|:------:|-------|
| **Contract library page** | Yes | Yes | `/contracts` — new this audit |
| **Sidebar navigation** | Yes | Yes | Contractor + admin nav |
| **Search contracts** | Yes | Yes | `filterAndRankRecords` |
| **Status filter** | Yes | Yes | Dynamic options; E2E via PATCH |
| **Client filter (`?clientId=`)** | Yes | Yes | Banner + clear |
| **Generate from estimate** | Yes | Yes | Kanban drawer UI |
| **Save / persist contract** | Yes | Yes | API + UI |
| **List after save** | Yes | Yes | Library search |
| **Print contract (PDF API)** | Yes | Yes | Card + drawer |
| **Download PDF** | Yes | Yes | |
| **Print (browser)** | Yes | Yes | Button on library cards |
| **GET /api/contracts** | Yes | Yes | |
| **PATCH status (API)** | Yes | Yes | No library status editor UI |
| **Link to library after save** | Yes | Yes | “View all contracts” |
| **Mobile / tablet / desktop layout** | Yes | Yes | Library filter bar |
| **Dedicated status workflow UI** | No | — | Draft default only in product |
| **Open source estimate from card** | No | — | Friction doc — future |
| **E-signature** | No | — | Out of scope |

---

## Defects fixed during Contracts audit

- **No `/contracts` UI** despite API and architecture reference — added full library page
- Misleading post-save copy (“contract records” with nowhere to go)
- Missing nav entry and breadcrumb section
- Missing `import Link` on estimates page for library link
- E2E: auth order on kanban test; status filter uses real Signed row; strict locator on category text

---

## Open items (non-blocking)

| Item | Recommendation |
|------|----------------|
| “Open estimate” deep link on contract card | Pass `estimate_id` on save + link kanban |
| Collapse body preview on cards | Default collapsed; expand on tap |
| Status editor on library | Dropdown + PATCH |
| Fixed status filter options | Show Draft/Signed/Sent even when count is 0 |
| Reduce estimate drawer action count | Group secondary actions under “More” |
| es/pl i18n for kanban contract panel | Match library keys |
| Contracts summary on dashboard | Count by status |

---

## Run verification

```powershell
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/contracts-module.spec.js
```

---

## Approval

**Contracts module is signed off** for production-readiness tracking. Contractor daily use is materially improved by the contract library; remaining items are polish and workflow depth, not blockers.
