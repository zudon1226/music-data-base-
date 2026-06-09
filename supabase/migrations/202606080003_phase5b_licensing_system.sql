create extension if not exists pgcrypto;

create table if not exists public.license_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  beat_id text not null,
  beat_title text not null,
  producer_id text,
  producer_name text not null default '',
  buyer_name text not null default '',
  license_type text not null check (license_type in ('Basic', 'Premium', 'Unlimited', 'Exclusive')),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  pdf_file_name text not null default 'music-data-base-license.pdf',
  terms jsonb not null default '[]'::jsonb,
  transaction_id text,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, beat_id, license_type)
);

create index if not exists license_records_user_id_idx on public.license_records(user_id);
create index if not exists license_records_beat_id_idx on public.license_records(beat_id);
create index if not exists license_records_producer_id_idx on public.license_records(producer_id);
create index if not exists license_records_issued_at_idx on public.license_records(issued_at desc);

alter table public.license_records enable row level security;

drop policy if exists "Users can read own license records" on public.license_records;
create policy "Users can read own license records"
on public.license_records
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own license records" on public.license_records;
create policy "Users can insert own license records"
on public.license_records
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own license records" on public.license_records;
create policy "Users can update own license records"
on public.license_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own license records" on public.license_records;
create policy "Users can delete own license records"
on public.license_records
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.license_records to authenticated;
