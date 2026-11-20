-- Staging: audit fields for mixtape report moderation (aligned with moderation_reports).
alter table public.mixtape_reports
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

notify pgrst, 'reload schema';