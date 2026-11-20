/**
 * Mixtape play qualification rules.
 * Run: node lib/mixtape-play-threshold.test.mjs
 */
import assert from "node:assert/strict";
import {
    isQualifiedMixtapePlay,
    mixtapePlayQualificationThreshold,
} from "./mixtape-play-threshold.shared.mjs";

assert.equal(mixtapePlayQualificationThreshold(120), 30);
assert.equal(mixtapePlayQualificationThreshold(10), 2.5);
assert.equal(mixtapePlayQualificationThreshold(2), 0.5);
assert.equal(mixtapePlayQualificationThreshold(0), 30);

assert.ok(isQualifiedMixtapePlay(120, 30));
assert.ok(!isQualifiedMixtapePlay(120, 29.9));
assert.ok(isQualifiedMixtapePlay(10, 2.5));
assert.ok(!isQualifiedMixtapePlay(10, 2.4));
assert.ok(isQualifiedMixtapePlay(2, 0.5));
assert.ok(!isQualifiedMixtapePlay(2, 0.49));

console.log("mixtape-play-threshold.test.mjs: ok");