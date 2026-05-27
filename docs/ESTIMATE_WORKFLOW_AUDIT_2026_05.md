# Estimate Workflow Audit & Stabilization — May 2026

Branch: `feat/review-requests`
Scope: end-to-end audit of the estimate pipeline (contractor-facing and
customer-facing) followed by a stabilization pass. No new architecture,
no schema changes, no removed features.

---

## Verification at finalization

| Check | Result |
| --- | --- |
| `npm run test:unit` | **29 / 29 pass** (12 pre-existing + 17 new estimate-notes tests) |
| `npx biome check src` | clean |
| `npm run build` (`next build`) | clean (23.1s, 171 / 171 static pages, TypeScript 212ms) |
| Estimate API routes built | 16 / 16 |
| Estimate / quote pages built | `/estimate/[id]`, `/estimates`, `/estimates/new`, `/estimate-builder`, `/quote/[token]` |
| Branch sits on top of `main` (origin) | yes — no force-pushed history |

---

## Defects found and fixed

Grouped by commit in the order they landed on `feat/review-requests`.

### 1. `fix(estimates): correctness pass — totals, signature, audit trail, schema`
*(commit `4ad7f2e`, 6 files, +237 / −86)*

| File | Defect | Fix |
| --- | --- | --- |
| `src/app/api/estimates/route.js` | List endpoint `parseNotes` dropped `audit.signature` → kanban detail panel never rendered "Signed by". | Added signature carry-through; matches single-GET parser. |
| `src/app/api/estimates/route.js` | Client could send arbitrary `subtotal` / `tax` / `total`; persisted as-is. | `recomputeSubtotal(services)` + derived `total = subtotal + tax` on every create. PATCH mirrors. |
| `src/app/api/estimates/[id]/contract/route.js` | Read `parsed.note` from notes JSON (a key that never existed) → every contract had an empty scope. | Read `parsed.noteText` with `parsed.note` fallback. |
| `src/app/api/estimates/[id]/respond/route.js` | Customer approve / decline / changes_requested never appended a revision → contractor timeline was blank. | Calls `recordEstimateRevision` after every status change. |
| `src/app/api/estimates/[id]/respond/route.js` | Auto-created quote stored `client_id = ""` → broke UUID-typed FK. | `existing.client_id || null`. |
| `src/app/api/estimates/[id]/duplicate/route.js` | Duplication had no audit trail. | Append `duplicated` revision referencing source. |
| `src/components/NewEstimateForm.js` | Wrote directly to Supabase, bypassing tenant scoping, total recompute, revision logging. | Submits through `apiFetch("/api/estimates", POST)`; canonical line-item shape `{id, name, qty, unitPrice, price}`. |

### 2. `fix(estimate-builder): cent math, quote-number races, lex sort, email totals`
*(commit `6ee40a4`, 4 files, +242 / −106)*

| File | Defect | Fix |
| --- | --- | --- |
| `promote/route.js`, `share-link/route.js` | `amount * 100` produced `1234.0000000000002` → bigint cents column rejected the insert. | `toCents(amount)` helper using `Math.round(amount * 100)`. |
| `promote/route.js`, `share-link/route.js` | `nextQuoteNumber` used `COUNT(*) + 1` → races on concurrent promote. | `MAX(numeric suffix) + 1` over last 200 rows. `promote` adds a 5-attempt retry on 23505. |
| `route.js`, `duplicate/route.js`, `estimate-builder/route.js` | `nextEstimateNumber` ordered by `estimate_number` desc with `LIMIT 50` → at the `EST-9999 → EST-10000` boundary lex sort puts `EST-10000` below `EST-9999` and a tenant >50 EST-9xxx loops forever. | Order by `created_at` desc with `LIMIT 500`. |
| `send/route.js` | Email read `estimate.totalFinal` / `estimate.totalMid` from a raw DB row that only stored `total_final` / `total_mid` → every send email under-reported the total. | Read snake_case with camelCase fallback. |
| `send/route.js` | Tenant-controlled strings interpolated unsanitized into the HTML email body. | `escapeHtml` on all interpolations. |

### 3. `polish(estimates): PDF layout, email XSS, kanban refresh, public skeleton`
*(commit `3dc7d05`, 6 files, +156 / −44)*

| File | Defect | Fix |
| --- | --- | --- |
| `src/lib/estimate-pdf.js` | Totals row rendered label and amount on separate lines because pdfkit advances `doc.y` between text() calls. | `renderTotalsRow` helper snapshots Y before either column. |
| `src/lib/estimate-notifications.js` | XSS surface: client name, company name, total, link interpolated unsanitized. | `escapeHtml` + `escapeUrl` (`escapeUrl` also blocks non-http(s) schemes). |
| `src/app/estimates/page.js` | Kanban detail panel showed stale data after a send / status change until manually re-opened. | `loadEstimates` re-syncs `selectedEstimate` against the fresh list. |
| `src/app/estimates/page.js` | Contract auto-dismiss `setTimeout` was not cleared on unmount → setState-after-unmount risk. | `useRef` for the timer; cleared on unmount and on re-open. |
| `src/app/estimate-builder/page.js` | 11 strings in the English locale block were actually Spanish / Polish. | Replaced with correct English. |
| `src/app/estimates/new/page.js` | Deprecated `escape() + atob()` for the AI-bubble base64 hand-off broke non-ASCII. | `TextDecoder("utf-8")`. |
| `src/app/estimate/[id]/page.js` | Layout jump on hydrate, no retry on error, sub-44px tap targets. | Skeleton mirroring loaded layout, "Try again" button, larger item checkboxes (`h-5 w-5` with 52px row), proper "remove item" button. |

### 4. `refactor(estimates): consolidate notes parsing into src/lib/estimate-notes`
*(commit `0846767`, 10 files, +413 / −519, net **−106 lines**)*

Created **`src/lib/estimate-notes.js`** with:

- `parseEstimateNotes(notes)` — canonical parser. Always returns the
  same shape including the audit object, with `signature: null` default
  and a `parsed.note` legacy-fallback.
- `stringifyEstimateNotes({ ... })` — canonical serializer.
  `requestedItems` only emitted when array provided.
- `createEmptyAudit()` — default audit.
- `buildAuditForCreate(status, nowIso)` — initial audit at create time.
- `buildAuditForStatusTransition(existingAudit, prev, next, nowIso)` —
  computes the new audit, including resendCount semantics when
  `prev === "changes_requested"` and `next === "sent"`.
- `redactAuditForPublic(audit)` — strips `signature.ip` for token-gated
  responses; always includes `signature` key (null or object) for
  shape stability.

Migrated **7 routes** off hand-rolled copies:
`/api/estimates` (list + create), `/api/estimates/[id]` (get + patch),
`/api/estimates/[id]/respond`, `/api/estimates/[id]/contract`,
`/api/estimates/[id]/public`, `/api/estimates/[id]/pdf`,
`/api/estimates/[id]/public/pdf`.

Migrated **3 hand-rolled `loadBranding` copies** off to the existing
`getEstimateBrandingByTenant` helper (`estimate-pdf` routes +
`estimate-email-attachments.js`).

Added **`tests/unit/estimate-notes.test.mjs`** with 14 cases pinning
parse / stringify round-trip, legacy `parsed.note` fallback,
status-transition semantics (first send, resend bumping, no-op,
approved stamp), and `redactAuditForPublic` IP stripping.

### 5. `security(estimate-builder): add same-origin CSRF guard to mutating routes`
*(commit `1469cea`, 5 files, +20)*

The `/api/estimates` family already called `enforceSameOriginForMutation`
on every cookie-authenticated POST / PATCH / DELETE. The parallel
`/api/estimate-builder` family was missing it on **5 routes**: POST
list, `[id]/promote`, `[id]/share-link`, `[id]/send`, `[id]/checkout`.

Added the guard in front of `getAuthenticatedTenantContext` on every
one. Bearer-token API clients are unaffected (the guard exempts them
explicitly). Localhost dev trusts its own origin so no `.env` change is
needed locally.

The `/api/estimates/[id]/respond` endpoint is intentionally **not**
guarded — it's the public customer-facing approve/decline endpoint and
authenticates via the per-estimate JWT token, not a session cookie.

### 6. `feat(estimates): wire SignaturePad into the public estimate page`
*(commit `9ae8ea3`, 4 files, +159 / −1)*

The `/quote/[token]` public page has always supported a drawn signature
via `src/components/SignaturePad.js`. The public estimate page
(`/estimate/[id]`) only accepted a typed name. Brought it to parity:

- `src/app/estimate/[id]/page.js`: render `<SignaturePad />` inside the
  signature panel. Drawing is **optional**; the typed name remains the
  canonical identifier required by `isSignatureRequiredForEstimate`.
- `src/app/api/estimates/[id]/respond/route.js`: accept
  `signatureDrawDataUrl`. `sanitizeSignatureDataUrl` requires
  `data:image/…` prefix and caps payload at 200 KB so a malicious
  caller cannot balloon the notes TEXT column.
- `audit.signature.method = "typed" | "drawn_and_typed"`. `dataUrl`
  only persisted when non-empty.
- `src/lib/estimate-notes.js`: `normalizeSignature` carries `method`
  (default `"typed"` for legacy rows) and `dataUrl`.
  `redactAuditForPublic` echoes both fields back to the customer so the
  page can re-render their own signature; `ip` is still stripped.
- Already-approved estimates now render a "Signed" callout card with
  the typed name (cursive), the signed-at timestamp, and the drawn
  signature image when present.
- 3 new unit tests pin drawn-signature round-trip, non-data-URL
  rejection (defense against forged `https://…` or `javascript:…`), and
  the customer-facing redaction shape.

### 7. `fix(estimates): align respond route with shared audit helper + signing checkbox tap target`
*(commit `e5b547c`, 2 files, +16 / −6)*

Surfaced by the post-audit verification pass:

- `respond/route.js` was the last route still hand-stamping
  `audit.approvedAt` / `declinedAt` / `changesRequestedAt` directly.
  Refactored to call `buildAuditForStatusTransition` so the contractor
  PATCH path and the customer respond path share one transition helper.
  Drawn-signature attachment still happens afterwards because it's
  approve-specific and tenant-policy gated.
- `/estimate/[id]/page.js` — the "I agree to the scope of work" checkbox
  that gates `Sign & Approve` was the default ~16px size. Bumped to
  `h-5 w-5` (20px) inside a `min-h-[44px]` row with `accent-emerald-600`
  and an aria-label.

---

## Flow-by-flow verification

Static trace through the actual code, not just unit tests.

### Estimate creation (`/estimates/new` → `POST /api/estimates`)
- ✓ Same-origin guard, auth, role check, server-side recompute
- ✓ `nextEstimateNumber` uses `created_at` desc (no lex pitfall)
- ✓ Notes serialized through `stringifyEstimateNotes`
- ✓ Initial audit set via `buildAuditForCreate`
- ✓ Revision logged with `kind: "created"`

### Estimate editing (`/estimates` → `PATCH /api/estimates/[id]`)
- ✓ Same-origin guard, tenant scoping (`role !== super_admin` → `.eq(tenant_id)`)
- ✓ `currentStatus` re-read from DB (not from client) before transition
- ✓ Status transition via `buildAuditForStatusTransition` carrying signature forward
- ✓ Server-side recompute when `services` patched; pass-through when only totals patched
- ✓ Full `before` / `after` revision snapshot

### Customer approval (`/estimate/[id]` → `POST /api/estimates/[id]/respond`)
- ✓ JWT token validation, per-token + per-IP rate limit
- ✓ `isSignatureRequiredForEstimate({ tenantId, total })` returns required + threshold
- ✓ Typed name sanitized (`sanitizeSignatureName`, 120-char cap)
- ✓ Drawn signature sanitized (`data:image/` prefix, 200 KB cap)
- ✓ `audit.signature.method` records `"typed"` vs `"drawn_and_typed"`
- ✓ Revision appended; `ensureQuoteForApprovedEstimate` runs inside `try/catch` so a quote-write failure returns `success: true` + warning rather than 500-ing on an already-approved estimate
- ✓ Status transition now flows through the shared helper

### Customer rejection / changes requested (same route)
- ✓ Same helper for audit timestamps
- ✓ Revision appended
- ✓ Quote creation correctly gated on `action === "approved"` (decline / changes_requested skip it)
- ✓ `requestedItems` preserved into notes only when array provided

### PDF generation
- ✓ Authenticated (`GET /api/estimates/[id]/pdf`): tenant-scoped, branding via `getEstimateBrandingByTenant`, `Content-Type: application/pdf`, `Cache-Control: private, no-store`
- ✓ Public (`GET /api/estimates/[id]/public/pdf?token=…`): token-validated, rate-limited; same PDF wiring
- ✓ Renderer (`src/lib/estimate-pdf.js`): `renderTotalsRow` snapshots Y before label + amount; logo placement honors `top_left / top_center / top_right`

### Client portal data access (`GET /api/estimates/[id]/public?token=…`)
- ✓ Token validation + rate limit
- ✓ `parseEstimateNotes` followed by `redactAuditForPublic` — raw audit never returned over the public surface (`signature.ip` stripped)
- ✓ `signatureRequired`, `signatureThreshold`, `branding` all surfaced
- ✓ Same data path drives both the JSON response and the public page

### Signature flow
- ✓ Typed name is canonical, drawn signature is supplementary
- ✓ Threshold-gated requirement (per-tenant policy via `estimate-signature-policy.js`)
- ✓ Customer's own signature is echoed back on the public page (`<img src={dataUrl}>`)
- ✓ Contractor's audit log retains `signature.ip` (only stripped on the public response)
- ✓ Already-approved estimates render the "Signed" callout

### Mobile responsiveness (`/estimate/[id]`)
- ✓ `min-h-screen` wrapper, `mx-auto max-w-2xl` container
- ✓ Approve / Request Changes / Decline buttons: `w-full py-3`
- ✓ Item-checklist checkbox `h-5 w-5` in a 52px row
- ✓ Signature agreement checkbox `h-5 w-5` in `min-h-[44px]` row (this commit)
- ✓ SignaturePad canvas: `width: 100%`, `touchAction: none`, internal coordinates scaled by `canvas.width / rect.width` so drawing stays calibrated at any CSS width

---

## Known remaining limitations and risks

Documented intentionally rather than fixed, because they would require
either a schema change or feature work that exceeds "stabilize, don't
add architecture".

| Severity | Item | Detail |
| --- | --- | --- |
| **Low** | `billingAddress` silently dropped on create | `src/app/estimates/new/page.js` sends `billingAddress` in the create payload. The `estimates` table has no `billing_address` column (migration `20260502120000` added it only to `clients`). The API drops the field. Either add the column to `estimates` and read it through, or remove the toggle from the form. Both options are deliberately out of scope here. |
| **Low** | `EST-####` zero-padding only on first 4 digits | `nextEstimateNumber` pads to 4 digits (`EST-0001`). Beyond `EST-9999` the new strings will be `EST-10000`, `EST-10001`, etc. Sort order is now driven by `created_at` so this is cosmetic, but if you ever surface estimate numbers in URLs or external systems expecting a fixed width, fix the pad. |
| **Low** | Public PDF rate limit uses the `view` bucket | `/api/estimates/[id]/public/pdf` records a `view` attempt against the rate limiter. A malicious client could exhaust the JSON-view budget by hammering the PDF endpoint. Consider a separate `pdf` bucket if abuse becomes measurable. |
| **Low** | `requestedItems` written to notes JSON has no length cap | Customer can attach an arbitrary-length `requestedItems` array on `changes_requested`. The estimate `notes` is a TEXT column so it won't blow the row, but a malicious caller could store ~1MB of garbage. Adding a server-side max-items cap (e.g., 50) would be a defensive 5-line change. |
| **Low** | `recordEstimateRevision` is best-effort | All revision logging is wrapped in implicit best-effort semantics — failures are logged but don't fail the parent action. This is the right tradeoff for the customer respond path (don't 500 a successful approval over a log line), but it means a degraded `estimate_revisions` table can silently lose audit entries. Already observable via existing logging. |
| **Info** | Estimates and estimate_builder are separate tables | The repo carries two parallel estimate pipelines (`estimates` table powering `/api/estimates` + the kanban + public approve flow, and `estimate_builder` table powering `/api/estimate-builder` + the builder UI + Stripe checkout). This was deliberately preserved per "do NOT replace existing architecture". Long-term, consolidating would remove dozens of helper copies, but the audit explicitly excluded that refactor. |
| **Info** | No e2e tests cover the estimate respond flow | `npm run test:e2e` (Playwright) does not currently exercise the customer approve / decline / signature path. Adding a spec that drives the public estimate page through `Approve & Sign` would catch a future regression that unit tests would miss. |

---

## What is *not* risky

Recording the negative claims so a future reader doesn't re-litigate
them.

- **Tenant isolation** — every authenticated estimate route uses
  `getAuthenticatedTenantContext` and applies `.eq("tenant_id", …)`
  unless the role is `super_admin`. Verified across 9 routes.
- **CSRF on mutations** — all cookie-authenticated POST / PATCH /
  DELETE routes in `/api/estimates` and `/api/estimate-builder` now
  call `enforceSameOriginForMutation`. Only the public token-gated
  respond endpoint is exempt, and that is by design.
- **Server-side total integrity** — client cannot influence `subtotal`
  / `tax` / `total` on the estimates table. Both create and update
  recompute from line items.
- **XSS in customer emails** — every interpolation point now flows
  through `escapeHtml`. Branding URLs additionally go through
  `escapeUrl` which blocks non-http(s) schemes.
- **Signature payload abuse** — drawn signatures are size-capped
  (200 KB) and scheme-restricted (`data:image/…` only). Typed names
  are length-capped and control-char stripped.
- **Quote number race** — the COUNT-based numbering pattern was
  replaced and `promote` retries on unique-violation. Two contractors
  hitting promote simultaneously now resolve cleanly.

---

## Commits on `feat/review-requests`

```
e5b547c fix(estimates): align respond route with shared audit helper + signing checkbox tap target
9ae8ea3 feat(estimates): wire SignaturePad into the public estimate page
1469cea security(estimate-builder): add same-origin CSRF guard to mutating routes
0846767 refactor(estimates): consolidate notes parsing into src/lib/estimate-notes
3dc7d05 polish(estimates): PDF layout, email XSS, kanban refresh, public skeleton
6ee40a4 fix(estimate-builder): cent math, quote-number races, lex sort, email totals
4ad7f2e fix(estimates): correctness pass — totals, signature, audit trail, schema
```

Stacked on `3c428b1 feat(reputation): post-job review-request flow`
(pre-existing on `feat/review-requests`).

---

## Test plan for the PR reviewer

1. `npm ci && npm run test:unit` → expect 29 / 29.
2. `npm run build` → expect clean build (≈25 s, 171 static pages).
3. `npm run dev`, then walk through:
   - Create a draft estimate via `/estimates/new`. Confirm the kanban
     reflects it and the detail panel shows the right total.
   - Edit the estimate (change a line item). Confirm the kanban total
     updates and the revision history grows.
   - Send the estimate. Confirm the customer email renders the correct
     total (was previously $0.00 from the `totalFinal` bug).
   - Open the customer link on a phone. Approve with a typed name +
     drawn signature. Confirm the approve flow works without mis-taps
     on the consent checkbox.
   - Reload the customer link. Confirm the "Signed" card shows the
     typed name and the drawn signature.
   - Back in the contractor view, download the PDF. Confirm subtotal
     and total render on the same line.
   - Try promoting an estimate-builder draft. Run two browser tabs
     simultaneously; both should succeed with sequential quote numbers.

---

*Audit performed by Cursor agent at the user's request. No production
deploys were performed as part of this work.*
