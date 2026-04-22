-- Enable Row Level Security for user-owned tables in Supabase.
-- Assumptions:
-- 1. Tables live in the public schema.
-- 2. Each table has a user_id uuid column that identifies the owner.
-- 3. user_id references auth.users(id), or is otherwise aligned with auth.uid().
--
-- If any table is missing user_id, add/backfill it before applying this migration.

begin;

do $$
declare
	tbl text;
	target_tables text[] := array['clients', 'estimates', 'jobs', 'payments'];
begin
	foreach tbl in array target_tables loop
		if exists (
			select 1
			from information_schema.tables
			where table_schema = 'public'
				and table_name = tbl
		) then
			execute format('alter table public.%I enable row level security', tbl);
			execute format('alter table public.%I force row level security', tbl);

			if exists (
				select 1
				from information_schema.columns
				where table_schema = 'public'
					and table_name = tbl
					and column_name = 'user_id'
			) then
				execute format('drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
				execute format(
					'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
					tbl || '_select_own',
					tbl
				);

				execute format('drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
				execute format(
					'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
					tbl || '_insert_own',
					tbl
				);

				execute format('drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
				execute format(
					'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
					tbl || '_update_own',
					tbl
				);

				execute format('drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);
				execute format(
					'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',
					tbl || '_delete_own',
					tbl
				);
			end if;
		end if;
	end loop;
end $$;

commit;