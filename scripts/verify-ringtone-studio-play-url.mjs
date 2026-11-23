/**
 * Static checks for ringtone studio signed play URL + draft price clamp (Phase 29 pricing audit).
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

const playUrlRoute = read("app/api/ringtones/source-songs/play-url/route.ts");
const client = read("lib/ringtone-creator-client.ts");
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
const post = read("app/api/ringtones/route.ts");
const patch = read("app/api/ringtones/[id]/route.ts");
const jobs = read("lib/ringtone-jobs.ts");

record(
    "play-url route issues songs bucket signed URL",
    playUrlRoute.includes("createSignedUrl")
        && playUrlRoute.includes("SONGS_BUCKET")
        && playUrlRoute.includes("requireMatchingUserId"),
);
record(
    "client fetchOwnedSongStudioPlayUrl targets play-url API",
    client.includes("fetchOwnedSongStudioPlayUrl")
        && client.includes("/api/ringtones/source-songs/play-url"),
);
record(
    "workspace resolveStudioSourceAudioUrl avoids /api/audio for owned songs",
    workspace.includes("resolveStudioSourceAudioUrl")
        && workspace.includes("fetchOwnedSongStudioPlayUrl")
        && workspace.includes('!fallback.startsWith("/api/audio")'),
);
record(
    "draft POST clamps unauthorized resale price to zero",
    post.includes("draftPriceCents = 0")
        && post.includes('mode === "submit"'),
);
record(
    "PATCH draft/rejected clamps unauthorized resale price",
    patch.includes("nextPriceCents = 0")
        && patch.includes('currentStatus === "draft"'),
);
record(
    "submit processing enforces ringtone sale permission when price > 0",
    jobs.includes("assertSourceSongAllowsRingtoneSale")
        && jobs.includes("RINGTONE_SALE_NOT_AUTHORIZED"),
);
record(
    "mapRingtoneSaveError handles RINGTONE_SALE_NOT_AUTHORIZED",
    client.includes("RINGTONE_SALE_NOT_AUTHORIZED"),
);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);