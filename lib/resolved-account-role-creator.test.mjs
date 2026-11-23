/**
 * Video-only Creator capability matrix (mirrors lib/resolved-account-role.ts).
 */
import assert from "node:assert/strict";

function normalizeResolvedAccountRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "creator" || normalized === "founding_creator") return "creator";
    if (normalized === "artist" || normalized === "founding_artist" || normalized === "artist_pro") return "artist";
    if (normalized === "producer" || normalized === "founding_producer" || normalized === "producer_pro") return "producer";
    return "listener";
}

function resolveCapabilitiesFromExplicitRoles(input) {
    const roles = new Set();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primaryNormalized = normalizeResolvedAccountRole(input.primaryRole);
    if (primaryNormalized !== "listener") roles.add(primaryNormalized);
    if (input.isAdmin) roles.add("admin");

    const isAdmin = Boolean(input.isAdmin) || roles.has("admin");
    const isVideoCreator = isAdmin
        || primaryNormalized === "creator"
        || roles.has("creator")
        || roles.has("founding_creator");
    const isArtist = isAdmin || roles.has("artist") || roles.has("founding_artist") || roles.has("artist_pro");
    const isProducer = isAdmin || roles.has("producer") || roles.has("founding_producer") || roles.has("producer_pro");
    const isMusicCreator = isArtist || isProducer;
    const isCreator = isMusicCreator || isVideoCreator;

    if (isAdmin) {
        return {
            canUploadMusic: true,
            canUploadVideo: true,
            canUpload: true,
            canCreatorDashboard: true,
            canArtistDashboard: true,
            canProducerDashboard: true,
            canSales: true,
        };
    }

    return {
        canUploadMusic: isMusicCreator,
        canUploadVideo: isMusicCreator || isVideoCreator,
        canUpload: isMusicCreator || isVideoCreator,
        canCreatorDashboard: isVideoCreator,
        canArtistDashboard: isArtist,
        canProducerDashboard: isProducer,
        canSales: isMusicCreator,
        isListenerOnly: !isCreator,
    };
}

const videoCreator = resolveCapabilitiesFromExplicitRoles({ primaryRole: "creator" });
assert.equal(videoCreator.canUploadVideo, true);
assert.equal(videoCreator.canUploadMusic, false);
assert.equal(videoCreator.canUpload, true);
assert.equal(videoCreator.canCreatorDashboard, true);
assert.equal(videoCreator.canArtistDashboard, false);
assert.equal(videoCreator.canProducerDashboard, false);
assert.equal(videoCreator.canSales, false);

const artist = resolveCapabilitiesFromExplicitRoles({ primaryRole: "artist" });
assert.equal(artist.canUploadMusic, true);
assert.equal(artist.canUploadVideo, true);
assert.equal(artist.canCreatorDashboard, false);

const listener = resolveCapabilitiesFromExplicitRoles({ primaryRole: "listener" });
assert.equal(listener.canUpload, false);
assert.equal(listener.canUploadMusic, false);
assert.equal(listener.canUploadVideo, false);

console.log("resolved-account-role-creator.test.mjs passed");