begin;

create table if not exists public.estimate_builder (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  created_by uuid,
  name text not null default '',
  notes text not null default '',
  description text not null default '',
  lines jsonb not null default '[]'::jsonb,
  total_low numeric not null default 0,
  total_high numeric not null default 0,
  total_mid numeric not null default 0,
  total_final numeric not null default 0,
  client_id text,
  "clientId" text,
  quote_id text,
  "quoteId" text,
  last_sent_at timestamptz,
  "lastSentAt" timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists estimate_builder_tenant_updated_idx
  on public.estimate_builder (tenant_id, updated_at desc);
create index if not exists estimate_builder_user_idx
  on public.estimate_builder (user_id);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text,
  created_by text,
  name text not null default '',
  subject text not null default '',
  html text not null default '',
  text text not null default '',
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  metrics jsonb not null default '{"delivered":0,"opened":0,"clicked":0,"bounced":0,"complained":0,"replied":0}'::jsonb,
  status text not null default 'processing',
  batch_size integer not null default 50,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists email_campaigns_tenant_created_idx
  on public.email_campaigns (tenant_id, created_at desc);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  recipient text not null,
  provider text,
  provider_message_id text,
  status text not null default 'sent',
  error text,
  event_type text,
  invoice_id text,
  invoice_number text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_event_at timestamptz
);

create index if not exists email_logs_tenant_created_idx
  on public.email_logs (tenant_id, created_at desc);
create index if not exists email_logs_campaign_idx
  on public.email_logs (campaign_id);
create index if not exists email_logs_provider_msg_idx
  on public.email_logs (provider_message_id);

create table if not exists public.email_inbound (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text,
  provider text,
  "from" text not null,
  "to" text,
  subject text not null default '',
  text text not null default '',
  html text not null default '',
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  provider_message_id text,
  in_reply_to text,
  status text not null default 'received',
  received_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists email_inbound_tenant_created_idx
  on public.email_inbound (tenant_id, created_at desc);
create index if not exists email_inbound_campaign_idx
  on public.email_inbound (campaign_id);

commit;
