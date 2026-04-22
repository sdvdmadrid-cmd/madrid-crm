begin;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  invoice_id uuid not null,
  job_id uuid,
  client_id uuid,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'usd',
  provider text not null default 'stripe',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'expired', 'canceled')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  checkout_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  failed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_invoice_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_invoice_id_fkey
      foreign key (invoice_id) references public.invoices(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_job_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_job_id_fkey
      foreign key (job_id) references public.jobs(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_client_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null;
  end if;
end $$;

create index if not exists payments_tenant_invoice_idx
  on public.payments (tenant_id, invoice_id, created_at desc);

create index if not exists payments_invoice_status_idx
  on public.payments (invoice_id, status, created_at desc);

create unique index if not exists payments_stripe_session_id_unique_idx
  on public.payments (stripe_session_id)
  where stripe_session_id is not null and stripe_session_id <> '';

insert into public.payments (
  tenant_id,
  user_id,
  invoice_id,
  job_id,
  client_id,
  amount,
  currency,
  provider,
  status,
  stripe_session_id,
  metadata,
  completed_at,
  created_by,
  created_at,
  updated_at
)
select
  i.tenant_id,
  i.user_id,
  i.id,
  i.job_id,
  i.client_id,
  greatest(coalesce((entry.value ->> 'amount')::numeric, 0), 0),
  'usd',
  'legacy',
  'completed',
  case
    when coalesce(entry.value ->> 'reference', '') like 'cs_%' then entry.value ->> 'reference'
    else null
  end,
  jsonb_build_object(
    'backfilled', true,
    'legacyPayment', entry.value
  ),
  coalesce(
    nullif(entry.value ->> 'createdAt', '')::timestamptz,
    case
      when coalesce(entry.value ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then ((entry.value ->> 'date') || 'T00:00:00Z')::timestamptz
      else i.updated_at
    end,
    i.updated_at,
    i.created_at,
    timezone('utc', now())
  ),
  coalesce(i.created_by, i.user_id),
  coalesce(
    nullif(entry.value ->> 'createdAt', '')::timestamptz,
    case
      when coalesce(entry.value ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then ((entry.value ->> 'date') || 'T00:00:00Z')::timestamptz
      else i.created_at
    end,
    i.created_at,
    timezone('utc', now())
  ),
  coalesce(
    nullif(entry.value ->> 'createdAt', '')::timestamptz,
    case
      when coalesce(entry.value ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then ((entry.value ->> 'date') || 'T00:00:00Z')::timestamptz
      else i.updated_at
    end,
    i.updated_at,
    timezone('utc', now())
  )
from public.invoices i
cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality as entry(value, ordinality)
where jsonb_typeof(coalesce(i.payments, '[]'::jsonb)) = 'array'
  and not exists (
    select 1
    from public.payments p
    where p.invoice_id = i.id
  );

do $$
begin
  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients'
  ) then
    execute 'alter table public.clients enable row level security';
    execute 'alter table public.clients force row level security';
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'jobs'
  ) then
    execute 'alter table public.jobs enable row level security';
    execute 'alter table public.jobs force row level security';
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invoices'
  ) then
    execute 'alter table public.invoices enable row level security';
    execute 'alter table public.invoices force row level security';
  end if;
end $$;

alter table public.payments enable row level security;
alter table public.payments force row level security;

drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
drop policy if exists payments_delete on public.payments;

create policy payments_select
  on public.payments
  for select
  to authenticated
  using (public.is_row_owner(user_id) or public.is_tenant_member(tenant_id));

notify pgrst, 'reload schema';

commit;