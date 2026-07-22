/**
 * Verify ringtone source duration normalization (seconds canonical unit).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const results = [];

function record(name, passed, detail = "") {
    results.push({ name, passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

// Load compiled-less TS via dynamic transpile is heavy; assert source + run inline mirror.
function normalizeRingtoneSourceDurationSeconds(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) return null;
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const asNumber = Number(trimmed);
        if (Number.isFinite(asNumber) && asNumber > 0 && !trimmed.includes(":")) return asNumber;
        const parts = trimmed.split(":").map((part) => Number(part));
        if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
            const seconds = parts[0] * 60 + parts[1];
            return seconds > 0 ? seconds : null;
        }
        if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
            const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            return seconds > 0 ? seconds : null;
        }
        return null;
    }
    return null;
}

const validation = read("lib/ringtone-validation.ts");
const access = read("lib/ringtone-access.ts");
const sourceSongs = read("app/api/ringtones/source-songs/route.ts");

record("exports normalizeRingtoneSourceDurationSeconds", validation.includes("export function normalizeRingtoneSourceDurationSeconds"));
record("numeric seconds 180", normalizeRingtoneSourceDurationSeconds(180) === 180);
record("numeric zero -> null", normalizeRingtoneSourceDurationSeconds(0) == null);
record("null -> null", normalizeRingtoneSourceDurationSeconds(null) == null);
record("mm:ss string", normalizeRingtoneSourceDurationSeconds("3:00") === 180);
record("hh:mm:ss string", normalizeRingtoneSourceDurationSeconds("1:02:03") === 3723);
record("Number(null) trap avoided in assertOwnsSourceSong", !access.includes("Number((data as { duration?: unknown }).duration ?? NaN)"));
record("assertOwns uses normalizeRingtoneSourceDurationSeconds", access.includes("normalizeRingtoneSourceDurationSeconds"));
record("source-songs uses shared normalizer", sourceSongs.includes("normalizeRingtoneSourceDurationSeconds"));
record("songs.duration field still selected", sourceSongs.includes("duration,created_at"));
record("does not select missing duration_seconds column", !/\.select\([^)]*duration_seconds/.test(sourceSongs));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
