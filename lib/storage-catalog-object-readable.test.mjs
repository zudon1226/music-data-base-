import assert from "node:assert/strict";
import { isStorageObjectPubliclyReadable } from "./storage-catalog-object-readable.mjs";

const rows = [
    {
        storage_path: "user-a/track.mp3",
        moderation_state: "clear",
    },
    {
        storage_path: "user-b/held.mp4",
        moderation_state: "removed",
    },
];

assert.equal(isStorageObjectPubliclyReadable(rows, "user-a/track.mp3"), true);
assert.equal(isStorageObjectPubliclyReadable(rows, "user-b/held.mp4"), false);
assert.equal(isStorageObjectPubliclyReadable(rows, "orphan/unknown.mp3"), false);
assert.equal(isStorageObjectPubliclyReadable(rows, "orphan/unknown.mp3", { allowOrphanObjects: true }), true);
assert.equal(
    isStorageObjectPubliclyReadable(
        [
            { storage_path: "user-a/a.mp3", moderation_state: "takedown_pending" },
        ],
        "user-a/a.mp3",
    ),
    false,
);
assert.equal(
    isStorageObjectPubliclyReadable(
        [
            { storage_path: "shared/track.mp3", moderation_state: "clear" },
            { storage_path: "shared/track.mp3", moderation_state: "clear" },
        ],
        "shared/track.mp3",
    ),
    false,
);
assert.equal(
    isStorageObjectPubliclyReadable(
        [
            { storage_path: "shared/held.mp3", moderation_state: "clear" },
            { storage_path: "shared/held.mp3", moderation_state: "takedown_pending" },
        ],
        "shared/held.mp3",
    ),
    false,
);
assert.equal(
    isStorageObjectPubliclyReadable(
        [
            { storage_path: "shared/removed.mp3", moderation_state: "clear" },
            { storage_path: "shared/removed.mp3", moderation_state: "removed" },
        ],
        "shared/removed.mp3",
    ),
    false,
);
assert.equal(
    isStorageObjectPubliclyReadable(
        [{ storage_path: "user-a/null.mp3", moderation_state: null }],
        "user-a/null.mp3",
    ),
    false,
);
assert.equal(
    isStorageObjectPubliclyReadable(
        [{ storage_path: "user-a/empty.mp3", moderation_state: "" }],
        "user-a/empty.mp3",
    ),
    false,
);
assert.equal(
    isStorageObjectPubliclyReadable(
        [{ storage_path: "user-a/bad.mp3", moderation_state: "not-a-state" }],
        "user-a/bad.mp3",
    ),
    false,
);

console.log("storage-catalog-object-readable tests passed.");
