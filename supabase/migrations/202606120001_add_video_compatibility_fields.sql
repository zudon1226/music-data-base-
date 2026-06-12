alter table public.videos
  add column if not exists video_codec text,
  add column if not exists audio_codec text,
  add column if not exists mobile_compatible boolean;

create index if not exists videos_mobile_compatible_idx
on public.videos (mobile_compatible);

create index if not exists videos_video_codec_idx
on public.videos (video_codec);

update public.videos
set
  video_codec = 'av01',
  audio_codec = coalesce(audio_codec, 'mp4a'),
  mobile_compatible = false
where
  lower(coalesce(title, '')) = 'girlie girlie'
  or lower(coalesce(storage_path, '')) like '%girlie-girlie%'
  or lower(coalesce(video_url, '')) like '%girlie-girlie%';
