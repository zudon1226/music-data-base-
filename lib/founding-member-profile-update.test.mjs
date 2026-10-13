import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "lib/founding-member-profile-update.ts"), "utf8");

assert.match(source, /buildFoundingMemberProfilePatchPayload/);
assert.match(source, /markerLocked/);
assert.match(source, /hasSignupAccountTypeMarkerPrefix\(nextSocialLink\)/);

const PREFIX = "mdb_signup_account_type=";

function hasSignupAccountTypeMarkerPrefix(value) {
    return String(value || "").trim().startsWith(PREFIX);
}

function buildFoundingMemberProfilePatchPayload(options) {
    const now = options.now || new Date().toISOString();
    const updatePayload = { updated_at: now };
    const existingSocialLink = String(options.existingSocialLink || "").trim();
    const markerLocked = hasSignupAccountTypeMarkerPrefix(existingSocialLink);

    if (typeof options.displayName === "string") {
        updatePayload.display_name = options.displayName.trim();
    }
    if (typeof options.profileImageUrl === "string") {
        updatePayload.profile_image_url = options.profileImageUrl.trim();
    }

    if (typeof options.socialLink === "string") {
        const nextSocialLink = options.socialLink.trim();
        if (hasSignupAccountTypeMarkerPrefix(nextSocialLink)) {
            return { ok: false, status: 400 };
        }
        if (markerLocked) {
            return { ok: false, status: 400 };
        }
        updatePayload.social_link = nextSocialLink;
    }

    return { ok: true, updatePayload, markerLocked };
}

const marker = `${PREFIX}artist`;

const normal = buildFoundingMemberProfilePatchPayload({
    existingSocialLink: null,
    socialLink: "https://instagram.com/artist",
    displayName: "Name",
});
assert.equal(normal.ok, true);
assert.equal(normal.updatePayload.social_link, "https://instagram.com/artist");

const locked = buildFoundingMemberProfilePatchPayload({
    existingSocialLink: marker,
    socialLink: "https://instagram.com/artist",
});
assert.equal(locked.ok, false);

const forge = buildFoundingMemberProfilePatchPayload({
    existingSocialLink: "https://safe.example",
    socialLink: `${PREFIX}producer`,
});
assert.equal(forge.ok, false);

const malformed = buildFoundingMemberProfilePatchPayload({
    existingSocialLink: null,
    socialLink: "mdb_signup_account_type=not_a_real_type",
});
assert.equal(malformed.ok, false);

const displayOnly = buildFoundingMemberProfilePatchPayload({
    existingSocialLink: marker,
    displayName: "Updated",
});
assert.equal(displayOnly.ok, true);
assert.equal(displayOnly.updatePayload.social_link, undefined);

console.log("founding-member-profile-update.test.mjs passed");
