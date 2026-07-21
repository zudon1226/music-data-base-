-- Download Vault sync: one logical vault row per user/media, with title + re-download metadata.

alter table public.media_downloads
  add column if not exists title text;

alter table public.media_downloads
  add column if not exists access_source text;

alter table public.media_downloads
  add column if not exists last_downloaded_at timestamptz;

alter table public.media_downloads
  add column if not exists download_count integer not null default 1;

update public.media_downloads
set
  title = coalesce(nullif(trim(title), ''), nullif(trim(filename), ''), 'Download'),
  access_source = coalesce(nullif(trim(access_source), ''), 'paid_listener'),
  last_downloaded_at = coalesce(last_downloaded_at, created_at),
  download_count = greatest(coalesce(download_count, 1), 1)
where true;

alter table public.media_downloads
  alter column title set default 'Download';

alter table public.media_downloads
  alter column access_source set default 'paid_listener';

alter table public.media_downloads
  alter column last_downloaded_at set default now();

-- Collapse any historical duplicates before unique index.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, content_id, content_type
      order by coalesce(last_downloaded_at, created_at) desc, created_at desc, id desc
    ) as rn,
    count(*) over (
      partition by user_id, content_id, content_type
    ) as total_count,
    max(coalesce(last_downloaded_at, created_at)) over (
      partition by user_id, content_id, content_type
    ) as latest_at
  from public.media_downloads
)
update public.media_downloads md
set
  download_count = greatest(coalesce(md.download_count, 1), ranked.total_count),
  last_downloaded_at = ranked.latest_at
from ranked
where md.id = ranked.id
  and ranked.rn = 1
  and ranked.total_count > 1;

delete from public.media_downloads md
using (
  select
    id,
    row_number() over (
      partition by user_id, content_id, content_type
      order by coalesce(last_downloaded_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.media_downloads
) ranked
where md.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists media_downloads_user_content_unique
  on public.media_downloads (user_id, content_id, content_type);

create index if not exists media_downloads_user_last_downloaded_idx
  on public.media_downloads (user_id, last_downloaded_at desc);
