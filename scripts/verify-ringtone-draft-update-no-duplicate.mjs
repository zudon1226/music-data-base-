/**
 * Verify editing a draft PATCHes the same id instead of POSTing a duplicate.
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

const client = read("lib/ringtone-creator-client.ts");
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
const patch = read("app/api/ringtones/[id]/route.ts");

record(
    "saveRingtoneDraft PATCHes when ringtoneId present",
    client.includes("if (input.ringtoneId)")
        && client.includes("`/api/ringtones/${input.ringtoneId}`")
        && client.includes('method: "PATCH"'),
);
record(
    "saveRingtoneDraft POSTs only without ringtoneId",
    client.includes('ringtoneAuthFetch("/api/ringtones"')
        && client.includes('method: "POST"'),
);
record(
    "workspace passes editingId into saveRingtoneDraft",
    workspace.includes("ringtoneId: editingId || undefined")
        && workspace.includes("setEditingId(ringtone.id)"),
);
record(
    "submit lock prevents rapid double create",
    workspace.includes("submitLockRef")
        && workspace.includes("if (submitLockRef.current || saving) return"),
);
record(
    "PATCH allows draft title placeholder",
    patch.includes('updates.title = title || "Untitled draft"'),
);
record(
    "PATCH softens invalid draft clip instead of rejecting",
    patch.includes('currentStatus === "draft" || currentStatus === "rejected"')
        && patch.includes("Draft updates keep a schema-safe"),
);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
