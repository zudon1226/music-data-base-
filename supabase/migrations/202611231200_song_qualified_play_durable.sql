-- Phase 28H: durable song qualified-play dedup/throttle (staging-first; additive).
-- Server routes call record_song_qualified_play via service_role only.

create table if not exists public.song_play_qualified_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  listener_key text not null check (char_length(listener_key) between 5 and 96),
  playback_session_id uuid not null,
  qualified_at timestamptz not null default now(),
  constraint song_play_qualified_events_session_key
    unique (song_id, listener_key, playback_session_id)
);

create index if not exists song_play_qualified_events_song_qualified_idx
  on public.song_play_qualified_events (song_id, qualified_at desc);

create table if not exists public.song_play_listener_throttle (
  song_id uuid not null references public.songs (id) on delete cascade,
  listener_key text not null check (char_length(listener_key) between 5 and 96),
  last_qualified_at timestamptz not null default now(),
  primary key (song_id, listener_key)
);

comment on table public.song_play_qualified_events is 'Idempotent qualified play sessions; writes via service_role RPC only.';
comment on table public.song_play_listener_throttle is 'Per-listener 45s throttle window for qualified plays.';

alter table public.song_play_qualified_events enable row level security;
alter table public.song_play_listener_throttle enable row level security;

revoke all on table public.song_play_qualified_events from anon, authenticated, public;
revoke all on table public.song_play_listener_throttle from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Songs SELECT: anon sees public streaming only; authenticated also sees own.
-- ---------------------------------------------------------------------------
drop policy if exists "Music Data Base public read songs table" on public.songs;
drop policy if exists public_catalog_read on public.songs;
drop policy if exists "Music Data Base anon read streaming songs" on public.songs;
drop policy if exists "Music Data Base authenticated read catalog and own songs" on public.songs;

create policy "Music Data Base anon read streaming songs"
on public.songs
for select
to anon
using (
  coalesce(streaming_enabled, false) = true
);

create policy "Music Data Base authenticated read catalog and own songs"
on public.songs
for select
to authenticated
using (
  coalesce(streaming_enabled, false) = true
  or user_id = auth.uid()
  or producer_id = auth.uid()
);

create or replace function public.song_play_min_interval_seconds()
returns integer
language sql
immutable
as $$
  select 45;
$$;

create or replace function public.record_song_qualified_play(
  p_song_id uuid,
  p_listener_key text,
  p_playback_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_song public.songs%rowtype;
  v_now timestamptz := now();
  v_interval integer := public.song_play_min_interval_seconds();
  v_last timestamptz;
  v_listener_user uuid;
  v_is_owner boolean := false;
  v_public_ok boolean := false;
  v_plays integer;
  v_event_id uuid;
begin
  if p_song_id is null or p_playback_session_id is null or coalesce(trim(p_listener_key), '') = '' then
    return jsonb_build_object('accepted', false, 'duplicate', false, 'reason', 'invalid_input', 'plays', null);
  end if;

  select *
  into v_song
  from public.songs
  where id = p_song_id
  for update;

  if v_song.id is null then
    return jsonb_build_object('accepted', false, 'duplicate', false, 'reason', 'not_found', 'plays', null);
  end if;

  v_public_ok := coalesce(v_song.streaming_enabled, false) = true
    and not (coalesce(v_song.ringtone_enabled, false) = true and coalesce(v_song.streaming_enabled, false) = false);

  if p_listener_key like 'user:%' then
    begin
      v_listener_user := (split_part(p_listener_key, ':', 2))::uuid;
    exception when others then
      v_listener_user := null;
    end;
    v_is_owner := v_listener_user is not null
      and (v_song.user_id = v_listener_user or v_song.producer_id = v_listener_user);
  end if;

  if not v_public_ok and not v_is_owner then
    return jsonb_build_object('accepted', false, 'duplicate', false, 'reason', 'not_playable', 'plays', null);
  end if;

  insert into public.song_play_listener_throttle (song_id, listener_key, last_qualified_at)
  values (p_song_id, p_listener_key, v_now - make_interval(secs => v_interval + 1))
  on conflict (song_id, listener_key) do nothing;

  select last_qualified_at
  into v_last
  from public.song_play_listener_throttle
  where song_id = p_song_id
    and listener_key = p_listener_key
  for update;

  if v_last is not null and v_now < v_last + make_interval(secs => v_interval) then
    v_plays := greatest(0, coalesce(v_song.plays, 0));
    return jsonb_build_object(
      'accepted', false,
      'duplicate', true,
      'reason', 'throttled',
      'plays', v_plays
    );
  end if;

  insert into public.song_play_qualified_events (song_id, listener_key, playback_session_id)
  values (p_song_id, p_listener_key, p_playback_session_id)
  on conflict on constraint song_play_qualified_events_session_key do nothing
  returning id into v_event_id;

  if v_event_id is null then
    v_plays := greatest(0, coalesce(v_song.plays, 0));
    return jsonb_build_object(
      'accepted', false,
      'duplicate', true,
      'reason', 'duplicate_session',
      'plays', v_plays
    );
  end if;

  insert into public.song_play_listener_throttle (song_id, listener_key, last_qualified_at)
  values (p_song_id, p_listener_key, v_now)
  on conflict (song_id, listener_key) do update
  set last_qualified_at = excluded.last_qualified_at;

  update public.songs
  set plays = greatest(0, coalesce(plays, 0)) + 1
  where id = p_song_id
  returning plays into v_plays;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'reason', 'accepted',
    'plays', v_plays
  );
exception
  when others then
    return jsonb_build_object(
      'accepted', false,
      'duplicate', false,
      'reason', 'database_error',
      'plays', null
    );
end;
$$;

revoke all on function public.record_song_qualified_play(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_song_qualified_play(uuid, text, uuid) to service_role;

revoke all on function public.song_play_min_interval_seconds() from public, anon, authenticated;
grant execute on function public.song_play_min_interval_seconds() to service_role;