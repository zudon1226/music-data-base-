import assert from "node:assert/strict";
import { isMineCatalogLoadIncomplete, MINE_CATALOG_MAX_PAGES } from "./mixtape-mine-catalog-pagination.mjs";
import {
    applyProgressiveMineCatalogPage,
    isStudioCatalogInteractive,
    mergeCatalogTracksById,
    mergeUniqueMixtapesById,
    shouldApplyMineCatalogRequest,
    upsertMixtapeById,
    upsertTrackById,
} from "./mixtape-studio-catalog.shared.mjs";

const a = { id: "aaa", title: "A" };
const b = { id: "bbb", title: "B" };
const c = { id: "ccc", title: "C" };

assert.equal(isStudioCatalogInteractive(0), false);
assert.equal(isStudioCatalogInteractive(1), true);

const afterPage1 = applyProgressiveMineCatalogPage([], [], [a, b], [], "");
assert.deepEqual(afterPage1.mixtapes.map((x) => x.id).sort(), ["aaa", "bbb"]);

const afterPage2 = applyProgressiveMineCatalogPage(afterPage1.mixtapes, afterPage1.tracks, [c], [], "");
assert.deepEqual(afterPage2.mixtapes.map((x) => x.id).sort(), ["aaa", "bbb", "ccc"]);
assert.equal(mergeUniqueMixtapesById([a, b], [b, c]).length, 3);

const localTrack = { id: "t-local", mixtapeId: "aaa", title: "Local" };
const pageTrack = { id: "t-page", mixtapeId: "bbb", title: "Page" };
const mergedTracks = applyProgressiveMineCatalogPage(
    [a],
    [localTrack],
    [b],
    [pageTrack],
    "aaa",
).tracks;
assert.ok(mergedTracks.some((t) => t.id === "t-local"));
assert.ok(mergedTracks.some((t) => t.id === "t-page"));

const upserted = upsertTrackById([], localTrack);
const afterLatePage = mergeCatalogTracksById(upserted, [pageTrack]);
assert.deepEqual(afterLatePage.map((t) => t.id).sort(), ["t-local", "t-page"]);

const draft = { id: "new", title: "New" };
const afterStalePage = applyProgressiveMineCatalogPage(
    upsertMixtapeById([a], draft),
    [],
    [a],
    [],
    "new",
).mixtapes;
assert.ok(afterStalePage.some((m) => m.id === "new"));

assert.equal(shouldApplyMineCatalogRequest(1, 2, false), false);
assert.equal(shouldApplyMineCatalogRequest(2, 2, false), true);

assert.equal(isMineCatalogLoadIncomplete(MINE_CATALOG_MAX_PAGES, true), true);
assert.equal(isMineCatalogLoadIncomplete(3, true), false);

console.log("mixtape-studio-progressive.test.mjs passed");