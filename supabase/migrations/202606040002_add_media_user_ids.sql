alter table public.songs add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.videos add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists songs_user_id_idx on public.songs (user_id);
create index if not exists videos_user_id_idx on public.videos (user_id);
