-- Paid-listener music/video downloads: opt-out flag + download history ledger.

alter table public.songs
  add column if not exists download_enabled boolean not null default true;

alter table public.videos
  add column if not exists download_enabled boolean not null default true;

create table if not exists public.media_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content_id uuid not null,
  content_type text not null check (content_type in ('music', 'video')),
  filename text not null,
  plan_name text,
  plan_slug text,
  delivery_status text not null default 'delivered'
    check (delivery_status in ('delivered', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists media_downloads_user_id_idx
  on public.media_downloads (user_id, created_at desc);

create index if not exists media_downloads_content_idx
  on public.media_downloads (content_id, content_type);

alter table public.media_downloads enable row level security;

drop policy if exists "Users can read own media downloads" on public.media_downloads;
create policy "Users can read own media downloads"
on public.media_downloads
for select
to authenticated
using (auth.uid() = user_id);

-- Inserts go through service role from the download API only.
drop policy if exists "No direct media download inserts" on public.media_downloads;
create policy "No direct media download inserts"
on public.media_downloads
for insert
to authenticated
with check (false);
