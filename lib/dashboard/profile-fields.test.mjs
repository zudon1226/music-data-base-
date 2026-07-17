/**
 * Unit tests for profile field validation rules.
 * Run: node lib/dashboard/profile-fields.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(path.join(root, "lib/dashboard/profile-fields.ts"), "utf8");

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/i;
const WEBSITE_RE = /^https?:\/\/[^\s<>"'`]+$/i;

function sanitizePlainText(value, maxLen) {
    return String(value ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
}

function isValidUsername(value) {
    if (!value) return true;
    return USERNAME_RE.test(value) && value.length >= 3;
}

function isValidWebsite(value) {
    if (!value) return true;
    if (!WEBSITE_RE.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}

assert.match(source, /USERNAME_RE/);
assert.match(source, /isValidWebsite/);
assert.match(source, /displayName: 80/);
assert.match(source, /biography: 500/);

assert.equal(isValidUsername("ab"), false);
assert.equal(isValidUsername("abc_user"), true);
assert.equal(isValidUsername("bad user"), false);
assert.equal(isValidWebsite("https://example.com"), true);
assert.equal(isValidWebsite("javascript:alert(1)"), false);
assert.equal(sanitizePlainText("  Hi\nthere  ", 80), "Hi there");
assert.equal(isValidWebsite("ftp://x.com"), false);

console.log("PASS profile-fields unit tests");
