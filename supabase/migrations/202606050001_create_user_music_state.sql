create table if not exists public.user_music_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  library_ids jsonb not null default '[]'::jsonb,
  recently_played jsonb not null default '[]'::jsonb,
  playlists jsonb not null default '[]'::jsonb,
  active_playlist_id text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_music_state enable row level security;

drop policy if exists "Users can read their music state" on public.user_music_state;
drop policy if exists "Users can insert their music state" on public.user_music_state;
drop policy if exists "Users can update their music state" on public.user_music_state;

create policy "Users can read their music state"
on public.user_music_state
for select
using (auth.uid() = user_id);

create policy "Users can insert their music state"
on public.user_music_state
for insert
with check (auth.uid() = user_id);

create policy "Users can update their music state"
on public.user_music_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
