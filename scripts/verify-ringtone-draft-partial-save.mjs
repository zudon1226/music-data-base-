/**
 * Verify Save Draft allows incomplete ringtone products (no source/clip/details).
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
const route = read("app/api/ringtones/route.ts");
const client = read("lib/ringtone-creator-client.ts");
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");

record(
    "draft mode uses Untitled draft placeholder title",
    validation.includes('RINGTONE_DRAFT_DEFAULT_TITLE = "Untitled draft"')
        && validation.includes('if (mode === "draft") title = RINGTONE_DRAFT_DEFAULT_TITLE'),
);
record(
    "draft mode softens invalid clip to schema-safe default",
    validation.includes("Drafts keep a schema-safe default")
        && validation.includes("mode === \"draft\""),
);
record(
    "POST create defaults to draft mode unless submitForReview",
    route.includes('body.submitForReview === true ? "submit"')
        && route.includes('status: "draft"'),
);
record(
    "POST skips ownership when owned_song has no sourceSongId",
    route.includes('sourceKind || "") === "owned_song" && sourceSongId'),
);
record(
    "client save payload never sets submitForReview true",
    client.includes("submitForReview: false")
        && client.includes("Never request processing from the save endpoint"),
);
record(
    "client draft save tolerates invalid price with zero fallback",
    client.includes("Draft saves tolerate blank/invalid pricing"),
);
record(
    "workspace Save Draft does not set processing state",
    workspace.includes("Draft save must not look like audio processing")
        && workspace.includes('setProcessState("idle")'),
);
record(
    "workspace returns to list after draft save",
    workspace.includes('setStatusMessage(t("ringtones.draftSaved"))')
        && workspace.includes('setMode("list")'),
);
record(
    "workspace disables Save Draft while saving",
    workspace.includes("const [saving, setSaving]")
        && workspace.includes("disabled={actionsBusy}"),
);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
