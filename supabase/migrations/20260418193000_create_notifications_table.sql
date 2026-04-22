begin;

create extension if not exists "pgcrypto";

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  created_by uuid,
  type text not null default 'info' check (btrim(type) <> ''),
  title text not null default '',
  message text not null check (btrim(message) <> ''),
  read boolean not null default false,
  job_id uuid references public.jobs(id) on delete set null,
  job_title text not null default '',
  client_name text not null default '',
  quote_token text,
  client_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.notifications
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists type text not null default 'info',
  add column if not exists title text not null default '',
  add column if not exists message text,
  add column if not exists read boolean not null default false,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists job_title text not null default '',
  add column if not exists client_name text not null default '',
  add column if not exists quote_token text,
  add column if not exists client_message text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.notifications
set
  type = coalesce(nullif(btrim(type), ''), 'info'),
  title = coalesce(title, ''),
  message = coalesce(nullif(message, ''), 'Notification'),
  read = coalesce(read, false),
  job_title = coalesce(job_title, ''),
  client_name = coalesce(client_name, ''),
  client_message = coalesce(client_message, ''),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where
  type is null
  or btrim(type) = ''
  or title is null
  or message is null
  or btrim(message) = ''
  or read is null
  or job_title is null
  or client_name is null
  or client_message is null
  or metadata is null
  or created_at is null
  or updated_at is null;

do $$
declare
  fallback_tenant_id uuid;
begin
  insert into public.profiles (id, tenant_id, role)
  select
    candidate.user_id,
    candidate.user_id,
    case
      when lower(
        coalesce(
          au.raw_app_meta_data ->> 'role',
          au.raw_user_meta_data ->> 'role',
          'worker'
        )
      ) in ('super_admin', 'owner', 'admin') then 'admin'
      else 'worker'
    end
  from (
    select distinct n.user_id
    from public.notifications n
    where n.tenant_id is null
      and n.user_id is not null

    union

    select distinct n.created_by as user_id
    from public.notifications n
    where n.tenant_id is null
      and n.created_by is not null
  ) as candidate
  inner join auth.users au
    on au.id = candidate.user_id
  left join public.profiles p
    on p.id = candidate.user_id
  where p.id is null;

  update public.notifications n
  set tenant_id = p.tenant_id
  from public.profiles p
  where n.tenant_id is null
    and n.user_id = p.id;

  update public.notifications n
  set tenant_id = p.tenant_id
  from public.profiles p
  where n.tenant_id is null
    and n.created_by = p.id;

  select existing.tenant_id
  into fallback_tenant_id
  from (
    select n.tenant_id
    from public.notifications n
    where n.tenant_id is not null

    union all

    select p.tenant_id
    from public.profiles p
    where p.tenant_id is not null
  ) as existing
  limit 1;

  if fallback_tenant_id is null then
    select au.id
    into fallback_tenant_id
    from auth.users au
    limit 1;

    if fallback_tenant_id is not null then
      insert into public.profiles (id, tenant_id, role)
      values (fallback_tenant_id, fallback_tenant_id, 'admin')
      on conflict (id) do nothing;
    end if;
  end if;

  if fallback_tenant_id is not null then
    update public.notifications
    set tenant_id = fallback_tenant_id
    where tenant_id is null;
  end if;

  if exists (
    select 1
    from public.notifications
    where tenant_id is null
  ) then
    raise exception using
      message = 'Cannot enforce notifications.tenant_id NOT NULL because some rows still have no resolvable tenant_id';
  end if;
end $$;

alter table public.notifications
  alter column tenant_id set not null,
  alter column message set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_not_blank'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_type_not_blank
      check (btrim(type) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_message_not_blank'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_message_not_blank
      check (btrim(message) <> '');
  end if;
end $$;

create index if not exists notifications_tenant_created_idx
  on public.notifications (tenant_id, created_at desc);

create index if not exists notifications_tenant_read_created_idx
  on public.notifications (tenant_id, read, created_at desc);

create index if not exists notifications_user_read_created_idx
  on public.notifications (user_id, read, created_at desc)
  where user_id is not null;

create index if not exists notifications_job_id_idx
  on public.notifications (job_id)
  where job_id is not null;

create index if not exists notifications_quote_token_idx
  on public.notifications (quote_token)
  where quote_token is not null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete_admin on public.notifications;

create policy notifications_select
  on public.notifications
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy notifications_insert
  on public.notifications
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy notifications_update
  on public.notifications
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy notifications_delete_admin
  on public.notifications
  for delete
  to authenticated
  using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

notify pgrst, 'reload schema';

commit;