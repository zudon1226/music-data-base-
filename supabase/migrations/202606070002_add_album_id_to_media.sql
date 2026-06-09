alter table public.songs
add column if not exists album_id uuid references public.albums(id) on delete set null;

alter table public.videos
add column if not exists album_id uuid references public.albums(id) on delete set null;

create index if not exists songs_album_id_idx on public.songs (album_id);
create index if not exists videos_album_id_idx on public.videos (album_id);
