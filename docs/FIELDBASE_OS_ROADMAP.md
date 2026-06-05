# FieldBase OS — Product Roadmap

**Core promise:** Track bills, manage expenses, document job progress, pay your vendors, and know the profit on every job.

FieldBase is the **operating system for contractors and landscapers** — not a national bill payment network.

## Never build

- National bill pay network (Doxo / Bill.com / Melio competitor)
- Utility AutoPay platform
- Credit card payment hub for third-party billers
- Predefined supplier lists (SiteOne, utilities, card issuers, etc.)
- Paying Verizon, ComEd, Chase, or other national billers through FieldBase

## Development priorities

| # | Module | Status |
|---|--------|--------|
| 1 | Job Photos & Documentation | ✅ Dedicated `/jobs/[id]/photos` tab |
| 2 | Bills & Expenses (tracker) | ✅ `/expenses` — vendors + bills, no wallet |
| 3 | Vendor Directory | ✅ Tenant-created vendors, material stores |
| 4 | Job Costing Hub | ⚠️ P&L exists; bills roll into job totals |
| 5 | Daily Job Reports | ✅ `/jobs/[id]/daily-reports` |
| 6 | Vendor Payments (ACH/checks) | 🔮 Phase 2 — tenant vendors only |

## Vendor directory

Contractors create their own vendors — examples only, never required:

- Material stores (SiteOne, Menards, Home Depot, Lowe's, local suppliers)
- Subcontractors
- Equipment rental companies
- Dump sites
- Fuel vendors
- Nurseries & landscape supply

Fields: name, category, contact, phone, email, address, website, payment terms, notes, documents.

## Bills & Expenses

- Bills linked to **vendors** (required) and optionally **jobs**
- Mark paid / unpaid, recurring, reminders (notifications pattern)
- Portal link + attachments (path fields on bills)
- CSV export for accountant
- **No** wallet, AutoPay, Processing Center, remittance queue

## Job costing

Unified roll-up per job:

- Materials, labor (payroll), equipment, subcontractors, dump, fuel
- Bills assigned to the job (`bills.job_id`)
- Revenue, gross profit, margin on `/jobs/[id]/financial`

## Daily job reports

- Date, crew, hours, materials, equipment, weather, notes, photos
- Connects to payroll, costing, photos, AI (future)

## Launch scope

CRM · Leads · Estimates · Contracts · Jobs · Invoices · Stripe client payments · Payroll · Time tracking · Job Photos · Bills & Expenses · Vendor Directory · Job Costing · Daily Reports · AI · Website

## Legacy code (frozen)

`/bill-payments` and `/api/bill-payments` remain disabled in middleware. Do not re-enable national bill-pay flows.
