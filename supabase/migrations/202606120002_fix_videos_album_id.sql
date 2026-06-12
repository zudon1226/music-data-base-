alter table public.videos
  add column if not exists album_id uuid null;

create index if not exists videos_album_id_idx
on public.videos (album_id);

do $$
begin
  if to_regclass('public.albums') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'videos_album_id_fkey'
         and conrelid = 'public.videos'::regclass
     ) then
    alter table public.videos
      add constraint videos_album_id_fkey
      foreign key (album_id)
      references public.albums(id)
      on delete set null
      not valid;
  end if;
end $$;
