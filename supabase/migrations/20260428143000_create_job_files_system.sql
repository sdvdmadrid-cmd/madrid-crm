begin;

insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do update
set public = excluded.public;

create table if not exists public.job_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  file_url text not null,
  file_path text not null,
  file_type text not null check (file_type in ('photo', 'document')),
  name text not null,
  size integer not null check (size > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_files_user_job_created
  on public.job_files (user_id, job_id, created_at desc);

create index if not exists idx_job_files_job_id
  on public.job_files (job_id);

alter table public.job_files enable row level security;
alter table public.job_files force row level security;

drop policy if exists job_files_select_own on public.job_files;
drop policy if exists job_files_insert_own on public.job_files;
drop policy if exists job_files_update_own on public.job_files;
drop policy if exists job_files_delete_own on public.job_files;

create policy job_files_select_own
  on public.job_files
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy job_files_insert_own
  on public.job_files
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy job_files_update_own
  on public.job_files
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy job_files_delete_own
  on public.job_files
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists job_files_objects_select on storage.objects;
drop policy if exists job_files_objects_insert on storage.objects;
drop policy if exists job_files_objects_update on storage.objects;
drop policy if exists job_files_objects_delete on storage.objects;

create policy job_files_objects_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy job_files_objects_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'job-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy job_files_objects_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'job-files'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'job-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy job_files_objects_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'job-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );

notify pgrst, 'reload schema';

commit;
