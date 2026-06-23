alter table public.videos
  add column if not exists video_codec text,
  add column if not exists audio_codec text,
  add column if not exists mobile_compatible boolean;

create index if not exists videos_mobile_compatible_idx
on public.videos (mobile_compatible);

create index if not exists videos_video_codec_idx
on public.videos (video_codec);

with newest_summer_time as (
  select id
  from public.videos
  where lower(coalesce(title, '')) = 'summer time'
     or lower(coalesce(storage_path, '')) like '%summer-time%'
     or lower(coalesce(video_url, '')) like '%summer-time%'
  order by created_at desc
  limit 1
)
update public.videos
set
  video_codec = 'av01',
  audio_codec = 'mp4a',
  mobile_compatible = false
where id in (select id from newest_summer_time);
