/**
 * JWS module must use Apple SignedDataVerifier (no decode-only trust).
 * Run: node lib/apple/app-store-jws.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "lib/apple/app-store-jws.ts"), "utf8");
assert.match(source, /verifyAndDecodeTransaction/);
assert.match(source, /SignedDataVerifier/);
assert.doesNotMatch(source, /JSON\.parse\(atob/);

console.log("app-store-jws.test.mjs passed.");
