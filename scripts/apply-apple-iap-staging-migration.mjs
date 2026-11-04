/**
 * Apply Apple IAP migrations to isolated staging Supabase only.
 * Usage: MDB_APPLE_IAP_STAGING_APPLY=1 STAGING_DATABASE_URL=... STAGING_SUPABASE_URL=... node scripts/apply-apple-iap-staging-migration.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertAppleIapStagingApplyAllowed } from "./_apple-iap-staging-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guard = assertAppleIapStagingApplyAllowed();
if (!guard.ok) {
    console.log(`BLOCKED Apple IAP staging migration — ${guard.code}: ${guard.message}`);
    process.exit(2);
}

const migrations = [
    "202611031700_apple_iap_foundation.sql",
    "202611031800_apple_iap_staging_readiness.sql",
];

const client = new pg.Client({
    connectionString: guard.databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
    for (const file of migrations) {
        const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
        try {
            await client.query(sql);
            console.log(`PASS applied ${file}`);
        } catch (error) {
            const message = String(error?.message || error);
            if (/already exists|duplicate/i.test(message)) {
                console.log(`PASS ${file} (already applied)`);
            } else {
                console.error(`FAIL ${file}: ${message.slice(0, 240)}`);
                process.exitCode = 1;
            }
        }
    }

    const providers = await client.query(`
      select payment_provider, count(*)::int as count
      from public.purchase_history
      where payment_provider is not null
      group by payment_provider
      order by payment_provider
    `);
    console.log("purchase_history payment_provider counts:", providers.rows);

    console.log(`DONE staging ref ${guard.confirmedRef}`);
} finally {
    await client.end();
}
