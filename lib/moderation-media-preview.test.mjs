/**
 * Run: npx.cmd --yes tsx lib/moderation-media-preview.test.mjs
 */
import assert from "node:assert/strict";
import { evaluateModerationMediaPreviewAccess } from "./moderation-media-preview.ts";

const ownerId = "22222222-2222-4222-8222-222222222222";
const heldSong = { user_id: ownerId, moderation_state: "takedown_pending" };
const removedSong = { user_id: ownerId, moderation_state: "removed" };
const clearSong = { user_id: ownerId, moderation_state: "clear" };

assert.equal(evaluateModerationMediaPreviewAccess(clearSong, { userId: ownerId, isAdmin: false }).ok, false);
assert.equal(evaluateModerationMediaPreviewAccess(heldSong, { userId: "", isAdmin: false }).code, "AUTH_REQUIRED");
assert.equal(evaluateModerationMediaPreviewAccess(heldSong, { userId: ownerId, isAdmin: false }).ok, true);
assert.equal(evaluateModerationMediaPreviewAccess(heldSong, { userId: "other", isAdmin: false }).code, "FORBIDDEN");
assert.equal(evaluateModerationMediaPreviewAccess(heldSong, { userId: "other", isAdmin: true }).ok, true);
assert.equal(evaluateModerationMediaPreviewAccess(removedSong, { userId: ownerId, isAdmin: false }).code, "FORBIDDEN");
assert.equal(evaluateModerationMediaPreviewAccess(removedSong, { userId: ownerId, isAdmin: true }).ok, true);

console.log("moderation-media-preview tests passed.");
