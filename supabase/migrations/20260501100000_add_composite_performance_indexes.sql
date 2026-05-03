-- ============================================================
-- COMPOSITE PERFORMANCE INDEXES FOR 1000+ USER SCALE
-- Date: 2026-05-01
--
-- These compound indexes cover the hottest query patterns:
-- (tenant_id + status), (tenant_id + created_at), etc.
-- They allow PostgreSQL to satisfy the WHERE clause AND the
-- ORDER BY from a single index scan, eliminating sort steps.
-- ============================================================

-- ── clients ─────────────────────────────────────────────────
-- Most queries filter by tenant_id + search name or status
create index if not exists idx_clients_tenant_created
  on public.clients (tenant_id, created_at desc);

create index if not exists idx_clients_tenant_name
  on public.clients (tenant_id, name);

-- ── jobs ────────────────────────────────────────────────────
-- Dashboard and job list: filter by tenant + status, sort by date
create index if not exists idx_jobs_tenant_status_created
  on public.jobs (tenant_id, status, created_at desc);

create index if not exists idx_jobs_tenant_client
  on public.jobs (tenant_id, client_id);

-- ── invoices ────────────────────────────────────────────────
-- Hottest table: filter tenant + status + sort by date
create index if not exists idx_invoices_tenant_status_created
  on public.invoices (tenant_id, status, created_at desc);

create index if not exists idx_invoices_tenant_due
  on public.invoices (tenant_id, due_date desc);

create index if not exists idx_invoices_tenant_client
  on public.invoices (tenant_id, client_id);

-- ── estimates ───────────────────────────────────────────────
create index if not exists idx_estimates_tenant_status_created
  on public.estimates (tenant_id, status, created_at desc);

-- ── payments ────────────────────────────────────────────────
-- Webhook processing + invoice payment summary
create index if not exists idx_payments_tenant_status_created
  on public.payments (tenant_id, status, created_at desc);

create index if not exists idx_payments_stripe_session
  on public.payments (stripe_session_id)
  where stripe_session_id is not null;

-- ── appointments ────────────────────────────────────────────
-- Calendar view: tenant + date range is the dominant pattern
create index if not exists idx_appointments_tenant_date
  on public.appointments (tenant_id, date, time);

create index if not exists idx_appointments_tenant_status_date
  on public.appointments (tenant_id, status, date);

-- ── notifications ───────────────────────────────────────────
-- Unread count badge: tenant + user + read status
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, read, created_at desc)
  where read = false;

-- ── bills ───────────────────────────────────────────────────
-- Bill payments list: tenant + status + due_date is dominant
create index if not exists idx_bills_tenant_status_due
  on public.bills (tenant_id, status, due_date);

create index if not exists idx_bills_autopay_due
  on public.bills (tenant_id, autopay_enabled, due_date)
  where autopay_enabled = true;

-- ── bill_payment_transactions ────────────────────────────────
-- History page: tenant + created_at DESC
create index if not exists idx_bill_txns_tenant_created
  on public.bill_payment_transactions (tenant_id, created_at desc);

create index if not exists idx_bill_txns_tenant_status
  on public.bill_payment_transactions (tenant_id, status);

-- ── contractor_website_leads ─────────────────────────────────
-- Lead inbox: tenant + status + created_at
create index if not exists idx_leads_tenant_status_created
  on public.contractor_website_leads (tenant_id, status, created_at desc);

-- ── estimate_requests ────────────────────────────────────────
create index if not exists idx_estimate_requests_tenant_created
  on public.estimate_requests (tenant_id, created_at desc);

-- ── profiles ─────────────────────────────────────────────────
-- Auth: look up profiles by tenant + role (user_id does not exist in this table)
create index if not exists idx_profiles_tenant_role
  on public.profiles (tenant_id, role);

-- ── services_catalog ─────────────────────────────────────────
create index if not exists idx_services_catalog_tenant_category
  on public.services_catalog (tenant_id, category);
