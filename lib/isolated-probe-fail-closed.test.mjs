import assert from "node:assert/strict";
import { evaluateFailClosedProbe, responseLooksLikeMedia } from "./isolated-probe-fail-closed.mjs";

assert.equal(responseLooksLikeMedia("audio/mpeg"), true);
assert.equal(responseLooksLikeMedia("application/json"), false);

assert.equal(
    evaluateFailClosedProbe(
        { status: 503, isMediaBody: false, jsonCode: "MODERATION_UNAVAILABLE" },
        { requireJsonCode: "MODERATION_UNAVAILABLE" },
    ).pass,
    true,
);
assert.equal(
    evaluateFailClosedProbe({ status: 200, isMediaBody: true, jsonCode: "" }).pass,
    false,
);

console.log("isolated-probe-fail-closed tests passed.");
