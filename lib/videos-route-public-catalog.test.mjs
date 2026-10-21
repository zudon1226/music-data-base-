/**
 * Public videos catalog must require moderation_state (no silent fallback).
 * Run: node lib/videos-route-public-catalog.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/videos/route.ts"), "utf8");

assert.ok(route.includes("moderation_state"), "video selects include moderation_state");
assert.ok(route.includes("filterPublicCatalogRows"), "public catalog filters moderation holds");
assert.ok(route.includes("isModerationHoldColumnError"), "detects missing moderation_state column");

for (const fallback of route.matchAll(/SELECT_FALLBACKS = \[([\s\S]*?)\] as const;/g)) {
    const block = fallback[1];
    const entries = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    assert.ok(entries.length > 0, "SELECT_FALLBACKS defined");
    for (const entry of entries) {
        assert.ok(
            entry.split(",").map((part) => part.trim()).includes("moderation_state"),
            `fallback select must include moderation_state: ${entry.slice(0, 80)}…`,
        );
    }
}

assert.match(
    route,
    /isModerationHoldColumnError\(result\.error\)[\s\S]{0,120}MODERATION_HOLD_MIGRATION_MESSAGE/,
    "missing moderation_state fails with migration message",
);
assert.match(route, /MODERATION_HOLD_MIGRATION_MESSAGE[\s\S]{0,80}202610172000/, "migration id documented");
assert.match(
    route,
    /message === MODERATION_HOLD_MIGRATION_MESSAGE[\s\S]{0,80}500/,
    "migration failure returns 500 instead of storage recovery",
);
assert.doesNotMatch(
    route,
    /listShallowStorageVideos|recovered_from_storage|storage\.from\("videos"\)\.list/,
    "public catalog must not recover videos from storage (moderation bypass)",
);

console.log("videos-route-public-catalog tests passed.");
