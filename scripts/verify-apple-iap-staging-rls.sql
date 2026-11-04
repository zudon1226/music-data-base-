-- Read-only staging checks for Apple IAP RLS/grants (run with supabase db query --remote --read-only).
select 'authenticated_apple_payment_events_grants' as check_name, count(*)::int as count
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'apple_payment_events' and grantee = 'authenticated';

select 'authenticated_apple_catalog_skus_write_grants' as check_name, count(*)::int as count
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'apple_catalog_skus' and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

select 'authenticated_apple_catalog_skus_select_grants' as check_name, count(*)::int as count
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'apple_catalog_skus' and grantee = 'authenticated'
  and privilege_type = 'SELECT';

select 'inactive_staging_dev_skus' as check_name, count(*)::int as count
from public.apple_catalog_skus
where metadata->>'mdb_catalog_tier' = 'staging_dev_only' and active = false;
