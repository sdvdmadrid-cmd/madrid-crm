-- Compatibility migration for older bill payments schema.
-- The richer bill payments feature migration already creates the canonical tables.

do $$
begin
  if to_regclass('public.bills') is null then
    create table public.bills (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users (id) on delete cascade,
      provider_name text not null,
      account_number text not null,
      amount_due numeric(10, 2) not null,
      due_date date not null,
      created_at timestamp default now(),
      updated_at timestamp default now()
    );
  end if;

  if to_regclass('public.payment_methods') is null
     and to_regclass('public.bill_payment_methods') is null then
    create table public.payment_methods (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users (id) on delete cascade,
      method_type text check (method_type in ('credit_card', 'debit_card', 'bank_account')) not null,
      stripe_payment_method_id text not null,
      created_at timestamp default now()
    );
  end if;

  if to_regclass('public.autopay_schedules') is null
     and to_regclass('public.bill_autopay_rules') is null then
    create table public.autopay_schedules (
      id uuid primary key default gen_random_uuid(),
      bill_id uuid references public.bills (id) on delete cascade,
      payment_method_id uuid references public.payment_methods (id) on delete cascade,
      rule text check (rule in ('full_balance', 'fixed_amount', 'minimum_amount')) not null,
      fixed_amount numeric(10, 2),
      schedule_type text check (schedule_type in ('due_date', 'days_before', 'monthly_recurring')) not null,
      days_before_due integer,
      monthly_recurring_day integer,
      is_active boolean default true,
      created_at timestamp default now(),
      updated_at timestamp default now()
    );
  end if;
end
$$;