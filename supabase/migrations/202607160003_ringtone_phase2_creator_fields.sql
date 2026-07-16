-- Ringtone Platform Phase 2: additive creator product flags.
-- Does not alter Phase 1 lifecycle constraints or existing purchase rows.

alter table public.ringtone_products
  add column if not exists iphone_available boolean not null default true;

alter table public.ringtone_products
  add column if not exists android_available boolean not null default true;

notify pgrst, 'reload schema';
