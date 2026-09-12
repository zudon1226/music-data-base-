/**
 * Legal signup validation and policy registry tests.
 * Run: node lib/legal-policies.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    getSignupRequiredPolicyTypes,
    LEGAL_POLICY_VERSION,
    signupRequiresCreatorUploadAgreement,
    validateSignupAcceptanceInput,
} from "./legal-signup-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = LEGAL_POLICY_VERSION;

assert.deepEqual(getSignupRequiredPolicyTypes("listener"), ["terms", "privacy"]);
assert.deepEqual(getSignupRequiredPolicyTypes("artist"), ["terms", "privacy", "creator_upload"]);
assert.deepEqual(getSignupRequiredPolicyTypes("producer"), ["terms", "privacy", "creator_upload"]);
assert.deepEqual(getSignupRequiredPolicyTypes("artist_producer"), ["terms", "privacy", "creator_upload"]);
assert.equal(signupRequiresCreatorUploadAgreement("listener"), false);
assert.equal(signupRequiresCreatorUploadAgreement("artist"), true);

const listenerOk = validateSignupAcceptanceInput("listener", [
    { policyType: "terms", policyVersion: version },
    { policyType: "privacy", policyVersion: version },
]);
assert.equal(listenerOk.ok, true);

const listenerMissing = validateSignupAcceptanceInput("listener", [
    { policyType: "terms", policyVersion: version },
]);
assert.equal(listenerMissing.ok, false);

const artistMissingCreator = validateSignupAcceptanceInput("artist", [
    { policyType: "terms", policyVersion: version },
    { policyType: "privacy", policyVersion: version },
]);
assert.equal(artistMissingCreator.ok, false);

const artistOk = validateSignupAcceptanceInput("artist", [
    { policyType: "terms", policyVersion: version },
    { policyType: "privacy", policyVersion: version },
    { policyType: "creator_upload", policyVersion: version },
]);
assert.equal(artistOk.ok, true);

const badVersion = validateSignupAcceptanceInput("listener", [
    { policyType: "terms", policyVersion: "old-version" },
    { policyType: "privacy", policyVersion: version },
]);
assert.equal(badVersion.ok, false);

const page = readFileSync(path.join(root, "app/page.tsx"), "utf8");
assert.ok(page.includes("SignupLegalAcceptance"));
assert.ok(page.includes("/api/legal/validate-signup"));
assert.ok(page.includes("/api/legal/acceptances"));
assert.ok(page.includes("PolicyLinksFooter"));

const migration = readFileSync(path.join(root, "supabase/migrations/202609101002_legal_acceptances.sql"), "utf8");
assert.ok(migration.includes("legal_acceptances"));
assert.ok(migration.includes("unique (user_id, policy_type, policy_version)"));
assert.ok(migration.includes("enable row level security"));

const uploadAudio = readFileSync(path.join(root, "app/api/upload-audio/route.ts"), "utf8");
assert.ok(uploadAudio.includes("requireCreatorUploadLegalAgreement"));

console.log("PASS listener signup requires terms + privacy only");
console.log("PASS artist/producer require creator upload agreement");
console.log("PASS signup validation rejects missing acceptance");
console.log("PASS signup validation rejects stale policy version");
console.log("PASS signup UI and acceptance APIs wired");
console.log("PASS legal acceptance migration and upload gate wired");
console.log("\nLegal policy tests passed.");
