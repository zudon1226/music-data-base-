-- Staging-only Apple catalog SKUs (inactive; not for production sales).
insert into public.apple_catalog_skus (
  apple_product_id, entity_type, entity_id, plan_slug, license_type, billing_interval, active, metadata
) values
  ('com.digitalmusicdatabase.app.staging.subscription.listener.monthly', 'subscription', null, 'premium-listener', null, 'month', false, '{"mdb_catalog_tier":"staging_dev_only","production_sales_blocked":true,"app_store_connect_status":"not_activated"}'::jsonb),
  ('com.digitalmusicdatabase.app.staging.subscription.artist.monthly', 'subscription', null, 'artist-pro', null, 'month', false, '{"mdb_catalog_tier":"staging_dev_only","production_sales_blocked":true,"app_store_connect_status":"not_activated"}'::jsonb),
  ('com.digitalmusicdatabase.app.staging.subscription.producer.monthly', 'subscription', null, 'producer-pro', null, 'month', false, '{"mdb_catalog_tier":"staging_dev_only","production_sales_blocked":true,"app_store_connect_status":"not_activated"}'::jsonb),
  ('com.digitalmusicdatabase.app.staging.album.test', 'album', '11111111-1111-4111-8111-111111111101'::uuid, null, null, null, false, '{"mdb_catalog_tier":"staging_dev_only","production_sales_blocked":true,"app_store_connect_status":"not_activated"}'::jsonb),
  ('com.digitalmusicdatabase.app.staging.ringtone.test', 'ringtone', '11111111-1111-4111-8111-111111111102'::uuid, null, null, null, false, '{"mdb_catalog_tier":"staging_dev_only","production_sales_blocked":true,"app_store_connect_status":"not_activated"}'::jsonb),
  ('com.digitalmusicdatabase.app.staging.beat.basic.test', 'beat_license', '11111111-1111-4111-8111-111111111103'::uuid, null, 'Basic', null, false, '{"mdb_catalog_tier":"staging_dev_only","production_sales_blocked":true,"app_store_connect_status":"not_activated"}'::jsonb)
on conflict (apple_product_id) do update set
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  plan_slug = excluded.plan_slug,
  license_type = excluded.license_type,
  billing_interval = excluded.billing_interval,
  active = false,
  metadata = excluded.metadata,
  updated_at = now();
