/**
 * Phase 29F — static checks for song/album upload pricing (sales-catalog reuse).
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

const priceInput = read("lib/sales-price-input.ts");
const upload = read("app/api/upload-audio/route.ts");
const albumCreate = read("app/api/albums/create/route.ts");
const catalog = read("lib/sales-catalog.ts");
const entitlements = read("lib/sales-album-entitlements.ts");
const fulfillment = read("lib/sales-payment-fulfillment.ts");
const processing = read("lib/ringtone-processing.ts");
const page = read("app/page.tsx");

record("sales-price-input exports parseSalesPriceCentsFromBody", priceInput.includes("parseSalesPriceCentsFromBody"));
record("upload-audio persists price_cents", upload.includes("price_cents: songPriceCents") && upload.includes("parseSalesPriceCentsFromBody"));
record("album create persists price_cents", albumCreate.includes("price_cents: bundlePrice.priceCents"));
record("sales-catalog reads songs.price_cents", catalog.includes("price_cents") && catalog.includes('itemType === "song"'));
record("sales-catalog reads albums.price_cents", catalog.includes('itemType === "album"'));
record("album entitlements expand tracks", fulfillment.includes("expandAlbumPurchaseVaultRows") && entitlements.includes("album_bundle"));
record("ringtone plan allows songs bucket library paths", processing.includes("SONGS_BUCKET") && processing.includes("isAuthorizedLibrarySourcePath"));
record("upload UI song sale price field", page.includes("salePriceDollars") && page.includes("songSalePrice"));
record("upload UI album bundle + track price", page.includes("bundlePriceDollars") && page.includes("trackSalePriceDollars"));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);