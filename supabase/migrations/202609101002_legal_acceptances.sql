-- Legal acceptance audit trail for signup and creator upload agreements.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_type text not null check (policy_type in (
    'privacy', 'terms', 'creator_upload', 'dmca', 'subscription_billing',
    'refund', 'creator_payout', 'sponsor_advertising'
  )),
  policy_version text not null check (char_length(trim(policy_version)) > 0),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, policy_type, policy_version)
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id, accepted_at desc);

create index if not exists legal_acceptances_policy_idx
  on public.legal_acceptances (policy_type, policy_version, accepted_at desc);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own
  on public.legal_acceptances
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists legal_acceptances_insert_own on public.legal_acceptances;
create policy legal_acceptances_insert_own
  on public.legal_acceptances
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No authenticated update/delete policies: acceptance history is append-only for users.
