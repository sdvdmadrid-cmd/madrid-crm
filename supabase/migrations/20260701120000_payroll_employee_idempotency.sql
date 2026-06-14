-- Idempotency key for payroll employee creation (prevents duplicate POSTs)
alter table if exists public.payroll_employees
  add column if not exists create_idempotency_key text;

create unique index if not exists payroll_employees_tenant_idempotency_uidx
  on public.payroll_employees (tenant_id, create_idempotency_key)
  where create_idempotency_key is not null and create_idempotency_key <> '';
