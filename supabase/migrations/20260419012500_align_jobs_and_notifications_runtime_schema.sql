begin;

alter table if exists public.jobs
  add column if not exists invoiced boolean not null default false;

alter table if exists public.notifications
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists type text not null default 'info',
  add column if not exists read boolean not null default false,
  add column if not exists job_id uuid,
  add column if not exists job_title text not null default '',
  add column if not exists client_name text not null default '',
  add column if not exists quote_token text,
  add column if not exists client_message text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

update public.notifications
set
  type = coalesce(nullif(btrim(type), ''), 'info'),
  read = coalesce(read, false),
  job_title = coalesce(job_title, ''),
  client_name = coalesce(client_name, ''),
  client_message = coalesce(client_message, ''),
  metadata = coalesce(metadata, '{}'::jsonb),
  updated_at = coalesce(updated_at, created_at, now())
where
  type is null
  or btrim(type) = ''
  or read is null
  or job_title is null
  or client_name is null
  or client_message is null
  or metadata is null
  or updated_at is null;

commit;