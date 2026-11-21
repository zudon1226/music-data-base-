import assert from "node:assert/strict";
import { planMixtapeTrackPositionSwap } from "./mixtape-track-position.mjs";

assert.deepEqual(
    planMixtapeTrackPositionSwap({ oldPosition: 1, newPosition: 1, occupantTrackId: "" }),
    { ok: true, kind: "noop" },
);

assert.deepEqual(
    planMixtapeTrackPositionSwap({ oldPosition: 1, newPosition: 3, occupantTrackId: "" }),
    { ok: true, kind: "move", newPosition: 3 },
);

const swap = planMixtapeTrackPositionSwap({
    oldPosition: 1,
    newPosition: 2,
    occupantTrackId: "other-track-id",
});
assert.equal(swap.ok, true);
assert.equal(swap.kind, "swap");
assert.equal(swap.occupantNewPosition, 1);
assert.equal(swap.newPosition, 2);
assert.equal(swap.tempPosition, 3);

assert.equal(
    planMixtapeTrackPositionSwap({ oldPosition: 2, newPosition: 0, occupantTrackId: "" }).ok,
    false,
);

console.log("mixtape-track-position.test.mjs passed");