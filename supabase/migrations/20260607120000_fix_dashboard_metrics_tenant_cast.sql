begin;

-- Support mixed tenant_id column types (uuid vs text) across legacy deployments.
create or replace function public.get_dashboard_metrics(
  p_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant text := p_tenant_id::text;
  v_clients_total integer := 0;
  v_clients_won integer := 0;
  v_clients_estimate_sent integer := 0;
  v_jobs_total integer := 0;
  v_jobs_active integer := 0;
  v_jobs_pending_draft integer := 0;
  v_jobs_pending_invoice integer := 0;
  v_invoices_total integer := 0;
  v_invoices_unpaid integer := 0;
  v_invoices_draft integer := 0;
  v_invoices_overdue integer := 0;
  v_contracts_total integer := 0;
  v_contracts_active integer := 0;
  v_estimate_requests_total integer := 0;
  v_estimate_requests_new integer := 0;
  v_website_leads_new integer := 0;
  v_total_revenue numeric(14,2) := 0;
  v_outstanding numeric(14,2) := 0;
begin
  if p_tenant_id is null then
    return '{}'::jsonb;
  end if;

  select count(*)::int into v_clients_total
  from public.clients where tenant_id::text = v_tenant;

  select count(*)::int into v_clients_won
  from public.clients
  where tenant_id::text = v_tenant and lead_status = 'won';

  select count(*)::int into v_clients_estimate_sent
  from public.clients
  where tenant_id::text = v_tenant and estimate_sent is true;

  select count(*)::int into v_jobs_total
  from public.jobs where tenant_id::text = v_tenant;

  select count(*)::int into v_jobs_active
  from public.jobs
  where tenant_id::text = v_tenant and status in ('Active', 'In Progress');

  select count(*)::int into v_jobs_pending_draft
  from public.jobs
  where tenant_id::text = v_tenant and status in ('Pending', 'Draft');

  select count(*)::int into v_jobs_pending_invoice
  from public.jobs
  where tenant_id::text = v_tenant
    and status = 'Completed'
    and coalesce(invoiced, false) = false;

  select count(*)::int into v_invoices_total
  from public.invoices where tenant_id::text = v_tenant;

  select count(*)::int into v_invoices_unpaid
  from public.invoices
  where tenant_id::text = v_tenant and status in ('Unpaid', 'Sent');

  select count(*)::int into v_invoices_draft
  from public.invoices
  where tenant_id::text = v_tenant and status = 'Draft';

  select count(*)::int into v_invoices_overdue
  from public.invoices
  where tenant_id::text = v_tenant and status in ('Overdue', 'Past Due');

  select count(*)::int into v_contracts_total
  from public.contracts where tenant_id::text = v_tenant;

  select count(*)::int into v_contracts_active
  from public.contracts
  where tenant_id::text = v_tenant and status <> 'Cancelled';

  select count(*)::int into v_estimate_requests_total
  from public.estimate_requests where tenant_id::text = v_tenant;

  select count(*)::int into v_estimate_requests_new
  from public.estimate_requests
  where tenant_id::text = v_tenant and status = 'new';

  select count(*)::int into v_website_leads_new
  from public.contractor_website_leads
  where tenant_id::text = v_tenant and status = 'new';

  select coalesce(sum(coalesce(price, 0)), 0)::numeric(14,2)
  into v_total_revenue
  from public.jobs
  where tenant_id::text = v_tenant;

  select coalesce(
    sum(coalesce(balance_due, amount, 0)),
    0
  )::numeric(14,2)
  into v_outstanding
  from public.invoices
  where tenant_id::text = v_tenant
    and coalesce(balance_due, 0) > 0;

  return jsonb_build_object(
    'clientsTotal', v_clients_total,
    'clientsWon', v_clients_won,
    'clientsEstimateSent', v_clients_estimate_sent,
    'jobsTotal', v_jobs_total,
    'jobsActive', v_jobs_active,
    'jobsPendingDraft', v_jobs_pending_draft,
    'jobsPendingInvoice', v_jobs_pending_invoice,
    'invoicesTotal', v_invoices_total,
    'invoicesUnpaid', v_invoices_unpaid,
    'invoicesDraft', v_invoices_draft,
    'invoicesOverdue', v_invoices_overdue,
    'contractsTotal', v_contracts_total,
    'contractsActive', v_contracts_active,
    'estimateRequestsTotal', v_estimate_requests_total,
    'estimateRequestsNew', v_estimate_requests_new,
    'websiteLeadsNew', v_website_leads_new,
    'totalRevenue', v_total_revenue,
    'outstanding', v_outstanding
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
