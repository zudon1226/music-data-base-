import assert from "node:assert/strict";

const PREFIX = "mdb_signup_account_type=";
const VALID_TYPES = new Set(["listener", "artist", "producer", "artist_producer", "podcaster"]);

function normalizeSignupAccountType(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    return VALID_TYPES.has(normalized) ? normalized : null;
}

function encodeSignupAccountTypeMarker(accountType) {
    return `${PREFIX}${accountType}`;
}

function decodeSignupAccountTypeMarker(value) {
    const text = String(value || "").trim();
    if (!text.startsWith(PREFIX)) return null;
    return normalizeSignupAccountType(text.slice(PREFIX.length));
}

function hasSignupAccountTypeMarkerPrefix(value) {
    return String(value || "").trim().startsWith(PREFIX);
}

function isValidSignupAccountTypeMarker(value) {
    const text = String(value || "").trim();
    const decoded = decodeSignupAccountTypeMarker(text);
    return decoded !== null && text === encodeSignupAccountTypeMarker(decoded);
}

for (const type of VALID_TYPES) {
    const marker = encodeSignupAccountTypeMarker(type);
    assert.equal(isValidSignupAccountTypeMarker(marker), true, type);
    assert.equal(hasSignupAccountTypeMarkerPrefix(marker), true, type);
}

assert.equal(isValidSignupAccountTypeMarker("mdb_signup_account_type=artist"), true);
assert.equal(isValidSignupAccountTypeMarker("mdb_signup_account_type=ARTIST"), false);
assert.equal(isValidSignupAccountTypeMarker("mdb_signup_account_type=evil"), false);
assert.equal(isValidSignupAccountTypeMarker("mdb_signup_account_type=artist_extra"), false);
assert.equal(isValidSignupAccountTypeMarker("https://example.com"), false);

assert.equal(hasSignupAccountTypeMarkerPrefix("mdb_signup_account_type=evil"), true);
assert.equal(hasSignupAccountTypeMarkerPrefix("mdb_signup_account_type="), true);
assert.equal(hasSignupAccountTypeMarkerPrefix("mdb_signup_account_type=artist\nhttps://x.com"), true);

console.log("signup-account-type-marker.test.mjs passed");
