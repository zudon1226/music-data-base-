/**
 * Moderation report status, takedown hold, and catalog visibility tests.
 * Run: node lib/moderation-status.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    canTransitionModerationStatus,
    catalogHoldFromReportStatuses,
    catalogTableForItemType,
    filterPublicCatalogRows,
    isCatalogItemPubliclyPlayable,
    isModerationItemType,
    isModerationStatus,
} from "./moderation-status.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

assert.equal(isModerationItemType("song"), true);
assert.equal(isModerationItemType("podcast_episode"), true);
assert.equal(isModerationItemType("copyright"), false);
assert.equal(isModerationStatus("takedown_pending"), true);
assert.equal(isModerationStatus("hidden"), false);

assert.equal(canTransitionModerationStatus("open", "reviewing"), true);
assert.equal(canTransitionModerationStatus("open", "removed"), true);
assert.equal(canTransitionModerationStatus("removed", "resolved"), true);
assert.equal(canTransitionModerationStatus("removed", "takedown_pending"), false);
assert.equal(canTransitionModerationStatus("dismissed", "removed"), false);
assert.equal(canTransitionModerationStatus("resolved", "removed"), false);
assert.equal(canTransitionModerationStatus("reviewing", "reviewing"), true);

assert.equal(catalogHoldFromReportStatuses(["open", "reviewing"]), "clear");
assert.equal(catalogHoldFromReportStatuses(["open", "takedown_pending"]), "takedown_pending");
assert.equal(catalogHoldFromReportStatuses(["takedown_pending", "removed"]), "removed");
assert.equal(catalogHoldFromReportStatuses(["dismissed", "resolved"]), "clear");
assert.equal(catalogTableForItemType("song"), "songs");
assert.equal(catalogTableForItemType("podcast_episode"), "podcast_episodes");
assert.equal(catalogTableForItemType("comment"), "");

assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "clear" }), true);
assert.equal(isCatalogItemPubliclyPlayable({}), true);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "takedown_pending" }), false);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "removed" }), false);
assert.equal(isCatalogItemPubliclyPlayable(
    { moderation_state: "removed", user_id: "owner-1" },
    { allowOwner: true, viewerUserId: "owner-1" },
), true);
assert.equal(isCatalogItemPubliclyPlayable(
    { moderation_state: "removed", user_id: "owner-1" },
    { allowOwner: true, viewerUserId: "other" },
), false);

const publicRows = filterPublicCatalogRows([
    { id: "a", moderation_state: "clear" },
    { id: "b", moderation_state: "takedown_pending" },
    { id: "c", moderation_state: "removed" },
]);
assert.deepEqual(publicRows.map((row) => row.id), ["a"]);

const route = read("app/api/moderation/reports/route.ts");
assert.ok(route.includes("canTransitionModerationStatus"));
assert.ok(route.includes("syncCatalogHoldForReportedItem"));
assert.ok(route.includes("isAdminUserId"));
assert.ok(route.includes("podcast_episode_comments"));
assert.equal(/from\("songs"\)\.delete\(\)/.test(route), false);

const submit = read("lib/submit-user-moderation-report.ts");
assert.ok(submit.includes("isModerationItemType"));
assert.equal(/ALLOWED_ITEM_TYPES/.test(submit), false);

const panel = read("app/page.tsx");
assert.ok(panel.includes("<PersistedModerationReports"));
assert.equal(panel.includes("updateModerationReportStatus(report.id, \"removed\")"), false);
assert.ok(panel.includes("browser-local only"));
assert.ok(panel.includes("onReportEpisode"));

const persisted = read("components/moderation/PersistedModerationReports.tsx");
assert.ok(persisted.includes("takedown_pending"));
assert.ok(persisted.includes("Restore"));
assert.match(
    persisted,
    /report\.status === "open" \|\| report\.status === "reviewing"[\s\S]*updateStatus\(report, "resolved"\)[\s\S]*>\s*Resolve\s*</,
    "Resolve action for open/reviewing reports",
);
assert.match(
    persisted,
    /report\.status === "takedown_pending" \|\| report\.status === "removed"[\s\S]*updateStatus\(report, "resolved"\)[\s\S]*>\s*Restore\s*</,
    "Restore action limited to takedown_pending/removed",
);
assert.ok(
    persisted.includes("moderation_state") && persisted.includes("publication status is unchanged"),
    "queue copy describes moderation_state without claiming podcast publish changes",
);

const audioRoute = read("app/api/audio/route.ts");
assert.ok(audioRoute.includes("evaluateSongAudioPlaybackAccess"));
assert.ok(audioRoute.includes("resolveCatalogSongForAudio"));
assert.ok(audioRoute.includes("AudioPlaybackGuardError"));
assert.ok(read("lib/audio-playback-guard.ts").includes("isModerationHoldColumnError"));
assert.ok(read("lib/audio-playback-guard.ts").includes("pickUniqueCatalogSongForStoragePath"));

const migration = read("supabase/migrations/202610172000_catalog_moderation_hold.sql");
assert.ok(migration.includes("moderation_state"));
assert.ok(migration.includes("podcast_episode"));
assert.ok(migration.includes("Does not delete media files"));

const podcastData = read("lib/podcast-data.ts");
assert.match(
    podcastData,
    /PODCAST_EPISODE_COLUMNS[\s\S]*moderation_state/,
    "podcast episode selects include moderation_state for hold filtering",
);

console.log("moderation-status tests passed.");
