-- Paquete AI Smarter: track Google Calendar event provenance on appointments
-- so the bubble's "Create appointment" action can flag whether the calendar
-- sync succeeded. All columns are nullable and additive — existing rows
-- continue working with no migration data movement required.
alter table public.appointments
  add column if not exists user_id uuid,
  add column if not exists end_time text,
  add column if not exists google_event_id text;

create index if not exists appointments_user_id_idx
  on public.appointments (user_id)
  where user_id is not null;
