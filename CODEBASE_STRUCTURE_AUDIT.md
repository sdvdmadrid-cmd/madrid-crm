# Codebase Structure Audit
**Generated:** April 30, 2026

---

## 1. FEEDBACK DATA STORAGE

### Status: ⚠️ **NOT IMPLEMENTED**
- Feedback submission UI exists in `AuthShell.js` (lines 347-433)
- Frontend submits to endpoint: `POST /api/feedback`
- **Route file `/api/feedback/route.js` DOES NOT EXIST**
- No database table for feedback found in migrations

### Frontend Implementation
- **Component:** [src/components/AuthShell.js](src/components/AuthShell.js#L415)
- **Modal fields:**
  - Type: suggestion/bug/feature_request
  - Message: text (required)
  - Screenshot: optional image (<1.5MB)
  - Current page path

### Required Implementation
Need to create:
1. `src/app/api/feedback/route.js` (POST handler)
2. `supabase/migrations/XXXXXX_create_feedback_table.sql`
3. Feedback table schema with: `id, tenant_id, user_id, type, message, screenshot_data_url, current_page, created_at, updated_at`

---

## 2. PAYMENT PROCESSING FLOW (STRIPE INTEGRATION)

### Core Payment Tables
| Table Name | Purpose | Key Columns |
|---|---|---|
| `payments` | Invoice/checkout payments | `id, tenant_id, invoice_id, stripe_session_id, amount, status, provider, created_at` |
| `bill_payment_transactions` | Bill autopay transactions | `id, bill_id, stripe_payment_intent_id, amount, status, source` |
| `bill_payment_methods` | Saved payment methods | `stripe_payment_method_id, method_type (card/bank_account)` |
| `bill_payment_customers` | Stripe customer mapping | `stripe_customer_id, tenant_id` |
| `bills` | Bills to pay | `id, status, amount_due, autopay_enabled` |

### Invoice Checkout Flow
**API Routes:**
- `POST /api/invoices/[id]/checkout` - Create Stripe checkout session
- `POST /api/invoices/[id]/payments` - **DISABLED** (mutations blocked)
- `POST /api/estimate-builder/[id]/checkout` - Estimate checkout

**Key Flow:**
1. [src/lib/stripe-payments.js](src/lib/stripe-payments.js#L553) - `createStripeCheckoutSessionForAccess()`
2. Creates payment record with `status: 'pending'`
3. Generates Stripe session ID, stores in payment row
4. Returns `checkoutUrl`, `paymentId`, `sessionId`, `amount`

**Webhook Handler:**
- Route: `POST /api/payments/webhooks/stripe`
- Events handled:
  - `checkout.session.completed` → payment marked `paid`
  - `checkout.session.async_payment_failed` → payment marked `failed`
  - `payment_intent.succeeded` → bill payment success
  - `payment_intent.payment_failed` → bill payment failure

**Stripe Secret Keys:**
- Environment: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [src/lib/stripe-payments.js](src/lib/stripe-payments.js#L104) - `getStripeServerClient()`

### Bill Autopay Flow
**Setup:**
- [src/lib/bill-payments.js](src/lib/bill-payments.js#L687) - `createBillPaymentSetupIntent()`
- Plaid integration for bank account linking
- [src/app/bill-payments/page.js](src/app/bill-payments/page.js#L3872) - UI for adding card/bank account

**Processing:**
- [src/lib/bill-payments.js](src/lib/bill-payments.js#L1137) - `processBillPayment()`
- Creates Stripe payment intent with ACH mandate if needed
- Source types: `manual`, `autopay`, `bulk`

**Recurring Bills:**
- [src/lib/bill-payments.js](src/lib/bill-payments.js) - `maybeCreateNextRecurringBill()`
- After successful payment, next bill created if frequency set

---

## 3. ADMIN PAGES & ACCESS CONTROL

### Admin Pages
| Page | Route | Access Control | Protection |
|---|---|---|---|
| Admin Dashboard | `/admin` | super_admin role only | Redirect to `/login?next=/admin` |
| Admin Overview API | `GET /api/admin/overview` | super_admin role | Role check in handler |
| Admin AI API | `POST /api/admin/ai` | super_admin role | Role check in handler |
| Platform Overview API | `GET /api/platform/overview` | super_admin role | Role check in handler |

### Access Control Layer

**Role Hierarchy:**
```
super_admin (platform owner)
  ├── admin / owner (tenant admin)
  ├── worker / contractor (standard user)
  └── viewer (read-only)
```

**File:** [src/lib/access-control.js](src/lib/access-control.js)
- `normalizeAppRole(role)` - Normalizes any role string
- `isSuperAdminRole(role)` - Checks `super_admin` only
- `isAdminRole(role)` - Checks `admin` or `super_admin`
- `canManageSensitiveData(role)` - Only admins
- `canDeleteRecords(role)` - Only admins

**Permission Matrix:**
| Permission | super_admin | admin | worker | viewer |
|---|---|---|---|---|
| Read tenant data | ✅ All | ✅ Own tenant | ✅ Own tenant | ✅ Own tenant |
| Write operational | ✅ | ✅ | ✅ | ❌ |
| Delete records | ✅ | ✅ | ❌ | ❌ |
| Manage sensitive | ✅ | ✅ | ❌ | ❌ |
| Send communications | ✅ | ✅ | ❌ | ❌ |

**Row-Level Security (RLS) Functions:**
- [supabase/migrations/20260416120000_create_profiles_and_rbac.sql](supabase/migrations/20260416120000_create_profiles_and_rbac.sql)
- `public.is_admin_profile()` - Check auth.jwt() for admin role
- `public.can_access_tenant(row_tenant_id uuid)` - RLS policy enforcement

### Role Extraction
From auth metadata (priority order):
1. `auth.jwt() -> 'app_metadata' -> 'role'`
2. `auth.jwt() -> 'user_metadata' -> 'role'`
3. Database `profiles.role`
4. Default: `'worker'` or `'contractor'`

**File:** [src/app/admin/page.js](src/app/admin/page.js#L12)
```javascript
function normalizeRole(user) {
  return String(user?.app_metadata?.role || user?.user_metadata?.role || "contractor")
    .toLowerCase();
}
```

---

## 4. PRICING & TRIAL STRUCTURES

### Trial System
**Duration:** 15 days (from `accountStatus()`)
**File:** [src/app/admin/page.js](src/app/admin/page.js#L25)

```javascript
function accountStatus(createdAt) {
  const createdMs = new Date(createdAt || 0).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return "Trial";
  const ageDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  return ageDays < 15 ? "Trial" : "Active";
}
```

### Pricing Data
**Display copy:** [src/components/auth/onboardingCopy.js](src/components/auth/onboardingCopy.js#L143)
- Price: $45.50/month (first month free in ES)
- Annual: $500/year
- Launch wave messaging with limited spot count

**User Metadata Fields:**
- `isSubscribed: boolean` - Subscription active flag
- `trialEndDate: ISO string` - Trial expiration date
- `trialStartDate: ISO string` - Trial start date
- `status: 'active' | 'trial' | 'expired'`

**Status Computation:**
[src/app/api/admin/ai/route.js](src/app/api/admin/ai/route.js#L4)
```javascript
function computeStatus(user) {
  const metadata = user?.user_metadata || {};
  if (metadata.isSubscribed === true) return "active";
  
  const raw = String(metadata.status || "").toLowerCase();
  if (["active", "trial", "expired"].includes(raw)) return raw;
  
  const now = Date.now();
  const trialEnd = metadata.trialEndDate ? new Date(metadata.trialEndDate).getTime() : 0;
  if (trialEnd > now) return "trial";
  return "expired";
}
```

### Pricing Table
- **services_catalog**: Min/max pricing per service category
- **estimate_builder**: Fixed pricing with tax rates by state
- **estimates & invoices**: Manual line items with totals

---

## 5. DEVELOPMENT/SUPER ADMIN CHECKS

### Dev Login Feature
**Route:** `GET /api/auth/dev-login`
**File:** [src/app/api/auth/dev-login/route.js](src/app/api/auth/dev-login/route.js#L25)

**Profiles (configurable via environment):**
```javascript
DEV_PROFILES = {
  super_admin: {
    tenantId: process.env.DEV_SUPERADMIN_TENANT_ID || "platform",
    email: process.env.DEV_SUPERADMIN_EMAIL || "owner@FieldBase.local",
    password: process.env.DEV_SUPERADMIN_PASSWORD,
    role: "super_admin"
  },
  admin: {
    tenantId: process.env.DEV_ADMIN_TENANT_ID || "tenant-admin",
    email: process.env.DEV_ADMIN_EMAIL || "admin@FieldBase.local",
    password: process.env.DEV_ADMIN_PASSWORD,
    role: "admin"
  },
  viewer: { ... },
  contractor: { ... }
}
```

**Environment Variables Required:**
- `DEV_SUPERADMIN_PASSWORD`
- `DEV_ADMIN_PASSWORD`
- `DEV_VIEWER_PASSWORD`
- `DEV_CONTRACTOR_PASSWORD`

**Security:**
- ✅ Only allowed on localhost (`127.0.0.1` or `localhost`)
- ✅ Origin header must match host
- ✅ NO default passwords - must be explicitly set
- ✅ Disabled in production (environment check)

**Usage:**
```bash
npm run dev:admin  # Uses dev-login with DEV_ADMIN_PASSWORD
```

**Test Usage:**
[tests/e2e/estimate-quote-invoice-flow.spec.js](tests/e2e/estimate-quote-invoice-flow.spec.js#L35)
```javascript
await page.goto("/api/auth/dev-login?profile=admin&redirect=%2Fdashboard", {
  waitUntil: "networkidle",
});
```

---

## 6. API ENDPOINT PATTERNS

### Authentication Middleware
- **File:** [middleware.js](middleware.js#L55)
- Public paths (whitelist):
  - `/login`, `/register`, `/api/auth/*`
  - `/api/payments/webhooks`, `/api/email/webhooks`
  - `/api/public/*`, `/legal*`
- Protected paths: Require session cookie validation
- Legal acceptance: Required after login (bypass: `/legal*`, `/api/legal`, `/login`)

### Tenant Context Pattern
All protected API routes use:
```javascript
const { tenantDbId, role, authenticated } = await getAuthenticatedTenantContext(request);

if (!authenticated) {
  return unauthenticatedResponse();
}

if (!canManageSensitive(role)) {
  return forbiddenResponse();
}

// Filter by tenant if not super_admin
let query = supabaseAdmin.from(TABLE).select(...);
if ((role || "").toLowerCase() !== "super_admin") {
  query = query.eq("tenant_id", tenantDbId);
}
```

---

## 7. SUMMARY TABLE

| Category | Status | Location | Notes |
|---|---|---|---|
| Feedback Storage | ⚠️ Missing | UI exists, no API/DB | Needs implementation |
| Payment Tables | ✅ Complete | Migrations | `payments`, `bills`, `bill_payment_*` |
| Stripe Webhooks | ✅ Implemented | `POST /api/payments/webhooks/stripe` | Handles checkout & intent events |
| Admin Access Control | ✅ Implemented | `/admin`, `/api/admin/*` | super_admin only, redirect enforcement |
| RLS Policies | ✅ Implemented | Database migrations | `is_admin_profile()`, `can_access_tenant()` |
| Trial System | ✅ Implemented | `user_metadata.trialEndDate` | 15-day duration |
| Dev Login | ✅ Implemented | `/api/auth/dev-login` | Localhost only, password-protected |
| Role Normalization | ✅ Implemented | `access-control.js` | All roles mapped to canonical set |

---

## 8. MIGRATION FILES REFERENCE

Key migrations in order:
1. `20260416120000_create_profiles_and_rbac.sql` - Profile RLS setup
2. `20260416193000_align_clients_jobs_invoices_with_app.sql` - Core tables
3. `20260418105000_create_missing_core_app_tables.sql` - Clients, jobs, estimates, invoices
4. `20260418170000_create_payments_table_and_secure_stripe.sql` - Payment table
5. `20260419173000_create_bill_payments_feature.sql` - Bill payments feature
6. `20260423120000_create_services_catalog_table.sql` - Services pricing

---

## Key Files Index

**Access Control:**
- [src/lib/access-control.js](src/lib/access-control.js)
- [src/lib/tenant.js](src/lib/tenant.js)

**Payments:**
- [src/lib/stripe-payments.js](src/lib/stripe-payments.js)
- [src/lib/bill-payments.js](src/lib/bill-payments.js)
- [src/app/api/payments/webhooks/stripe/route.js](src/app/api/payments/webhooks/stripe/route.js)

**Admin:**
- [src/app/admin/page.js](src/app/admin/page.js)
- [src/app/api/admin/overview/route.js](src/app/api/admin/overview/route.js)

**Auth:**
- [src/app/api/auth/dev-login/route.js](src/app/api/auth/dev-login/route.js)
- [middleware.js](middleware.js)
