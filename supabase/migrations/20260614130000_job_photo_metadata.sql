begin;

alter table public.job_files
  add column if not exists photo_stage text,
  add column if not exists caption text not null default '',
  add column if not exists taken_at timestamptz;

alter table public.job_files
  drop constraint if exists job_files_photo_stage_check;

alter table public.job_files
  add constraint job_files_photo_stage_check
  check (
    photo_stage is null
    or photo_stage in ('before', 'progress', 'completion')
  );

create index if not exists idx_job_files_job_photo_stage
  on public.job_files (job_id, photo_stage, created_at desc)
  where file_type = 'photo';

comment on column public.job_files.photo_stage is 'before | progress | completion — job documentation stage';
comment on column public.job_files.caption is 'User caption for job photos';
comment on column public.job_files.taken_at is 'When the photo was taken (defaults to upload time)';

notify pgrst, 'reload schema';

commit;
