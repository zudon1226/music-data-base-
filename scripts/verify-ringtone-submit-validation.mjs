/**
 * Verify Submit for Review enforces source, clip, details before processing.
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
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
const jobs = read("lib/ringtone-jobs.ts");
const processRoute = read("app/api/ringtones/[id]/process/route.ts");

record(
    "validateRingtoneSubmitRequirements blocks missing source",
    validation.includes("Choose source audio before submitting for review.")
        && validation.includes("step: 1"),
);
record(
    "validateRingtoneSubmitRequirements blocks placeholder title",
    validation.includes("RINGTONE_DRAFT_DEFAULT_TITLE")
        && validation.includes("Add a title before submitting for review."),
);
record(
    "validateRingtoneSubmitRequirements uses clip step 2",
    validation.includes("if (!clip.ok) return { ok: false, error: clip.error, step: 2 }"),
);
record(
    "workspace validates submit before network save",
    workspace.includes("validateRingtoneSubmitRequirements")
        && workspace.includes("setStep(requirements.step)")
        && workspace.includes("setError(requirements.error)"),
);
record(
    "workspace does not send submit request when validation fails",
    workspace.includes("if (!requirements.ok)")
        && workspace.includes("setSaving(false)")
        && workspace.includes("return;"),
);
record(
    "enqueue re-checks submit requirements server-side",
    jobs.includes("validateRingtoneSubmitRequirements")
        && jobs.includes('code: "VALIDATION_FAILED"'),
);
record(
    "owned song source resolves from songs bucket at process time",
    jobs.includes("SONGS_BUCKET")
        && jobs.includes("source_song_id"),
);
record(
    "submit still goes through /process route",
    processRoute.includes("queueAndRunRingtoneProcessing")
        && workspace.includes("submitRingtoneForReview"),
);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
