/**
 * Phase 29G — listener catalog prices, beta checkout locks, entitlements wiring.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, passed, detail = "") {
    results.push({ name, passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

const page = read("app/page.tsx");
const display = read("lib/sales-display-price.ts");
const checkout = read("app/api/sales/checkout/route.ts");
const catalog = read("lib/sales-catalog.ts");
const entitlements = read("lib/sales-album-entitlements.ts");
const fulfillment = read("lib/sales-payment-fulfillment.ts");
const ringtoneMarket = read("app/api/ringtones/marketplace/route.ts");

record("marketplace songs use resolveSongDisplayPriceCents", page.includes("priceCents: resolveSongDisplayPriceCents(song)"));
record("marketplace albums use resolveAlbumDisplayPriceCents", page.includes("priceCents: resolveAlbumDisplayPriceCents(album)"));
record("dashboard monetization uses catalog song price", page.includes("priceCents: resolveSongDisplayPriceCents(song)"));
record("marketplace beats use resolveBeatLeasePriceCents", page.includes("const priceCents = resolveBeatLeasePriceCents(beat)"));
record("listener formatCatalogPriceLabel exists", display.includes("formatCatalogPriceLabel"));
record("beta sales lock gates checkout button", page.includes("salesPaidCheckoutLocked && salesCartSubtotalCents > 0"));
record("beta sales lock gates add to cart", page.includes("salesPaidCheckoutLocked && Math.max(0, release.priceCents || 0) > 0"));
record("marketplace hides buy when checkout locked", page.includes("marketplacePurchaseEnabled"));
record("server checkout enforces beta lock", checkout.includes("isPublicBetaPaidSalesCheckoutLocked"));
record("catalog resolves song price_cents", catalog.includes('.from("songs")') && catalog.includes("price_cents"));
record("album bundle vault expansion", fulfillment.includes("expandAlbumPurchaseVaultRows") && entitlements.includes("album_bundle"));
record("ringtone marketplace beta flags", ringtoneMarket.includes("publicBetaPaidPurchaseLocked") && ringtoneMarket.includes("paidCheckoutAvailable"));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);