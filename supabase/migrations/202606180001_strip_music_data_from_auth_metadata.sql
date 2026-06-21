-- Migrate legacy auth user_metadata.musicData into public application tables only.
-- Does NOT UPDATE auth.users. Auth metadata cleanup runs via app Admin API on login.

create table if not exists public.auth_music_data_migration_log (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_table text not null,
  target_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_table, target_key)
);

create index if not exists auth_music_data_migration_log_batch_idx
on public.auth_music_data_migration_log (batch_id);

create index if not exists auth_music_data_migration_log_user_idx
on public.auth_music_data_migration_log (user_id);

alter table public.auth_music_data_migration_log enable row level security;

do $$
declare
  migration_batch_id uuid := gen_random_uuid();
  user_row record;
  music jsonb;
  liked_id text;
  library_id text;
  artist_id text;
begin
  for user_row in
    select id, email, raw_user_meta_data
    from auth.users
    where raw_user_meta_data ? 'musicData'
  loop
    music := user_row.raw_user_meta_data->'musicData';

    insert into public.user_music_state as ums (
      user_id,
      library_ids,
      recently_played,
      playlists,
      active_playlist_id,
      updated_at
    )
    values (
      user_row.id,
      coalesce(music->'libraryIds', '[]'::jsonb),
      coalesce(music->'recentlyPlayed', '[]'::jsonb),
      coalesce(music->'playlists', '[]'::jsonb),
      coalesce(music->>'activePlaylistId', music->>'active_playlist_id', ''),
      now()
    )
    on conflict (user_id) do update
    set
      library_ids = case
        when jsonb_array_length(coalesce(ums.library_ids, '[]'::jsonb)) = 0
          then excluded.library_ids
        else ums.library_ids
      end,
      recently_played = case
        when jsonb_array_length(coalesce(ums.recently_played, '[]'::jsonb)) = 0
          then excluded.recently_played
        else ums.recently_played
      end,
      playlists = case
        when jsonb_array_length(coalesce(ums.playlists, '[]'::jsonb)) = 0
          then excluded.playlists
        else ums.playlists
      end,
      active_playlist_id = case
        when coalesce(ums.active_playlist_id, '') = ''
          then excluded.active_playlist_id
        else ums.active_playlist_id
      end,
      updated_at = now();

    insert into public.auth_music_data_migration_log (batch_id, user_id, target_table, target_key)
    values (migration_batch_id, user_row.id, 'user_music_state', user_row.id::text)
    on conflict (user_id, target_table, target_key) do nothing;

    for liked_id in
      select value
      from jsonb_array_elements_text(coalesce(music->'likedIds', '[]'::jsonb)) as liked(value)
      where btrim(value) <> ''
    loop
      insert into public.song_likes (song_id, user_id)
      values (liked_id, user_row.id)
      on conflict (song_id, user_id) do nothing;

      insert into public.auth_music_data_migration_log (batch_id, user_id, target_table, target_key)
      values (migration_batch_id, user_row.id, 'song_likes', liked_id)
      on conflict (user_id, target_table, target_key) do nothing;
    end loop;

    for library_id in
      select value
      from jsonb_array_elements_text(coalesce(music->'libraryIds', '[]'::jsonb)) as library(value)
      where btrim(value) <> ''
    loop
      if library_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        insert into public.library_saves (user_id, item_id, item_type)
        values (user_row.id, library_id::uuid, 'song')
        on conflict (user_id, item_id, item_type) do nothing;

        insert into public.auth_music_data_migration_log (batch_id, user_id, target_table, target_key)
        values (migration_batch_id, user_row.id, 'library_saves', library_id)
        on conflict (user_id, target_table, target_key) do nothing;
      end if;
    end loop;

    for artist_id in
      select value
      from jsonb_array_elements_text(
        coalesce(music->'followedArtistIds', music->'followedIds', '[]'::jsonb)
      ) as artist(value)
      where btrim(value) <> ''
    loop
      insert into public.artist_follows (artist_id, artist_name, user_id)
      values (artist_id, artist_id, user_row.id)
      on conflict (artist_id, user_id) do nothing;

      insert into public.auth_music_data_migration_log (batch_id, user_id, target_table, target_key)
      values (migration_batch_id, user_row.id, 'artist_follows', artist_id)
      on conflict (user_id, target_table, target_key) do nothing;
    end loop;

    insert into public.profiles (id, user_id, display_name, account_type, avatar_url, updated_at)
    values (
      user_row.id,
      user_row.id,
      coalesce(
        nullif(user_row.raw_user_meta_data->>'displayName', ''),
        nullif(user_row.raw_user_meta_data->>'display_name', ''),
        split_part(user_row.email, '@', 1)
      ),
      coalesce(
        nullif(lower(user_row.raw_user_meta_data->>'role'), ''),
        nullif(lower(user_row.raw_user_meta_data->>'accountRole'), ''),
        'listener'
      ),
      nullif(coalesce(user_row.raw_user_meta_data->>'avatarUrl', user_row.raw_user_meta_data->>'avatar_url'), ''),
      now()
    )
    on conflict (id) do update
    set
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      account_type = coalesce(public.profiles.account_type, excluded.account_type),
      avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
      updated_at = now();

    insert into public.auth_music_data_migration_log (batch_id, user_id, target_table, target_key)
    values (migration_batch_id, user_row.id, 'profiles', user_row.id::text)
    on conflict (user_id, target_table, target_key) do nothing;
  end loop;
end $$;

-- Verification (read-only):
-- select count(*) from public.auth_music_data_migration_log;
-- select email, raw_user_meta_data ? 'musicData' as still_in_auth
-- from auth.users order by email;
