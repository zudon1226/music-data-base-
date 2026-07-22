/**
 * Verify draft create/update authorization stays creator-scoped.
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

const post = read("app/api/ringtones/route.ts");
const patch = read("app/api/ringtones/[id]/route.ts");
const access = read("lib/ringtone-access.ts");

record(
    "POST requires matching authenticated userId",
    post.includes('requireMatchingUserId(request, "/api/ringtones", userId)')
        && post.includes("requireRingtoneCreator(userId)"),
);
record(
    "POST creator_id comes from authenticated userId",
    post.includes("creatorId: userId")
        && !/creator_id:\s*body\.creatorId/.test(post),
);
record(
    "POST ownership check for provided sourceSongId",
    post.includes("assertOwnsSourceSong(userId, sourceSongId)"),
);
record(
    "PATCH requires matching authenticated userId",
    patch.includes('requireMatchingUserId(request, "/api/ringtones/[id]", userId)'),
);
record(
    "PATCH rejects non-owner non-admin updates",
    patch.includes("You may only manage your own ringtone records."),
);
record(
    "PATCH re-checks owned song authorization on sourceSongId change",
    patch.includes("assertOwnsSourceSong(userId, songId)"),
);
record(
    "upload sourceStoragePath must be owner-scoped",
    patch.includes("sourceStoragePath must be owner-scoped under the creator id.")
        && post.includes("buildCreateRingtonePayload"),
);
record(
    "assertOwnsSourceSong helper present",
    access.includes("export async function assertOwnsSourceSong"),
);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
