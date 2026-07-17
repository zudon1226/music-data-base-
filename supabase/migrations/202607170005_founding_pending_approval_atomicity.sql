-- Atomic founding invite redemption + orphan repair for pending approvals.
-- Invite status "used" is not equivalent to member approval.

create or replace function public.redeem_founding_invite_atomic(
  p_user_id uuid,
  p_raw_code text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_invite public.founding_invites%rowtype;
  v_member public.founding_members%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_name text;
  v_consume_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Log in before redeeming an invite.');
  end if;

  v_code := upper(trim(regexp_replace(coalesce(p_raw_code, ''), '[^A-Za-z0-9-]', '', 'g')));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'Invite code is required.');
  end if;

  select *
  into v_invite
  from public.founding_invites
  where invite_code = v_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invite code is invalid.');
  end if;

  select *
  into v_member
  from public.founding_members
  where user_id = p_user_id
  for update;

  if found then
    if v_member.invite_id is not distinct from v_invite.id and v_member.approval_status = 'pending' then
      update public.founding_invites
      set
        status = 'used',
        redeemed_by = coalesce(redeemed_by, p_user_id),
        redeemed_at = coalesce(redeemed_at, v_now),
        updated_at = v_now
      where id = v_invite.id
        and status = 'active';
      return jsonb_build_object(
        'ok', true,
        'member', to_jsonb(v_member),
        'intended_role', v_invite.intended_role,
        'idempotent', true
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'A founding membership is already linked to this account.');
  end if;

  if v_invite.status = 'used' then
    return jsonb_build_object('ok', false, 'error', 'Invite code has already been used.');
  end if;
  if v_invite.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'Invite code has been revoked.');
  end if;
  if v_invite.status = 'expired'
     or (v_invite.expires_at is not null and v_invite.expires_at <= v_now) then
    update public.founding_invites
    set status = 'expired', updated_at = v_now
    where id = v_invite.id
      and status = 'active';
    return jsonb_build_object('ok', false, 'error', 'Invite code has expired.');
  end if;
  if v_invite.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Invite code is no longer active.');
  end if;

  v_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_name is null then
    v_name := 'Founding Member';
  end if;

  insert into public.founding_members (
    user_id,
    founding_role,
    approval_status,
    invite_id,
    display_name,
    joined_at,
    updated_at
  ) values (
    p_user_id,
    v_invite.intended_role,
    'pending',
    v_invite.id,
    v_name,
    v_now,
    v_now
  )
  returning * into v_member;

  update public.founding_invites
  set
    status = 'used',
    redeemed_by = p_user_id,
    redeemed_at = v_now,
    updated_at = v_now
  where id = v_invite.id
    and status = 'active'
  returning id into v_consume_id;

  if v_consume_id is null then
    delete from public.founding_members where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'error', 'Invite code has already been used or revoked.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(v_member),
    'intended_role', v_invite.intended_role,
    'idempotent', false
  );
end;
$$;

revoke all on function public.redeem_founding_invite_atomic(uuid, text, text) from public;
revoke all on function public.redeem_founding_invite_atomic(uuid, text, text) from anon;
revoke all on function public.redeem_founding_invite_atomic(uuid, text, text) from authenticated;
grant execute on function public.redeem_founding_invite_atomic(uuid, text, text) to service_role;

create or replace function public.repair_orphaned_founding_redemptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with orphans as (
    select
      i.id as invite_id,
      i.redeemed_by as user_id,
      i.intended_role,
      coalesce(i.redeemed_at, i.updated_at, timezone('utc', now())) as joined_at
    from public.founding_invites i
    where i.status = 'used'
      and i.redeemed_by is not null
      and not exists (
        select 1
        from public.founding_members m
        where m.user_id = i.redeemed_by
      )
  ),
  inserted as (
    insert into public.founding_members (
      user_id,
      founding_role,
      approval_status,
      invite_id,
      display_name,
      joined_at,
      updated_at
    )
    select
      o.user_id,
      o.intended_role,
      'pending',
      o.invite_id,
      'Founding Member',
      o.joined_at,
      timezone('utc', now())
    from orphans o
    on conflict (user_id) do nothing
    returning user_id
  )
  select count(*)::integer into v_inserted from inserted;

  return coalesce(v_inserted, 0);
end;
$$;

revoke all on function public.repair_orphaned_founding_redemptions() from public;
revoke all on function public.repair_orphaned_founding_redemptions() from anon;
revoke all on function public.repair_orphaned_founding_redemptions() from authenticated;
grant execute on function public.repair_orphaned_founding_redemptions() to service_role;

-- Keep admin read/write policies explicit for pending applications.
drop policy if exists founding_members_select_own on public.founding_members;
create policy founding_members_select_own
on public.founding_members
for select
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists founding_members_admin_all on public.founding_members;
create policy founding_members_admin_all
on public.founding_members
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
