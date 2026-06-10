begin;

-- Defense in depth: every new public table gets RLS enabled automatically at DDL time.
-- Policies must still be added in the same migration (CI enforces via validate:migrations-rls).
-- Without policies, only service_role can access (safe default deny for anon/authenticated).

create or replace function public.auto_enable_rls_on_public_table()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select object_identity, schema_name
    from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
  loop
    if rec.schema_name = 'public' then
      execute format('alter table %s enable row level security', rec.object_identity);
      execute format('alter table %s force row level security', rec.object_identity);
      raise notice 'auto_enable_rls: enabled RLS on %', rec.object_identity;
    end if;
  end loop;
end;
$$;

drop event trigger if exists trg_auto_enable_rls_on_public_table;
create event trigger trg_auto_enable_rls_on_public_table
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.auto_enable_rls_on_public_table();

comment on function public.auto_enable_rls_on_public_table() is
  'Event trigger: auto-enable FORCE RLS on new public tables (FieldBase security default).';

notify pgrst, 'reload schema';

commit;
