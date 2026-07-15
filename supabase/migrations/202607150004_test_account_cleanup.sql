-- Owner-only test account cleanup review labels and audit logs.
-- Additive only. Does not weaken existing RLS policies.

create table if not exists public.test_account_review_labels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null check (label in ('protected_real_user', 'confirmed_test_account', 'needs_review')),
  notes text,
  marked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists test_account_review_labels_label_idx
  on public.test_account_review_labels (label, updated_at desc);

create table if not exists public.test_account_cleanup_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('dry_run', 'delete', 'set_label')),
  target_user_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  result text not null check (result in ('success', 'blocked', 'failed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists test_account_cleanup_logs_target_idx
  on public.test_account_cleanup_logs (target_user_id, created_at desc);

create index if not exists test_account_cleanup_logs_owner_idx
  on public.test_account_cleanup_logs (owner_user_id, created_at desc);

alter table public.test_account_review_labels enable row level security;
alter table public.test_account_cleanup_logs enable row level security;

do $$
declare
  cleanup_table text;
begin
  foreach cleanup_table in array array['test_account_review_labels', 'test_account_cleanup_logs']
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = cleanup_table
        and c.relkind in ('r', 'p')
    ) then
      continue;
    end if;

    execute format('revoke all privileges on table public.%I from anon', cleanup_table);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', cleanup_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', cleanup_table);
    execute format('grant all privileges on table public.%I to service_role', cleanup_table);

    execute format('drop policy if exists test_account_review_labels_admin_all on public.%I', cleanup_table);
    execute format('drop policy if exists test_account_cleanup_logs_admin_all on public.%I', cleanup_table);
    execute format('drop policy if exists platform_admin_full_access on public.%I', cleanup_table);
    execute format(
      'create policy platform_admin_full_access on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      cleanup_table
    );
  end loop;
end $$;
