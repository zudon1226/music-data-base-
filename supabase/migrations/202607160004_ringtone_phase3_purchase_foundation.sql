-- Ringtone Platform Phase 3: purchase idempotency and marketplace sort helpers.
-- Additive only; does not alter Phase 1 RLS ownership model.

alter table public.ringtone_purchases
  add column if not exists idempotency_key text not null default '';

alter table public.ringtone_purchases
  add column if not exists failure_reason text not null default '';

create unique index if not exists ringtone_purchases_idempotency_uidx
  on public.ringtone_purchases (buyer_id, ringtone_id, idempotency_key)
  where idempotency_key <> '';

create index if not exists ringtone_purchases_paid_ringtone_id_idx
  on public.ringtone_purchases (ringtone_id, purchased_at desc)
  where payment_status = 'paid';

create index if not exists ringtone_favorites_ringtone_id_idx
  on public.ringtone_favorites (ringtone_id);

create index if not exists ringtone_downloads_ringtone_count_idx
  on public.ringtone_downloads (ringtone_id);

notify pgrst, 'reload schema';
