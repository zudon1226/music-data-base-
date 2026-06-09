-- Phase 8 - Public Launch Readiness
-- Adds final launch-readiness checklist rows without changing working product logic.

insert into public.launch_checklist (area, status, details)
values
  ('API smoke checks', 'pending', 'Confirm launch, media, library, playlist, sales, license, discovery, and recommendation APIs return 200.'),
  ('Marketplace and licensing launch QA', 'pending', 'Confirm marketplace, cart, purchase history, license records, and download vault foundations load.'),
  ('Trust and support operations', 'pending', 'Confirm reports, claims, verification review, tickets, incidents, release notes, and feedback are ready.'),
  ('Public profile sharing QA', 'pending', 'Confirm artist and producer public URLs render and share with the correct preview metadata.')
on conflict (area)
do update set
  details = excluded.details,
  updated_at = now();
