-- Align founding onboarding tables with platform RLS verification expectations.
-- Additive only. Does not rewrite 202607150001_founding_onboarding.sql.

do $$
declare
  founding_table text;
begin
  foreach founding_table in array array['founding_invites', 'founding_members']
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = founding_table
        and c.relkind in ('r', 'p')
    ) then
      continue;
    end if;

    execute format('revoke all privileges on table public.%I from anon', founding_table);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', founding_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', founding_table);
    execute format('grant all privileges on table public.%I to service_role', founding_table);

    execute format('drop policy if exists platform_admin_full_access on public.%I', founding_table);
    execute format(
      'create policy platform_admin_full_access on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      founding_table
    );
  end loop;
end $$;
