begin;

-- Allow video (+ receipt) on job_files.file_type
alter table public.job_files
  drop constraint if exists job_files_file_type_check;

alter table public.job_files
  add constraint job_files_file_type_check
  check (file_type in ('photo', 'document', 'receipt', 'video'));

comment on column public.job_files.file_type is
  'photo | document | receipt | video';

create index if not exists idx_job_files_job_media_created
  on public.job_files (job_id, created_at desc)
  where file_type in ('photo', 'video');

notify pgrst, 'reload schema';

commit;
