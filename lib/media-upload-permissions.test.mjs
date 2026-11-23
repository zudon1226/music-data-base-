import assert from "node:assert/strict";
import {
    accountTypeAllowsMusicUpload,
    accountTypeAllowsVideoUpload,
    isVideoOnlyCreatorAccountType,
    MUSIC_UPLOAD_DENIED_MESSAGE,
    roleTokenAllowsMusicUpload,
    roleTokenAllowsVideoUpload,
} from "./media-upload-permissions.shared.mjs";

assert.equal(accountTypeAllowsMusicUpload("artist"), true);
assert.equal(accountTypeAllowsMusicUpload("producer"), true);
assert.equal(accountTypeAllowsMusicUpload("creator"), false);
assert.equal(accountTypeAllowsMusicUpload("founding_creator"), false);
assert.equal(accountTypeAllowsMusicUpload("listener"), false);

assert.equal(accountTypeAllowsVideoUpload("creator"), true);
assert.equal(accountTypeAllowsVideoUpload("founding_creator"), true);
assert.equal(accountTypeAllowsVideoUpload("artist"), true);
assert.equal(accountTypeAllowsVideoUpload("listener"), false);

assert.equal(isVideoOnlyCreatorAccountType("creator"), true);
assert.equal(isVideoOnlyCreatorAccountType("artist"), false);

assert.equal(roleTokenAllowsMusicUpload("creator"), false);
assert.equal(roleTokenAllowsVideoUpload("creator"), true);
assert.equal(roleTokenAllowsMusicUpload("founding_artist"), true);

assert.match(MUSIC_UPLOAD_DENIED_MESSAGE, /Video Creators/);

console.log("media-upload-permissions.test.mjs passed");