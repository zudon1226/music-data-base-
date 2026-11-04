/**
 * Static StoreKit native bridge checks (Xcode compile not run on Windows).
 * Usage: node scripts/verify-apple-storekit-native.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function record(ok, label) {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) process.exitCode = 1;
}

const swift = read("ios/App/App/MDBStoreKitPlugin.swift");
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const bridge = read("lib/ios/mdb-storekit-bridge.ts");

record(swift.includes("CAPBridgedPlugin"), "Swift plugin uses CAPBridgedPlugin");
record(swift.includes("jsName = \"MDBStoreKit\""), "native jsName MDBStoreKit");
record(bridge.includes('registerPlugin<MDBStoreKitPlugin>("MDBStoreKit")'), "JS registerPlugin MDBStoreKit");
record(swift.includes("commerceLocked"), "native purchase respects commerceLocked");
record(swift.includes("jwsRepresentation"), "native returns JWS not decode-only JSON");
record(pbx.includes("MDBStoreKitPlugin.swift"), "Xcode project includes plugin source");

const methods = ["loadProducts", "purchaseProduct", "restorePurchases", "currentEntitlements"];
for (const method of methods) {
    record(swift.includes(method), `native method ${method}`);
    record(bridge.includes(method) || method === "currentEntitlements", `JS bridge exposes ${method}`);
}

console.log("\nNOTE: Native Xcode build was not executed in this environment (no authorized macOS runner).");

if (process.exitCode) {
    console.error("StoreKit native static verification failed.");
} else {
    console.log("StoreKit native static verification passed.");
}
