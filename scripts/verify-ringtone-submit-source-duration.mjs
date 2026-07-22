/**
 * Verify submit-for-review uses trusted owned-song duration from the catalog.
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
const jobs = read("lib/ringtone-jobs.ts");
const validation = read("lib/ringtone-validation.ts");
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");

record("POST normalizes body duration then prefers ownership duration", post.includes("normalizeRingtoneSourceDurationSeconds(body.sourceDurationSeconds)") && post.includes("ownership.sourceDurationSeconds"));
record("PATCH resolves trusted owned-song duration for clip checks", patch.includes("trustedSourceDuration") && patch.includes("assertOwnsSourceSong"));
record("enqueue resolves assertOwnsSourceSong duration before submit validation", jobs.includes("assertOwnsSourceSong(String(row.creator_id)") && jobs.includes("trustedSourceDuration"));
record("owned-song submit requires source duration metadata", validation.includes("sourceKind === \"owned_song\" && sourceDurationSeconds == null") && validation.includes("RINGTONE_SOURCE_DURATION_MISSING_MESSAGE"));
record("missing metadata message is precise", validation.includes("This source is missing audio duration metadata. Reprocess or choose another source."));
record("legacy vague invalid-duration message removed", !validation.includes("Source song duration is invalid."));
record("client probes audio duration before submit when missing", workspace.includes("probeAudioDurationSeconds") && workspace.includes("resolvedSourceDuration"));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
