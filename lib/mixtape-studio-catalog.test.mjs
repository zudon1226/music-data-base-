import assert from "node:assert/strict";
import {
    mergeMineCatalogResponse,
    shouldApplyMineCatalogRequest,
    shouldClearStudioLoading,
    upsertMixtapeById,
} from "./mixtape-studio-catalog.shared.mjs";

// Shared .mjs mirrors mixtape-studio-catalog.ts for node tests without a TS loader.

const a = { id: "aaa", title: "A" };
const b = { id: "bbb", title: "B" };
const c = { id: "ccc", title: "C" };

assert.deepEqual(upsertMixtapeById([a, b], { ...b, title: "B2" }), [{ id: "bbb", title: "B2" }, a]);
assert.deepEqual(upsertMixtapeById([a], c).map((x) => x.id), ["ccc", "aaa"]);

const server = [{ id: "aaa", title: "A" }];
const local = [{ id: "ccc", title: "C" }, { id: "aaa", title: "A-local" }];
assert.deepEqual(mergeMineCatalogResponse(server, local, "ccc").map((x) => x.id).sort(), ["aaa", "ccc"]);
assert.deepEqual(mergeMineCatalogResponse(server, local, "").map((x) => x.id), ["aaa"]);

assert.equal(shouldApplyMineCatalogRequest(2, 2, false), true);
assert.equal(shouldApplyMineCatalogRequest(1, 2, false), false);
assert.equal(shouldApplyMineCatalogRequest(2, 2, true), false);

assert.equal(shouldClearStudioLoading(2, 2), true);
assert.equal(shouldClearStudioLoading(1, 2), false);

const newMix = { id: "new", title: "New" };
assert.equal(
    upsertMixtapeById(upsertMixtapeById([a], newMix), { ...newMix, title: "New2" })
        .filter((item) => item.id === "new").length,
    1,
);
assert.equal(upsertMixtapeById(upsertMixtapeById([a], newMix), newMix).map((item) => item.id).join(","), "new,aaa");

const staleServer = [{ id: "aaa", title: "A" }];
const localAfterCreate = [newMix, a];
assert.deepEqual(
    mergeMineCatalogResponse(staleServer, localAfterCreate, "new").map((item) => item.id).sort(),
    ["aaa", "new"],
);

console.log("mixtape-studio-catalog.test.mjs passed");