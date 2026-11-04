import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "lib/apple/apple-environment-validation.ts"), "utf8");
assert.match(source, /assertVerifiedAppleEnvironmentAllowed/);
assert.match(source, /isProductionAppleIapRuntime/);
assert.match(source, /INVALID_ENVIRONMENT/);

console.log("apple-environment-validation.test.mjs passed.");
