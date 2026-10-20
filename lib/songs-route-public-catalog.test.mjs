/**
 * Public songs catalog must require moderation_state (no silent fallback).
 * Run: node lib/songs-route-public-catalog.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/songs/route.ts"), "utf8");

assert.ok(route.includes("PUBLIC_SONG_COLUMNS_WITH_HOLD"), "public catalog selects moderation_state");
assert.ok(route.includes("filterPublicCatalogRows"), "public catalog filters moderation holds");
assert.ok(route.includes("isModerationHoldColumnError"), "detects missing moderation_state column");

assert.doesNotMatch(
    route,
    /isModerationHoldColumnError\(result\.error\)[\s\S]{0,200}\.select\(PUBLIC_SONG_COLUMNS\)/,
    "must not fall back to selects without moderation_state",
);

assert.match(
    route,
    /isModerationHoldColumnError\(result\.error\)[\s\S]{0,120}MODERATION_HOLD_MIGRATION_MESSAGE/,
    "missing moderation_state fails with migration message",
);
assert.match(route, /MODERATION_HOLD_MIGRATION_MESSAGE[\s\S]{0,80}202610172000/, "migration id documented");

console.log("songs-route-public-catalog tests passed.");
