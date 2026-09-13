-- Listener personal ringtones from library (non-marketplace derivatives).
-- Keeps source song ownership unchanged; no duplicate master songs row.

alter table public.ringtone_products
  add column if not exists is_personal boolean not null default false;

comment on column public.ringtone_products.is_personal is
  'True when the owner created a personal library ringtone (not a marketplace listing).';

create index if not exists ringtone_products_personal_owner_idx
  on public.ringtone_products (creator_id, is_personal)
  where is_personal = true;

alter table public.ringtone_products
  drop constraint if exists ringtone_products_personal_marketplace_guard;

alter table public.ringtone_products
  add constraint ringtone_products_personal_marketplace_guard check (
    is_personal = false
    or (
      price_cents = 0
      and status <> 'published'
    )
  );
