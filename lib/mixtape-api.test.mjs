import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const authMarkers = [
    "app/api/mixtapes/route.ts",
    "app/api/mixtapes/[id]/route.ts",
    "app/api/mixtapes/tracks/route.ts",
    "app/api/mixtapes/tracks/[id]/route.ts",
    "app/api/mixtapes/uploads/route.ts",
    "app/api/mixtapes/playback/route.ts",
    "app/api/mixtapes/favorites/route.ts",
    "app/api/mixtapes/analytics/route.ts",
    "app/api/mixtapes/reports/route.ts",
];

for (const file of authMarkers) {
    const source = read(file);
    assert.match(source, /requireMixtapeRequestUser|requireMixtapeRequestCreator/);
    assert.match(source, /getSupabaseServerClient\(\)/);
}

{
    const playback = read("app/api/mixtapes/playback/route.ts");
    assert.match(playback, /begin_mixtape_playback_session/);
    assert.match(playback, /advance_mixtape_playback_session/);
    assert.match(playback, /record_mixtape_qualified_play/);
    assert.match(playback, /caller_user_id: callerUserId/);
    assert.match(playback, /createSignedUrl/);
    assert.doesNotMatch(playback, /stripe/i);
    assert.match(playback, /const auth = await requireMixtapeRequestUser/);
    assert.match(playback, /if \(!auth\.ok\) return jsonResponse/);
    const signedUrlIndex = playback.indexOf("createSignedUrl");
    const authGateIndex = playback.indexOf("if (!auth.ok)");
    assert.ok(signedUrlIndex > authGateIndex, "Signed URL must be issued only after auth gate");
    assert.match(playback, /action === "advance"[\s\S]*advance_mixtape_playback_session/);
    const advanceIndex = playback.indexOf('action === "advance"');
    const trackIdGateIndex = playback.indexOf("Invalid mixtape track id");
    assert.ok(advanceIndex > 0 && advanceIndex < trackIdGateIndex, "advance must not require trackId in request body");
}

{
    const access = read("lib/mixtape-access.ts");
    assert.match(access, /can_create_mixtapes/);
    const routeAuth = read("lib/mixtape-route-auth.ts");
    assert.match(routeAuth, /requireMatchingUserId/);
}

{
    const mainRoute = read("app/api/mixtapes/route.ts");
    assert.match(mainRoute, /scopeParam === "mine" \|\| scopeParam === "featured"/);
    assert.match(mainRoute, /requireMixtapeRequestCreator/);
    assert.match(mainRoute, /decodeMineCatalogCursor/);
    assert.match(mainRoute, /hasMore/);
    assert.match(mainRoute, /nextCursor/);
    assert.match(mainRoute, /order\("updated_at", \{ ascending: false \}\)/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /MINE_CATALOG_MAX_PAGES/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /catalogIncomplete/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /isMineCatalogLoadIncomplete/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /upsertTrackById/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /applyProgressiveMineCatalogPage/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /beginCatalogLoad/);
    assert.match(read("components/mixtapes/MixtapeStudioWorkspace.tsx"), /loadingMoreCatalog/);
    assert.match(read("app/api/mixtapes/tracks/[id]/route.ts"), /applyMixtapeTrackPositionChange/);
}

{
    const analyticsRoute = read("app/api/mixtapes/analytics/route.ts");
    assert.match(analyticsRoute, /mixtape_plays/);
    assert.match(read("lib/mixtape-analytics.ts"), /catalogPlays/);
}

console.log("mixtape-api.test.mjs passed");