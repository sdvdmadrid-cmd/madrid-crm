-- Disk IO reduction: indexes for hot tenant-scoped filters and sorts
-- Date: 2026-06-14

-- Jobs: profit rollups + recent activity lists
create index if not exists idx_jobs_tenant_updated
  on public.jobs (tenant_id, updated_at desc);

create index if not exists idx_jobs_tenant_invoiced_status
  on public.jobs (tenant_id, status, invoiced)
  where invoiced = false;

-- Invoices: executive dashboard + AR queries
create index if not exists idx_invoices_tenant_balance_due
  on public.invoices (tenant_id, balance_due desc)
  where balance_due > 0;

create index if not exists idx_invoices_tenant_stripe_paid_at
  on public.invoices (tenant_id, stripe_last_payment_at desc)
  where stripe_last_payment_at is not null;

create index if not exists idx_invoices_tenant_updated
  on public.invoices (tenant_id, updated_at desc);

-- Clients: dashboard lead funnel counts
create index if not exists idx_clients_tenant_lead_status
  on public.clients (tenant_id, lead_status);

create index if not exists idx_clients_tenant_estimate_sent
  on public.clients (tenant_id, estimate_sent)
  where estimate_sent = true;

-- Job expenses: month-range P&L
create index if not exists idx_job_expenses_tenant_expense_date
  on public.job_expenses (tenant_id, expense_date desc);

-- Payroll expense records: month-range summaries
create index if not exists idx_payroll_expense_records_tenant_period
  on public.payroll_expense_records (tenant_id, period_date desc);

-- Estimates: list by tenant + updated
create index if not exists idx_estimates_tenant_updated
  on public.estimates (tenant_id, updated_at desc);
