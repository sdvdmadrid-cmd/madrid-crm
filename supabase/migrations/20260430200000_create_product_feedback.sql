create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  feedback_type text not null check (feedback_type in ('suggestion', 'issue', 'improvement')),
  message text not null,
  screenshot_data_url text,
  current_page text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_feedback_tenant_created_idx
  on public.product_feedback (tenant_id, created_at desc);

create index if not exists product_feedback_status_idx
  on public.product_feedback (status);

create index if not exists product_feedback_type_idx
  on public.product_feedback (feedback_type);

alter table public.product_feedback enable row level security;

drop policy if exists product_feedback_insert_own on public.product_feedback;
create policy product_feedback_insert_own
on public.product_feedback
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists product_feedback_select_admin on public.product_feedback;
create policy product_feedback_select_admin
on public.product_feedback
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner', 'super_admin'));

drop policy if exists product_feedback_update_admin on public.product_feedback;
create policy product_feedback_update_admin
on public.product_feedback
for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner', 'super_admin'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner', 'super_admin'));