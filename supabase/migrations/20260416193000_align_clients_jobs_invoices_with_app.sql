begin;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'clients'
  ) then
    execute $sql$
      alter table public.clients
        alter column user_id drop not null
    $sql$;

    execute $sql$
      alter table public.clients
        add column if not exists company text not null default '',
        add column if not exists notes text not null default '',
        add column if not exists lead_status text not null default 'new_lead',
        add column if not exists estimate_sent boolean not null default false,
        add column if not exists won_at timestamptz,
        add column if not exists created_by uuid,
        add column if not exists updated_at timestamptz not null default timezone('utc', now())
    $sql$;

    execute $sql$
      update public.clients
      set
        company = coalesce(company, ''),
        notes = coalesce(notes, ''),
        lead_status = coalesce(nullif(lead_status, ''), 'new_lead'),
        estimate_sent = coalesce(estimate_sent, false),
        updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
      where
        company is null
        or notes is null
        or lead_status is null
        or estimate_sent is null
        or updated_at is null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'jobs'
  ) then
    execute $sql$
      alter table public.jobs
        alter column client_id drop not null,
        alter column user_id drop not null
    $sql$;

    execute $sql$
      alter table public.jobs
        add column if not exists client_name text not null default '',
        add column if not exists service text not null default '',
        add column if not exists price text not null default '',
        add column if not exists due_date text not null default '',
        add column if not exists tax_state text not null default '',
        add column if not exists down_payment_percent text not null default '0',
        add column if not exists scope_details text not null default '',
        add column if not exists square_meters text not null default '',
        add column if not exists complexity text not null default 'standard',
        add column if not exists materials_included boolean not null default true,
        add column if not exists travel_minutes text not null default '',
        add column if not exists urgency text not null default 'flexible',
        add column if not exists estimate_snapshot jsonb,
        add column if not exists created_by uuid,
        add column if not exists updated_at timestamptz not null default timezone('utc', now()),
        add column if not exists quote_token text,
        add column if not exists quote_shared_at timestamptz,
        add column if not exists quote_sent_at timestamptz,
        add column if not exists quote_sent_to text not null default '',
        add column if not exists quote_status text not null default 'draft',
        add column if not exists quote_approved_at timestamptz,
        add column if not exists quote_signed_at timestamptz,
        add column if not exists quote_approved_by_name text not null default '',
        add column if not exists quote_approved_by_email text not null default '',
        add column if not exists quote_signed_by_name text not null default '',
        add column if not exists quote_signed_by_email text not null default '',
        add column if not exists quote_signature_text text not null default '',
        add column if not exists contract_id uuid
    $sql$;

    execute $sql$
      update public.jobs
      set
        client_name = coalesce(client_name, ''),
        service = coalesce(service, ''),
        price = coalesce(price, ''),
        due_date = coalesce(due_date, ''),
        tax_state = coalesce(tax_state, ''),
        down_payment_percent = coalesce(nullif(down_payment_percent, ''), '0'),
        scope_details = coalesce(scope_details, ''),
        square_meters = coalesce(square_meters, ''),
        complexity = coalesce(nullif(complexity, ''), 'standard'),
        materials_included = coalesce(materials_included, true),
        travel_minutes = coalesce(travel_minutes, ''),
        urgency = coalesce(nullif(urgency, ''), 'flexible'),
        quote_sent_to = coalesce(quote_sent_to, ''),
        quote_status = coalesce(nullif(quote_status, ''), 'draft'),
        quote_approved_by_name = coalesce(quote_approved_by_name, ''),
        quote_approved_by_email = coalesce(quote_approved_by_email, ''),
        quote_signed_by_name = coalesce(quote_signed_by_name, ''),
        quote_signed_by_email = coalesce(quote_signed_by_email, ''),
        quote_signature_text = coalesce(quote_signature_text, ''),
        updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
      where
        client_name is null
        or service is null
        or price is null
        or due_date is null
        or tax_state is null
        or down_payment_percent is null
        or scope_details is null
        or square_meters is null
        or complexity is null
        or materials_included is null
        or travel_minutes is null
        or urgency is null
        or quote_sent_to is null
        or quote_status is null
        or quote_approved_by_name is null
        or quote_approved_by_email is null
        or quote_signed_by_name is null
        or quote_signed_by_email is null
        or quote_signature_text is null
        or updated_at is null
    $sql$;

    execute $sql$
      create unique index if not exists jobs_quote_token_unique_idx
        on public.jobs (quote_token)
        where quote_token is not null
    $sql$;

    execute $sql$
      create index if not exists jobs_contract_id_idx
        on public.jobs (contract_id)
        where contract_id is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'invoices'
  ) then
    execute $sql$
      alter table public.invoices
        alter column job_id drop not null,
        alter column user_id drop not null,
        alter column items set default '[]'::jsonb,
        alter column status set default 'Unpaid'
    $sql$;

    execute $sql$
      alter table public.invoices
        add column if not exists client_id uuid,
        add column if not exists invoice_number text not null default '',
        add column if not exists invoice_title text not null default '',
        add column if not exists client_name text not null default '',
        add column if not exists client_email text not null default '',
        add column if not exists amount numeric(12,2) not null default 0,
        add column if not exists notes text not null default '',
        add column if not exists preferred_payment_method text not null default 'bank_transfer',
        add column if not exists payments jsonb not null default '[]'::jsonb,
        add column if not exists paid_amount numeric(12,2) not null default 0,
        add column if not exists balance_due numeric(12,2) not null default 0,
        add column if not exists created_by uuid,
        add column if not exists updated_at timestamptz not null default timezone('utc', now()),
        add column if not exists last_checkout_session_id text not null default '',
        add column if not exists last_checkout_url text not null default '',
        add column if not exists invoice_email_last_attempt_at timestamptz,
        add column if not exists invoice_email_last_attempt_to text not null default '',
        add column if not exists invoice_email_sent_at timestamptz,
        add column if not exists invoice_email_sent_to text not null default '',
        add column if not exists stripe_last_payment_session_id text not null default '',
        add column if not exists stripe_last_payment_at timestamptz,
        add column if not exists contract_id uuid,
        add column if not exists contract_status text not null default ''
    $sql$;

    execute $sql$
      update public.invoices
      set
        items = coalesce(items, '[]'::jsonb),
        invoice_number = coalesce(invoice_number, ''),
        invoice_title = coalesce(invoice_title, ''),
        client_name = coalesce(client_name, ''),
        client_email = coalesce(client_email, ''),
        amount = coalesce(amount, 0),
        notes = coalesce(notes, ''),
        preferred_payment_method = coalesce(nullif(preferred_payment_method, ''), 'bank_transfer'),
        payments = coalesce(payments, '[]'::jsonb),
        paid_amount = coalesce(paid_amount, 0),
        balance_due = coalesce(balance_due, coalesce(amount, 0)),
        last_checkout_session_id = coalesce(last_checkout_session_id, ''),
        last_checkout_url = coalesce(last_checkout_url, ''),
        invoice_email_last_attempt_to = coalesce(invoice_email_last_attempt_to, ''),
        invoice_email_sent_to = coalesce(invoice_email_sent_to, ''),
        stripe_last_payment_session_id = coalesce(stripe_last_payment_session_id, ''),
        contract_status = coalesce(contract_status, ''),
        updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
      where
        items is null
        or invoice_number is null
        or invoice_title is null
        or client_name is null
        or client_email is null
        or amount is null
        or notes is null
        or preferred_payment_method is null
        or payments is null
        or paid_amount is null
        or balance_due is null
        or last_checkout_session_id is null
        or last_checkout_url is null
        or invoice_email_last_attempt_to is null
        or invoice_email_sent_to is null
        or stripe_last_payment_session_id is null
        or contract_status is null
        or updated_at is null
    $sql$;

    execute $sql$
      create index if not exists invoices_contract_id_idx
        on public.invoices (contract_id)
        where contract_id is not null
    $sql$;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;