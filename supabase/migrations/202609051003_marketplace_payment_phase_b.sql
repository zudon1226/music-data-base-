-- Marketplace payment Phase B: ringtone checkout session binding + earnings ringtone item type.

alter table public.ringtone_purchases
  add column if not exists provider_checkout_session_id text;

alter table public.ringtone_purchases
  add column if not exists provider_payment_intent_id text;

create index if not exists ringtone_purchases_checkout_session_idx
  on public.ringtone_purchases (provider_checkout_session_id)
  where provider_checkout_session_id is not null;

-- Extend earnings_events item_type to include ringtone marketplace purchases.
alter table public.earnings_events drop constraint if exists earnings_events_item_type_check;
alter table public.earnings_events
  add constraint earnings_events_item_type_check
  check (item_type in ('song', 'video', 'album', 'beat', 'subscription', 'playlist', 'exclusive', 'ringtone'));

notify pgrst, 'reload schema';
