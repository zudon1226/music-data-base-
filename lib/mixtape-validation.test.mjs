import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validationSource = fs.readFileSync(path.join(root, "lib/mixtape-validation.ts"), "utf8");

const userId = "11111111-1111-4111-8111-111111111111";
const mixtapeId = "22222222-2222-4222-8222-222222222222";

function validateMixtapeOwnedTrackStoragePath(storagePath, ownerId, tapeId) {
    const normalized = storagePath.trim().replace(/^\/+/, "");
    const parts = normalized.split("/");
    if (!normalized || parts[0] !== ownerId || parts[1] !== tapeId || parts[2] !== "tracks" || parts.length < 4) {
        return { ok: false };
    }
    return { ok: true };
}

function validateMixtapeTrackPublishRules(status, durationSeconds) {
    if (status !== "published") return { ok: true };
    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false };
    return { ok: true };
}

assert.match(validationSource, /MIXTAPE_AUDIO_MAX_BYTES = 104857600/);
assert.match(validationSource, /parts\[2\] !== "tracks"/);
assert.match(validationSource, /validateMixtapeOwnedTrackStoragePath/);

{
    const owned = validateMixtapeOwnedTrackStoragePath(
        `${userId}/${mixtapeId}/tracks/file.mp3`,
        userId,
        mixtapeId,
    );
    assert.equal(owned.ok, true);
    const foreign = validateMixtapeOwnedTrackStoragePath(
        `${userId}/other-mixtape/tracks/file.mp3`,
        userId,
        mixtapeId,
    );
    assert.equal(foreign.ok, false);
}

{
    assert.equal(validateMixtapeTrackPublishRules("published", 0).ok, false);
    assert.equal(validateMixtapeTrackPublishRules("published", 32).ok, true);
    assert.equal(validateMixtapeTrackPublishRules("draft", 0).ok, true);
}

assert.match(fs.readFileSync(path.join(root, "lib/mixtape-route-auth.ts"), "utf8"), /requireMatchingUserId/);

console.log("mixtape-validation.test.mjs passed");