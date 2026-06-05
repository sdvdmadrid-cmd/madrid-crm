begin;

-- ACH approval workflow columns and expanded statuses
alter table public.payroll_ach_batches
  drop constraint if exists payroll_ach_batches_status_check;

alter table public.payroll_ach_batches
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text not null default '',
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

alter table public.payroll_ach_batches
  add constraint payroll_ach_batches_status_check
  check (status in (
    'draft',
    'pending_review',
    'approved',
    'exported',
    'transmitted',
    'void'
  ));

alter table public.payroll_ach_batches
  alter column status set default 'draft';

-- Idempotency: one active batch per run
create unique index if not exists payroll_ach_batches_active_run_idx
  on public.payroll_ach_batches (run_id)
  where status not in ('void', 'transmitted');

-- Expense record idempotency on finalize
create unique index if not exists payroll_expense_records_run_item_idx
  on public.payroll_expense_records (run_item_id)
  where run_item_id is not null;

-- Job labor burden rollup
alter table public.jobs
  add column if not exists labor_burden_total numeric(12,2) not null default 0;

commit;
