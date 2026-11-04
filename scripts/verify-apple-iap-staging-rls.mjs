/**
 * Post-migration RLS checks for Apple IAP tables on staging (requires STAGING_DATABASE_URL).
 * Usage: MDB_APPLE_IAP_STAGING_APPLY=1 STAGING_DATABASE_URL=... node scripts/verify-apple-iap-staging-rls.mjs
 */
import pg from "pg";
import { assertAppleIapStagingApplyAllowed } from "./_apple-iap-staging-guard.mjs";

const guard = assertAppleIapStagingApplyAllowed();
if (!guard.ok) {
    console.log(`BLOCKED staging RLS verify — ${guard.code}: ${guard.message}`);
    process.exit(2);
}

const client = new pg.Client({
    connectionString: guard.databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

await client.connect();
try {
    const eventsPriv = await client.query(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema='public' and table_name='apple_payment_events' and grantee='authenticated'
    `);
    record(eventsPriv.rows.length === 0, "authenticated has no grants on apple_payment_events");

    const skuWrite = await client.query(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema='public' and table_name='apple_catalog_skus' and grantee='authenticated'
        and privilege_type in ('INSERT','UPDATE','DELETE')
    `);
    record(skuWrite.rows.length === 0, "authenticated cannot write apple_catalog_skus");

    const skuSelect = await client.query(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema='public' and table_name='apple_catalog_skus' and grantee='authenticated'
        and privilege_type='SELECT'
    `);
    record(skuSelect.rows.length > 0, "authenticated can select apple_catalog_skus");

    const seeded = await client.query(`
      select count(*)::int as count
      from public.apple_catalog_skus
      where metadata->>'mdb_catalog_tier' = 'staging_dev_only' and active = false
    `);
    record(Number(seeded.rows[0]?.count || 0) >= 6, "six inactive staging SKUs present", String(seeded.rows[0]?.count || 0));
} finally {
    await client.end();
}

if (process.exitCode) {
    console.error("\nApple IAP staging RLS verification failed.");
} else {
    console.log("\nApple IAP staging RLS verification passed.");
}
