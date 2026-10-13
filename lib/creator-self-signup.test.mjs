import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "lib/creator-self-signup.ts"), "utf8");

assert.match(source, /NEXT_PUBLIC_CREATOR_SELF_SIGNUP_ENABLED/);
assert.match(source, /isFoundingCohortMemberRecord/);
assert.match(source, /invite_id/);
assert.match(source, /Producer — Beta Access/);

function cohort(member) {
    return Boolean(member?.invite_id) && decodeMarker(member) !== "listener";
}

function decodeMarker(member) {
    const text = String(member?.social_link || "").trim();
    if (!text.startsWith("mdb_signup_account_type=")) return null;
    return text.slice("mdb_signup_account_type=".length);
}

assert.equal(cohort({ invite_id: "x", social_link: "mdb_signup_account_type=artist" }), true);
assert.equal(cohort({ invite_id: null, social_link: "mdb_signup_account_type=artist" }), false);
assert.equal(cohort({ invite_id: null, social_link: "mdb_signup_account_type=listener" }), false);

console.log("creator-self-signup.test.mjs passed");
