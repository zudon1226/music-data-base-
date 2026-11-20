# Mixtape Phase 1 — DJ creator provisioning

Mixtape creation eligibility is enforced in SQL by `public.can_create_mixtapes()`. Clients cannot self-assign DJ privileges.

## Who may create mixtapes

1. Platform admins (`is_platform_admin`).
2. Verified artists and producers via `can_upload_creator_content()` (founding member **approved** + artist/producer account or role).
3. Verified DJs: founding member **`approval_status = 'approved'`** and an active DJ signal:
   - `profiles.account_type` in (`dj`, `founding_dj`), or
   - `user_roles.role` in (`dj`, `founding_dj`) with `status = 'active'`.

Artists/producers do **not** use a separate weaker path. DJs require the same founding approval bar as music creators.

## Server-side provisioning flow (required before studio access)

1. **Applicant onboarding** — extend the existing founding-member pipeline (admin review) for DJ intent. Until `founding_invites` / `founding_members.founding_role` supports DJ explicitly, ops may record approval in `founding_members` with `approval_status = 'approved'` using the same pattern as artists/producers.
2. **Role assignment (service_role / admin API only)** — after approval:
   - Set `profiles.account_type` to `dj` or `founding_dj` through the locked profile update path (not client-writable; see `prevent_client_account_type_change`).
   - Insert or update `user_roles` with `role = 'dj'` or `founding_dj`, `status = 'active'`, via admin or service_role tooling.
3. **Eligibility check** — clients may call `can_create_mixtapes()` (authenticated execute grant) for UX gating only; authoritative enforcement remains on mixtape APIs using service_role mutations.
4. **No client writes** — authenticated users have **no** direct INSERT/UPDATE on `user_roles` or privileged profile columns for mixtape setup.

## Playback and play counts (not DJ-specific)

Qualified plays use **server-issued** `mixtape_playback_sessions`. The playback API must:

- Create sessions with `begin_mixtape_playback_session(track_id, caller_user_id)` where `caller_user_id` is taken from the verified JWT, not the request body.
- Advance progress with `advance_mixtape_playback_session(session_id, caller_user_id)` on a playback heartbeat; SQL credits only wall-clock time since `last_progress_at` (not client-reported seconds).
- Call `record_mixtape_qualified_play(session_id, caller_user_id)` when session progress meets the 30s / 25% rule.

Client-reported listen duration does **not** prove playback; it is only a bounded hint to pace `advance_*` under API control.

## Staging checklist for first DJ

- [ ] `founding_members.approval_status = 'approved'` for the user
- [ ] `user_roles` DJ role active **or** `profiles.account_type` DJ (server-set)
- [ ] `select can_create_mixtapes('<user_id>');` returns true
- [ ] Mixtape catalog mutations still flow through service_role APIs only