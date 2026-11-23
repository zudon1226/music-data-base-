#!/usr/bin/env node
/**
 * Regression: ringtone source upload legal gate + MIME inference + API metadata.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
function record(id, ok, detail = "") {
    results.push({ id, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} [${id}]${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

const route = read("app/api/ringtones/upload-source/route.ts");
const client = read("lib/ringtone-creator-client.ts");
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");

record("upload-source-legal-code", route.includes("CREATOR_UPLOAD_AGREEMENT_REQUIRED"));
record("client-legal-helpers", client.includes("recordCreatorUploadLegalAcceptance")
    && client.includes("mapRingtoneUploadSourceError"));
record("workspace-legal-panel", workspace.includes("CreatorUploadAgreementPanel"));
record("mime-inference", read("lib/ringtone-source-mime.ts").includes("inferRingtoneSourceMimeType"));

const fails = results.filter((r) => !r.ok).length;
process.exit(fails ? 1 : 0);