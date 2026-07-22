/**
 * Verify source selection resets source-dependent clip state and clears stale duration.
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

const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");

record("selectOwnedSong resets clipStartSeconds to 0", /selectOwnedSong[\s\S]*clipStartSeconds:\s*0/.test(workspace));
record("selectOwnedSong sets normalized sourceDurationSeconds", workspace.includes("normalizeRingtoneSourceDurationSeconds(song.durationSeconds)"));
record("switchSourceKind clears sourceDurationSeconds", /switchSourceKind[\s\S]*sourceDurationSeconds:\s*0/.test(workspace));
record("switchSourceKind clears sourceSongId", /switchSourceKind[\s\S]*sourceSongId:\s*""/.test(workspace));
record("failed submit preserves form (no createEmptyRingtoneForm in catch)", !/catch \(saveError\)[\s\S]*createEmptyRingtoneForm/.test(workspace));
record("editingId retained across save", workspace.includes("setEditingId(ringtone.id)"));
record("source change probes metadata when catalog duration missing", workspace.includes("probeAudioDurationSeconds(song.audioUrl)"));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
