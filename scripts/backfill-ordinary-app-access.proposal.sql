-- PROPOSAL ONLY — run manually on local/isolated Supabase after review.
-- Do NOT run against production without explicit approval.
-- Restores app access for legitimate ordinary accounts without creating duplicate auth users.

-- 1) Listeners with profiles but no founding row (or non-rejected pending without invite):
--    Option A: rely on app logic (profile + verified email grants canAccessApp without row).
--    Option B: optional listener access marker row for upload-RLS/metrics consistency:

-- insert into public.founding_members (user_id, founding_role, approval_status, invite_id, social_link, badge_label, joined_at, approved_at, updated_at)
-- select p.id, 'founding_artist', 'approved', null, 'mdb_signup_account_type=listener', 'Listener access', now(), now(), now()
-- from public.profiles p
-- left join public.founding_members fm on fm.user_id = p.id
-- where lower(coalesce(p.account_type, '')) = 'listener'
--   and coalesce(p.is_admin, false) = false
--   and (fm.user_id is null or (fm.approval_status <> 'rejected' and fm.invite_id is null and fm.approval_status <> 'approved'));

-- 2) Ordinary creators stuck in pending without invite (NOT founding cohort):
-- update public.founding_members
-- set approval_status = 'approved', approved_at = coalesce(approved_at, now()), updated_at = now()
-- where approval_status = 'pending'
--   and invite_id is null
--   and social_link ~ '^mdb_signup_account_type=(artist|producer|artist_producer)$';
-- Then run server activation repair per user or admin grant flow to apply user_roles.

-- EXCLUDE: approval_status = 'rejected', rows with invite_id (founding cohort pending), admin accounts.
