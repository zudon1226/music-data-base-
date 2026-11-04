/**
 * Seed staging-only Apple catalog SKUs (non-production; blocked for real sales).
 * Usage: MDB_APPLE_IAP_STAGING_APPLY=1 STAGING_DATABASE_URL=... node scripts/seed-apple-iap-staging-skus.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertAppleIapStagingApplyAllowed } from "./_apple-iap-staging-guard.mjs";

const guard = assertAppleIapStagingApplyAllowed();
if (!guard.ok) {
    console.log(`BLOCKED Apple IAP staging seed — ${guard.code}: ${guard.message}`);
    process.exit(2);
}

const STAGING_FIXTURE_ALBUM_ID = "11111111-1111-4111-8111-111111111101";
const STAGING_FIXTURE_RINGTONE_ID = "11111111-1111-4111-8111-111111111102";
const STAGING_FIXTURE_BEAT_ID = "11111111-1111-4111-8111-111111111103";

const rows = [
    {
        apple_product_id: "com.digitalmusicdatabase.app.staging.subscription.listener.monthly",
        entity_type: "subscription",
        plan_slug: "premium-listener",
        billing_interval: "month",
    },
    {
        apple_product_id: "com.digitalmusicdatabase.app.staging.subscription.artist.monthly",
        entity_type: "subscription",
        plan_slug: "artist-pro",
        billing_interval: "month",
    },
    {
        apple_product_id: "com.digitalmusicdatabase.app.staging.subscription.producer.monthly",
        entity_type: "subscription",
        plan_slug: "producer-pro",
        billing_interval: "month",
    },
    {
        apple_product_id: "com.digitalmusicdatabase.app.staging.album.test",
        entity_type: "album",
        entity_id: STAGING_FIXTURE_ALBUM_ID,
    },
    {
        apple_product_id: "com.digitalmusicdatabase.app.staging.ringtone.test",
        entity_type: "ringtone",
        entity_id: STAGING_FIXTURE_RINGTONE_ID,
    },
    {
        apple_product_id: "com.digitalmusicdatabase.app.staging.beat.basic.test",
        entity_type: "beat_license",
        entity_id: STAGING_FIXTURE_BEAT_ID,
        license_type: "Basic",
    },
];

const metadata = {
    mdb_catalog_tier: "staging_dev_only",
    production_sales_blocked: true,
    app_store_connect_status: "not_activated",
};

const client = new pg.Client({
    connectionString: guard.databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
    for (const row of rows) {
        await client.query(
            `
            insert into public.apple_catalog_skus (
              apple_product_id, entity_type, entity_id, plan_slug, license_type, billing_interval, active, metadata
            ) values ($1,$2,$3,$4,$5,$6,false,$7::jsonb)
            on conflict (apple_product_id) do update set
              entity_type = excluded.entity_type,
              entity_id = excluded.entity_id,
              plan_slug = excluded.plan_slug,
              license_type = excluded.license_type,
              billing_interval = excluded.billing_interval,
              active = false,
              metadata = excluded.metadata,
              updated_at = now()
            `,
            [
                row.apple_product_id,
                row.entity_type,
                row.entity_id || null,
                row.plan_slug || null,
                row.license_type || null,
                row.billing_interval || null,
                JSON.stringify(metadata),
            ],
        );
        console.log(`PASS seeded ${row.apple_product_id}`);
    }
    console.log("NOTE: seeded SKUs are active=false (non-production, no real sales).");
} finally {
    await client.end();
}
