-- Staging hotfix: qualified play insert must not reference ambiguous playback_session_id parameter.
create or replace function public.record_mixtape_qualified_play(
  playback_session_id uuid,
  caller_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.mixtape_playback_sessions%rowtype;
  v_duration double precision;
  v_threshold double precision;
  v_effective_seconds double precision;
  v_play_id uuid;
begin
  if playback_session_id is null or caller_user_id is null then
    return false;
  end if;

  select s.*
  into v_session
  from public.mixtape_playback_sessions s
  inner join public.mixtape_tracks t on t.id = s.track_id
  inner join public.mixtapes m on m.id = s.mixtape_id
  where s.id = playback_session_id
    and s.user_id = caller_user_id
    and s.expires_at > now()
    and t.status = 'published'
    and t.moderation_state = 'clear'
    and m.status = 'published'
    and m.moderation_state = 'clear'
  for update of s;

  if v_session.id is null or v_session.user_id <> caller_user_id then
    return false;
  end if;

  if v_session.status = 'qualified' then
    return false;
  end if;

  select t.duration_seconds
  into v_duration
  from public.mixtape_tracks t
  where t.id = v_session.track_id;

  if coalesce(v_duration, 0) <= 0 then
    return false;
  end if;

  v_threshold := public.mixtape_play_qualification_threshold(v_duration);
  v_effective_seconds := least(greatest(0, coalesce(v_session.listened_seconds, 0)), v_duration);

  if v_effective_seconds < v_threshold then
    return false;
  end if;

  update public.mixtape_playback_sessions
  set
    status = 'qualified',
    qualified_at = now(),
    listened_seconds = v_effective_seconds,
    updated_at = now()
  where id = playback_session_id
    and status = 'active';

  if not found then
    return false;
  end if;

  insert into public.mixtape_plays (
    mixtape_id,
    track_id,
    user_id,
    playback_session_id,
    listened_seconds,
    qualified
  )
  values (
    v_session.mixtape_id,
    v_session.track_id,
    v_session.user_id,
    v_session.id,
    v_effective_seconds,
    true
  )
  on conflict on constraint mixtape_plays_track_id_user_id_playback_session_id_key do nothing
  returning id into v_play_id;

  if v_play_id is null then
    return false;
  end if;

  update public.mixtape_tracks
  set play_count = play_count + 1
  where id = v_session.track_id;

  update public.mixtapes
  set play_count = play_count + 1
  where id = v_session.mixtape_id;

  return true;
end;
$$;