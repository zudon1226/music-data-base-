-- Harden founding_members self-update policy: profile fields only.

drop policy if exists founding_members_update_own_profile on public.founding_members;

create policy founding_members_update_own_profile
on public.founding_members
for update
to authenticated
using (
  auth.uid() = user_id
  and approval_status = 'approved'
)
with check (
  auth.uid() = user_id
  and approval_status = (
    select fm.approval_status
    from public.founding_members fm
    where fm.user_id = auth.uid()
  )
  and founding_role = (
    select fm.founding_role
    from public.founding_members fm
    where fm.user_id = auth.uid()
  )
  and invite_id is not distinct from (
    select fm.invite_id
    from public.founding_members fm
    where fm.user_id = auth.uid()
  )
  and joined_at = (
    select fm.joined_at
    from public.founding_members fm
    where fm.user_id = auth.uid()
  )
  and badge_label = (
    select fm.badge_label
    from public.founding_members fm
    where fm.user_id = auth.uid()
  )
);
