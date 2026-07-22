/**
 * Verify save/submit failures preserve real API errors instead of only "Failed".
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
const post = read("app/api/ringtones/route.ts");

record(
    "mapRingtoneSaveError preserves safe server error text",
    client.includes("export function mapRingtoneSaveError")
        && client.includes("return safeError || fallback"),
);
record(
    "mapRingtoneSaveError maps auth / source / validation / rls / network",
    client.includes("Authentication required")
        && client.includes("Source audio is not authorized")
        && client.includes("Missing required submit fields")
        && client.includes("Database rejected the save")
        && client.includes("Network failure"),
);
record(
    "workspace uses mapRingtoneSaveError for save and submit",
    workspace.includes("mapRingtoneSaveError")
        && workspace.includes("saved.body")
        && workspace.includes("submitted.body"),
);
record(
    "workspace logs safe diagnostic code without secrets",
    workspace.includes("[ringtone-creator] save failed diag=")
        && workspace.includes("[ringtone-creator] submit failed diag="),
);
record(
    "draft failure does not force process Failed badge",
    workspace.includes("if (submitForReview) setProcessState(\"failed\")")
        && workspace.includes('else setProcessState("idle")'),
);
record(
    "API returns concrete error + code on validation/db failure",
    post.includes('code: "VALIDATION_FAILED"')
        && post.includes('code: "DB_REJECTED"')
        && post.includes("getErrorMessage(error)"),
);
record(
    "visible status message for Draft saved",
    workspace.includes('className="ringtone-status-message"')
        && workspace.includes('t("ringtones.draftSaved")'),
);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
