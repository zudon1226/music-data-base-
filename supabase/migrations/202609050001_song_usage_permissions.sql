-- Song release usage permissions: streaming vs ringtone on one master record.
-- Existing songs remain streaming-only (backward compatible defaults).

alter table public.songs
  add column if not exists streaming_enabled boolean not null default true,
  add column if not exists ringtone_enabled boolean not null default false,
  add column if not exists ringtone_creation_enabled boolean not null default false,
  add column if not exists ringtone_sale_enabled boolean not null default false,
  add column if not exists ringtone_price numeric(10, 2);

comment on column public.songs.streaming_enabled is 'Track may appear/play in normal Music Data Base streaming.';
comment on column public.songs.ringtone_enabled is 'Track is authorized to participate in the ringtone system.';
comment on column public.songs.ringtone_creation_enabled is 'Listeners/creators may select portions in Ringtone Creator.';
comment on column public.songs.ringtone_sale_enabled is 'Official ringtone from this song may be listed for sale.';
comment on column public.songs.ringtone_price is 'Price of official paid ringtone when ringtone_sale_enabled is true.';

create index if not exists songs_streaming_enabled_idx
  on public.songs (streaming_enabled)
  where streaming_enabled = true;

create index if not exists songs_ringtone_creation_idx
  on public.songs (ringtone_enabled, ringtone_creation_enabled)
  where ringtone_enabled = true and ringtone_creation_enabled = true;
