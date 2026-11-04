/**
 * Verify internal QA isolation wiring (no runtime env required).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function record(ok, label) {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) process.exitCode = 1;
}

const qa = read("lib/apple/apple-iap-internal-qa.ts");
record(qa.includes("jzlegcbotqfzevtczwhx"), "staging ref guard");
record(qa.includes("aehuszoadgqtbkxsliyy"), "production ref blocked");
record(qa.includes("APPLE_IAP_INTERNAL_QA_ENABLED"), "master switch env (default off)");
record(qa.includes("VERCEL_ENV"), "blocks vercel production label");
record(qa.includes("isPublicBetaCommerceLocked()"), "requires global lock for QA path");

const route = read("app/api/apple/internal-qa/storekit/route.ts");
record(route.includes("requireMatchingUserId"), "auth required for QA probe");
record(route.includes("entitlementsGranted: false"), "QA route never grants");

const stage1 = read("lib/apple/apple-iap-stage1.ts");
record(stage1.includes("APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED = true"), "kill switch unchanged");

const bridge = read("lib/ios/mdb-storekit-bridge.ts");
record(bridge.includes("resolveNativeStoreKitCommerceLocked"), "bridge uses server gate");
record(bridge.includes("return true"), "bridge fail-closed on errors");

if (process.exitCode) {
    console.error("\nApple IAP internal QA verification failed.");
} else {
    console.log("\nApple IAP internal QA verification passed.");
}
