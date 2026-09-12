-- Connect/payout RLS hardening: owner read-only on payment profiles; admin earnings read.

drop policy if exists creator_payment_profiles_owner_insert on public.creator_payment_profiles;
drop policy if exists creator_payment_profiles_owner_update on public.creator_payment_profiles;

drop policy if exists earnings_events_admin_read on public.earnings_events;
create policy earnings_events_admin_read
  on public.earnings_events for select to authenticated
  using (public.is_platform_admin());

notify pgrst, 'reload schema';
