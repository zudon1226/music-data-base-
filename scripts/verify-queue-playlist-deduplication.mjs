/**
 * Queue → playlist deduplication contracts.
 * Run: node scripts/verify-queue-playlist-deduplication.mjs
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

const api = read("app/api/playlist-items/route.ts");
const page = read("app/page.tsx");

record(
    "batch path loads existing playlist_items before insert",
    api.includes('.from("playlist_items")')
        && api.includes('.eq("playlist_id", playlistId)')
        && api.includes("existingKeys")
        && api.includes("skippedExisting"),
);

record(
    "batch skips duplicates by item_type:item_id",
    api.includes("existingKeys.has(key)")
        && api.includes("`${item.itemType}:${item.itemId}`"),
);

record(
    "batch preserves queue order via staggered created_at",
    api.includes("created_at: new Date(baseMs + toInsert.length).toISOString()"),
);

record(
    "unique index still documented in app schema bootstrap",
    page.includes("playlist_items_unique_item_idx"),
);

record(
    "client does not insert duplicates when presence is all",
    page.includes('if (presence.state === "all")')
        && page.includes("All queue items are already in this playlist"),
);

record(
    "single-item POST path still returns alreadyAdded",
    api.includes("alreadyAdded: true")
        && api.includes("alreadyAdded: false"),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nQUEUE_PLAYLIST_DEDUPLICATION_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
