/**
 * Support admin account role filter resolution.
 * Run: node lib/support-account-role-filter.test.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "support-tickets.ts")).href;
const { resolveSupportAccountTypeFilter } = await import(moduleUrl);

assert.equal(resolveSupportAccountTypeFilter(""), null);
assert.equal(resolveSupportAccountTypeFilter("all"), null);
assert.equal(resolveSupportAccountTypeFilter("Listener"), "Listener");
assert.equal(resolveSupportAccountTypeFilter("artist"), "Artist");
assert.equal(resolveSupportAccountTypeFilter("PRODUCER"), "Producer");
assert.equal(resolveSupportAccountTypeFilter("Owner"), null);

console.log("PASS support-account-role-filter.test.mjs");
