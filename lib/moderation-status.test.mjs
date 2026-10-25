/**
 * Moderation report status, takedown hold, and catalog visibility tests.
 * Run: node lib/moderation-status.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    CATALOG_MODERATION_UNKNOWN,
    canTransitionModerationStatus,
    catalogHoldFromReportStatuses,
    catalogTableForItemType,
    filterPublicCatalogRows,
    isCatalogItemPubliclyPlayable,
    redactNonPlayableCatalogMedia,
    isCatalogItemVisibleInPrivateLibrary,
    isModerationItemType,
    isModerationStatus,
    normalizeCatalogModerationState,
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
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: " clear " }), true);
assert.equal(isCatalogItemPubliclyPlayable({}), false, "missing moderation_state fails closed");
assert.equal(
    isCatalogItemPubliclyPlayable({ id: "33333333-3333-4333-8333-333333333333" }),
    false,
    "catalog UUID without moderation_state must fail closed",
);
assert.equal(
    isCatalogItemPubliclyPlayable({ id: "33333333-3333-4333-8333-333333333333", moderation_state: null }),
    false,
    "null moderation_state must fail closed",
);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "" }), false, "empty moderation_state must fail closed");
assert.equal(normalizeCatalogModerationState(null), CATALOG_MODERATION_UNKNOWN);
assert.equal(normalizeCatalogModerationState(undefined), CATALOG_MODERATION_UNKNOWN);
assert.equal(normalizeCatalogModerationState(""), CATALOG_MODERATION_UNKNOWN);
assert.equal(normalizeCatalogModerationState("   "), CATALOG_MODERATION_UNKNOWN);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "takedown_pending" }), false);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "removed" }), false);
assert.equal(normalizeCatalogModerationState("not-a-hold-state"), CATALOG_MODERATION_UNKNOWN);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "not-a-hold-state" }), false);
assert.equal(isCatalogItemPubliclyPlayable(
    { moderation_state: "removed", user_id: "owner-1" },
), false);
assert.equal(isCatalogItemPubliclyPlayable(
    { moderation_state: "takedown_pending", user_id: "owner-1" },
), false);
assert.equal(isCatalogItemVisibleInPrivateLibrary(
    { moderation_state: "takedown_pending", user_id: "owner-1" },
    { allowOwner: true, viewerUserId: "owner-1" },
), true);
assert.equal(isCatalogItemVisibleInPrivateLibrary(
    { moderation_state: "removed", user_id: "owner-1" },
    { allowOwner: true, viewerUserId: "owner-1" },
), false);
assert.equal(isCatalogItemVisibleInPrivateLibrary(
    { moderation_state: "removed", user_id: "owner-1" },
    { isAdmin: true },
), true);
assert.equal(isCatalogItemVisibleInPrivateLibrary(
    { moderation_state: "not-a-hold-state", user_id: "owner-1" },
    { allowOwner: true, viewerUserId: "owner-1" },
), false);
assert.equal(isCatalogItemVisibleInPrivateLibrary(
    { moderation_state: "not-a-hold-state", user_id: "owner-1" },
    { isAdmin: true },
), true);
assert.equal(isCatalogItemVisibleInPrivateLibrary(
    { moderation_state: null, user_id: "owner-1" },
    { allowOwner: true, viewerUserId: "owner-1" },
), false);

const heldLibraryRow = redactNonPlayableCatalogMedia({
    id: "33333333-3333-4333-8333-333333333333",
    title: "Held",
    moderation_state: "takedown_pending",
    audio_url: "https://cdn.example.com/held.mp3",
    video_url: "https://cdn.example.com/held.mp4",
    storage_path: "owner/held.mp3",
    playableUrl: "https://cdn.example.com/held.mp4",
});
assert.equal(heldLibraryRow.title, "Held");
assert.equal(heldLibraryRow.moderation_state, "takedown_pending");
assert.equal(heldLibraryRow.audio_url, "");
assert.equal(heldLibraryRow.video_url, "");
assert.equal(heldLibraryRow.storage_path, "");
assert.equal(heldLibraryRow.playableUrl, "");
const removedLibraryRow = redactNonPlayableCatalogMedia({
    title: "Removed",
    moderation_state: "removed",
    audio_url: "https://cdn.example.com/removed.mp3",
});
assert.equal(removedLibraryRow.audio_url, "");
const clearLibraryRow = redactNonPlayableCatalogMedia({
    title: "Clear",
    moderation_state: "clear",
    audio_url: "https://cdn.example.com/clear.mp3",
});
assert.equal(clearLibraryRow.audio_url, "https://cdn.example.com/clear.mp3");

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
assert.ok(read("app/api/moderation/media-preview/route.ts").includes("evaluateModerationMediaPreviewAccess"));
assert.ok(read("lib/audio-playback-guard.ts").includes("isCatalogItemPubliclyPlayable(song"));

const persisted = read("components/moderation/PersistedModerationReports.tsx");
assert.ok(persisted.includes("/api/moderation/reports"));
assert.ok(persisted.includes('updateStatus(report, "removed")'));
assert.ok(persisted.includes("Remove"));

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
