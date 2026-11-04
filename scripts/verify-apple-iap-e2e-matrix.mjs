/**
 * Static E2E test matrix coverage for Apple IAP sandbox readiness.
 * Usage: node scripts/verify-apple-iap-e2e-matrix.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const matrix = [
    ["Listener monthly subscription", "seed-apple-iap-staging-skus.mjs", "premium-listener"],
    ["Artist monthly subscription", "seed-apple-iap-staging-skus.mjs", "artist-pro"],
    ["Producer monthly subscription", "seed-apple-iap-staging-skus.mjs", "producer-pro"],
    ["Test album", "seed-apple-iap-staging-skus.mjs", "staging.album.test"],
    ["Test ringtone", "seed-apple-iap-staging-skus.mjs", "staging.ringtone.test"],
    ["Beat license", "seed-apple-iap-staging-skus.mjs", "beat.basic.test"],
    ["Duplicate transaction rejection", "apple-transaction-verify.ts", "insertResult.duplicate"],
    ["Cross-account ownership rejection", "apple-transaction-verify.ts", "TRANSACTION_OWNERSHIP_CONFLICT"],
    ["Invalid signature rejection", "app-store-jws.ts", "verifyAndDecodeTransaction"],
    ["Sandbox/Production mismatch", "apple-environment-validation.ts", "INVALID_ENVIRONMENT"],
    ["Refund/revocation ASN", "apple-asn-processor.ts", "revoked_no_grant"],
    ["Restore on another device", "apple-transaction-restore.ts", "restored_no_grant"],
    ["My Purchases verified-only", "apple-listener-vault.ts", "verified, no beta grant"],
];

let failed = 0;
for (const [label, fileHint, needle] of matrix) {
    const path = fileHint.includes("/") ? `app/api/${fileHint}` : fileHint.startsWith("apple-") || fileHint.startsWith("app-store") ? `lib/apple/${fileHint}` : `scripts/${fileHint}`;
    const source = read(path);
    const ok = source.includes(needle);
    console.log(`${ok ? "PASS" : "FAIL"} matrix: ${label}`);
    if (!ok) failed += 1;
}

const stage1 = read("lib/apple/apple-iap-stage1.ts");
const okKill = stage1.includes("APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED = true");
console.log(`${okKill ? "PASS" : "FAIL"} matrix: grant kill switch remains active`);
if (!okKill) failed += 1;

process.exit(failed ? 1 : 0);
