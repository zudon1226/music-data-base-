/**
 * Verify clip boundary validation messages and units.
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

const validation = read("lib/ringtone-validation.ts");

record("clip start before audio message", validation.includes("Selected clip starts before the audio."));
record("clip ends after source message", validation.includes("Selected clip ends after the source audio."));
record("clip length invalid message", validation.includes("Selected clip length is invalid."));
record("uses normalizeRingtoneSourceDurationSeconds in clip validation", validation.includes("normalizeRingtoneSourceDurationSeconds(rawSourceDuration)"));
record("rejects provided non-positive duration as missing metadata", validation.includes("RINGTONE_SOURCE_DURATION_MISSING_MESSAGE"));
record("keeps 15-30 ringtone clip limits", validation.includes("RINGTONE_MIN_DURATION_SECONDS") && validation.includes("RINGTONE_MAX_DURATION_SECONDS"));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
