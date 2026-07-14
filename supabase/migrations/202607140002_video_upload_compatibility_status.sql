-- Optional compatibility metadata for newly published videos.
-- Existing AV1 / incompatible rows are not rewritten.
-- Insert path falls back gracefully if columns are absent.

alter table public.videos
  add column if not exists mime_type text,
  add column if not exists container text,
  add column if not exists compatibility_status text,
  add column if not exists compatibility_reason text;

create index if not exists videos_compatibility_status_idx
on public.videos (compatibility_status);
