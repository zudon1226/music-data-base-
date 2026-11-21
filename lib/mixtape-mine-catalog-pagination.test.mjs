import assert from "node:assert/strict";
import {
    appendUniqueMixtapeIds,
    clampMineCatalogLimit,
    decodeMineCatalogCursor,
    encodeMineCatalogCursor,
    mergeMineCatalogPages,
    mineCatalogCursorOrFilter,
    MINE_CATALOG_DEFAULT_LIMIT,
    MINE_CATALOG_MAX_PAGES,
    isMineCatalogLoadIncomplete,
} from "./mixtape-mine-catalog-pagination.mjs";

assert.equal(clampMineCatalogLimit(undefined), MINE_CATALOG_DEFAULT_LIMIT);
assert.equal(clampMineCatalogLimit(999), 50);
assert.equal(clampMineCatalogLimit(0), 1);

const row = { id: "11111111-1111-1111-1111-111111111111", updated_at: "2026-01-02T00:00:00.000Z" };
const token = encodeMineCatalogCursor(row);
assert.ok(token);
assert.deepEqual(decodeMineCatalogCursor(token), { updatedAt: row.updated_at, id: row.id });
assert.equal(decodeMineCatalogCursor("not-valid"), null);

assert.match(
    mineCatalogCursorOrFilter({ updatedAt: row.updated_at, id: row.id }),
    /updated_at\.lt\./,
);

const page1 = [
    { id: "a", updated_at: "2026-01-03T00:00:00.000Z" },
    { id: "b", updated_at: "2026-01-02T00:00:00.000Z" },
];
const page2 = [
    { id: "b", updated_at: "2026-01-02T00:00:00.000Z" },
    { id: "c", updated_at: "2026-01-01T00:00:00.000Z" },
];
const merged = mergeMineCatalogPages([page1, page2]);
assert.deepEqual(merged.map((x) => x.id).sort(), ["a", "b", "c"]);

assert.deepEqual(appendUniqueMixtapeIds(["a"], [{ id: "b" }, { id: "a" }]).sort(), ["a", "b"]);

assert.equal(isMineCatalogLoadIncomplete(MINE_CATALOG_MAX_PAGES, true), true);
assert.equal(isMineCatalogLoadIncomplete(MINE_CATALOG_MAX_PAGES, false), false);
assert.equal(isMineCatalogLoadIncomplete(3, true), false);

console.log("mixtape-mine-catalog-pagination.test.mjs passed");