-- Remove legacy musicData blobs from auth.users metadata and migrate state to database tables.
-- Keeps only minimal JWT-safe user_metadata: displayName, role, avatarUrl (+ auth booleans).

create or replace function public.jsonb_text_array(value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(trim(both '"' from elem::text)), array[]::text[])
  from jsonb_array_elements(coalesce(value, '[]'::jsonb)) as elem
  where trim(both '"' from elem::text) <> '';
$$;

do $$
declare
  user_row record;
  music jsonb;
  liked_id text;
  library_id text;
  artist_id text;
  existing_state public.user_music_state%rowtype;
begin
  for user_row in
    select id, email, raw_user_meta_data
    from auth.users
    where raw_user_meta_data ? 'musicData'
  loop
    music := user_row.raw_user_meta_data->'musicData';

    select *
    into existing_state
    from public.user_music_state
    where user_id = user_row.id;

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

    foreach liked_id in array public.jsonb_text_array(music->'likedIds')
    loop
      insert into public.song_likes (song_id, user_id)
      values (liked_id, user_row.id)
      on conflict (song_id, user_id) do nothing;
    end loop;

    foreach library_id in array public.jsonb_text_array(music->'libraryIds')
    loop
      if library_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        insert into public.library_saves (user_id, item_id, item_type)
        values (user_row.id, library_id::uuid, 'song')
        on conflict (user_id, item_id, item_type) do nothing;
      end if;
    end loop;

    foreach artist_id in array public.jsonb_text_array(coalesce(music->'followedArtistIds', music->'followedIds'))
    loop
      insert into public.artist_follows (artist_id, artist_name, user_id)
      values (artist_id, artist_id, user_row.id)
      on conflict (artist_id, user_id) do nothing;
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
  end loop;
end $$;

update auth.users as users
set raw_user_meta_data = jsonb_strip_nulls(
  jsonb_build_object(
    'displayName', coalesce(
      nullif(users.raw_user_meta_data->>'displayName', ''),
      nullif(users.raw_user_meta_data->>'display_name', ''),
      nullif(profiles.display_name, ''),
      split_part(users.email, '@', 1)
    ),
    'role', coalesce(
      nullif(lower(users.raw_user_meta_data->>'role'), ''),
      nullif(lower(users.raw_user_meta_data->>'accountRole'), ''),
      nullif(lower(profiles.account_type), ''),
      'listener'
    ),
    'avatarUrl', nullif(coalesce(
      users.raw_user_meta_data->>'avatarUrl',
      users.raw_user_meta_data->>'avatar_url',
      profiles.avatar_url
    ), ''),
    'email_verified', users.raw_user_meta_data->'email_verified',
    'phone_verified', users.raw_user_meta_data->'phone_verified'
  )
)
from public.profiles
where profiles.id = users.id
  and (
    users.raw_user_meta_data ? 'musicData'
    or users.raw_user_meta_data ? 'songs'
    or users.raw_user_meta_data ? 'videos'
    or users.raw_user_meta_data ? 'playlists'
    or users.raw_user_meta_data ? 'libraryIds'
    or users.raw_user_meta_data ? 'likedIds'
    or users.raw_user_meta_data ? 'accountRole'
  );

update auth.users as users
set raw_user_meta_data = jsonb_strip_nulls(
  jsonb_build_object(
    'displayName', coalesce(
      nullif(users.raw_user_meta_data->>'displayName', ''),
      nullif(users.raw_user_meta_data->>'display_name', ''),
      split_part(users.email, '@', 1)
    ),
    'role', coalesce(
      nullif(lower(users.raw_user_meta_data->>'role'), ''),
      nullif(lower(users.raw_user_meta_data->>'accountRole'), ''),
      'listener'
    ),
    'avatarUrl', nullif(coalesce(users.raw_user_meta_data->>'avatarUrl', users.raw_user_meta_data->>'avatar_url'), ''),
    'email_verified', users.raw_user_meta_data->'email_verified',
    'phone_verified', users.raw_user_meta_data->'phone_verified'
  )
)
where not exists (
  select 1 from public.profiles where profiles.id = users.id
)
and (
  users.raw_user_meta_data ? 'musicData'
  or users.raw_user_meta_data ? 'songs'
  or users.raw_user_meta_data ? 'videos'
  or users.raw_user_meta_data ? 'playlists'
  or users.raw_user_meta_data ? 'libraryIds'
  or users.raw_user_meta_data ? 'likedIds'
  or users.raw_user_meta_data ? 'accountRole'
);

create or replace function auth.enforce_minimal_user_metadata()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  cleaned jsonb;
begin
  cleaned := jsonb_strip_nulls(jsonb_build_object(
    'displayName', coalesce(
      nullif(new.raw_user_meta_data->>'displayName', ''),
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(old.raw_user_meta_data->>'displayName', '')
    ),
    'role', coalesce(
      nullif(lower(new.raw_user_meta_data->>'role'), ''),
      nullif(lower(new.raw_user_meta_data->>'accountRole'), ''),
      nullif(lower(old.raw_user_meta_data->>'role'), ''),
      nullif(lower(old.raw_user_meta_data->>'accountRole'), ''),
      'listener'
    ),
    'avatarUrl', nullif(coalesce(
      new.raw_user_meta_data->>'avatarUrl',
      new.raw_user_meta_data->>'avatar_url',
      old.raw_user_meta_data->>'avatarUrl',
      old.raw_user_meta_data->>'avatar_url'
    ), ''),
    'email_verified', coalesce(new.raw_user_meta_data->'email_verified', old.raw_user_meta_data->'email_verified'),
    'phone_verified', coalesce(new.raw_user_meta_data->'phone_verified', old.raw_user_meta_data->'phone_verified')
  ));

  new.raw_user_meta_data := cleaned;
  return new;
end;
$$;

drop trigger if exists enforce_minimal_user_metadata on auth.users;
create trigger enforce_minimal_user_metadata
before insert or update of raw_user_meta_data on auth.users
for each row
execute function auth.enforce_minimal_user_metadata();

drop function if exists public.jsonb_text_array(jsonb);
