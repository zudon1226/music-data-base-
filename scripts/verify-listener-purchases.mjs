/**
 * Listener My Purchases vault — API, nav, and read-only commerce lock wiring.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const route = read("app/api/listener/purchases/route.ts");
const service = read("lib/listener-purchases-service.ts");
const panel = read("components/listener/listener-purchases-panel.tsx");
const roleLib = read("lib/role-based-navigation.ts");
const page = read("app/page.tsx");

record("listener purchases API route", route.includes("requireMatchingUserId") && route.includes("loadListenerPurchasesBundle"));
record("API scopes to userId param", route.includes('.get("userId")'));
record("API exposes commerce lock flag", route.includes("isPublicBetaCommerceLocked"));
record("API empty message copy", route.includes("Your purchase history will appear here when purchases become available."));
record("service queries purchase_history by user_id", service.includes('.from("purchase_history")') && service.includes('.eq("user_id", userId)'));
record("service queries ringtone_purchases by buyer_id", service.includes('.from("ringtone_purchases")') && service.includes('.eq("buyer_id", userId)'));
record("receipt eligibility helpers", service.includes("isMarketplaceReceiptRow") && service.includes("isRingtoneReceiptRow"));
record("ringtone dedupe against marketplace", service.includes("marketplaceRingtoneKeys"));
record("order numbers derived from ids", service.includes("shortOrderNumber"));
record("panel is read-only (no checkout)", !panel.includes("purchaseRingtone") && !panel.includes("checkout"));
record("panel shows commerce lock notice", panel.includes("PublicBetaCommerceLockNotice"));
record("My Purchases in listener nav", roleLib.includes('"My Purchases"'));
record("page mounts ListenerPurchasesPanel", page.includes("ListenerPurchasesPanel") && page.includes('view === "My Purchases"'));

const failed = results.filter((entry) => !entry.ok);
if (failed.length > 0) {
    console.error(`\n${failed.length} verification check(s) failed.`);
    process.exit(1);
}

console.log(`\nAll ${results.length} listener purchases checks passed.`);
