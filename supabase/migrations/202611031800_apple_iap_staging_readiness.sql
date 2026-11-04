-- Apple IAP staging readiness: ASN audit flexibility + explicit SKU write protection.

-- ASN rows may not resolve an MDB user until a prior client_verify event exists.
alter table public.apple_payment_events alter column user_id drop not null;

alter table public.apple_payment_events drop constraint if exists apple_payment_events_user_required_check;
alter table public.apple_payment_events
  add constraint apple_payment_events_user_required_check check (
    user_id is not null
    or notification_type = 'asn'
  );

alter table public.apple_payment_events drop constraint if exists apple_payment_events_outcome_check;
alter table public.apple_payment_events
  add constraint apple_payment_events_outcome_check
  check (outcome in (
    'verified_no_grant',
    'fulfilled',
    'duplicate',
    'rejected',
    'asn_no_grant',
    'restored_no_grant',
    'revoked_no_grant'
  ));

-- Authenticated clients may read active SKUs only; never insert/update/delete mappings directly.
revoke insert, update, delete, truncate, references, trigger on table public.apple_catalog_skus from authenticated;

create index if not exists apple_payment_events_original_user_idx
  on public.apple_payment_events (original_transaction_id, user_id)
  where original_transaction_id is not null and user_id is not null;

notify pgrst, 'reload schema';
