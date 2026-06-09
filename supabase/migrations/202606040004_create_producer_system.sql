create table if not exists public.producer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  avatar_url text,
  banner_url text,
  bio text,
  tagline text,
  followers integer default 0,
  following integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.producer_beats (
  id uuid primary key default gen_random_uuid(),
  song_id uuid unique references public.songs(id) on delete cascade,
  producer_id uuid references public.producer_profiles(id) on delete set null,
  producer_user_id uuid references auth.users(id) on delete set null,
  producer_name text not null,
  title text not null,
  cover_url text,
  audio_url text,
  storage_path text,
  license text not null default 'Lease'
    check (license in ('Free', 'Lease', 'Exclusive', 'Split percentage')),
  lease_price numeric default 0,
  exclusive_price numeric default 0,
  split_percentage integer default 0 check (split_percentage >= 0 and split_percentage <= 100),
  plays integer default 0,
  likes integer default 0,
  downloads integer default 0,
  leases integer default 0,
  payouts numeric default 0,
  created_at timestamptz default now()
);

alter table public.songs add column if not exists producer text;
alter table public.songs add column if not exists producer_id uuid references public.producer_profiles(id) on delete set null;
alter table public.songs add column if not exists beat_id uuid references public.producer_beats(id) on delete set null;

alter table public.videos add column if not exists producer text;
alter table public.videos add column if not exists producer_id uuid references public.producer_profiles(id) on delete set null;
alter table public.videos add column if not exists beat_id uuid references public.producer_beats(id) on delete set null;

alter table public.producer_profiles enable row level security;
alter table public.producer_beats enable row level security;

drop policy if exists "Anyone can read producer profiles" on public.producer_profiles;
drop policy if exists "Users can insert their producer profile" on public.producer_profiles;
drop policy if exists "Users can update their producer profile" on public.producer_profiles;
drop policy if exists "Users can delete their producer profile" on public.producer_profiles;

create policy "Anyone can read producer profiles"
on public.producer_profiles
for select
using (true);

create policy "Users can insert their producer profile"
on public.producer_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their producer profile"
on public.producer_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their producer profile"
on public.producer_profiles
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Anyone can read producer beats" on public.producer_beats;
drop policy if exists "Users can insert their producer beats" on public.producer_beats;
drop policy if exists "Users can update their producer beats" on public.producer_beats;
drop policy if exists "Users can delete their producer beats" on public.producer_beats;

create policy "Anyone can read producer beats"
on public.producer_beats
for select
using (true);

create policy "Users can insert their producer beats"
on public.producer_beats
for insert
to authenticated
with check (auth.uid() = producer_user_id);

create policy "Users can update their producer beats"
on public.producer_beats
for update
to authenticated
using (auth.uid() = producer_user_id)
with check (auth.uid() = producer_user_id);

create policy "Users can delete their producer beats"
on public.producer_beats
for delete
to authenticated
using (auth.uid() = producer_user_id);

create index if not exists producer_profiles_user_id_idx on public.producer_profiles (user_id);
create index if not exists producer_beats_song_id_idx on public.producer_beats (song_id);
create index if not exists producer_beats_producer_id_idx on public.producer_beats (producer_id);
create index if not exists producer_beats_producer_user_id_idx on public.producer_beats (producer_user_id);
create index if not exists producer_beats_created_at_idx on public.producer_beats (created_at desc);
