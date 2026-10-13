import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = readFileSync(path.join(root, "lib/signup-account-type.ts"), "utf8");
const activation = readFileSync(path.join(root, "lib/signup-account-activation.ts"), "utf8");
const inviteService = readFileSync(path.join(root, "lib/founding-invite-service.ts"), "utf8");
const metadata = readFileSync(path.join(root, "lib/auth-user-metadata.ts"), "utf8");

assert.match(helper, /resolveSignupAccountTypeGrants/);
assert.match(inviteService, /founding: false/);
assert.match(inviteService, /applySignupAccountTypeGrants/);
assert.match(activation, /LEGACY_FOUNDING_ACCOUNT_TYPES/);
assert.match(activation, /pendingInviteCode/);
assert.match(metadata, /pendingInviteCode/);
assert.match(activation, /hasCompletedSignupLegalForAccountType/);
assert.match(activation, /isCreatorSelfSignupEnabled/);
assert.match(activation, /needs_email_confirmation/);
assert.match(activation, /resolveTrustedSignupAccountType/);
assert.match(readFileSync(path.join(root, "lib/legal-acceptance-service.ts"), "utf8"), /lockSignupAccountTypeAtRegistration/);

function grants(accountType, founding) {
    const foundingFlag = founding !== false;
    if (accountType === "artist") {
        return foundingFlag ? "founding_artist" : "artist";
    }
    if (accountType === "producer") {
        return foundingFlag ? "founding_producer" : "producer";
    }
    return "listener";
}

assert.equal(grants("artist", false), "artist");
assert.equal(grants("producer", false), "producer");
assert.equal(grants("artist", true), "founding_artist");

console.log("signup-account-activation.test.mjs passed");
