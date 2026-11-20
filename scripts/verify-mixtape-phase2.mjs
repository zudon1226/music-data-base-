/**
 * Mixtape Phase 2 static contract: APIs, libs, components, auth, and playback RPC wiring.
 * Usage: node scripts/verify-mixtape-phase2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function expect(relativePath, pattern, label) {
    const source = read(relativePath);
    if (!pattern.test(source)) failures.push(`${label} (${relativePath})`);
}

function expectFile(relativePath, label) {
    if (!fs.existsSync(path.join(root, relativePath))) failures.push(`${label} (${relativePath})`);
}

function forbid(relativePath, pattern, label) {
    const source = read(relativePath);
    if (pattern.test(source)) failures.push(`${label} (${relativePath})`);
}

const requiredFiles = [
    "lib/mixtape-types.ts",
    "lib/mixtape-validation.ts",
    "lib/mixtape-data.ts",
    "lib/mixtape-access.ts",
    "lib/mixtape-route-auth.ts",
    "lib/mixtape-discovery.ts",
    "lib/mixtape-analytics.ts",
    "lib/mixtape-routes.ts",
    "lib/mixtape-api.test.mjs",
    "lib/mixtape-validation.test.mjs",
    "app/api/mixtapes/route.ts",
    "app/api/mixtapes/[id]/route.ts",
    "app/api/mixtapes/tracks/route.ts",
    "app/api/mixtapes/tracks/[id]/route.ts",
    "app/api/mixtapes/uploads/route.ts",
    "app/api/mixtapes/playback/route.ts",
    "app/api/mixtapes/favorites/route.ts",
    "app/api/mixtapes/analytics/route.ts",
    "app/api/mixtapes/reports/route.ts",
    "components/mixtapes/MixtapeDiscoveryWorkspace.tsx",
    "components/mixtapes/MixtapeShowWorkspace.tsx",
    "components/mixtapes/MixtapeStudioWorkspace.tsx",
    "components/mixtapes/MixtapeListeningControls.tsx",
    "components/mixtapes/MixtapeStudioAnalyticsPanel.tsx",
    "components/mixtapes/mixtapes.module.css",
    "lib/mixtape-phase2-ui.test.mjs",
    "scripts/verify-mixtape-phase2.mjs",
];

requiredFiles.forEach((file) => expectFile(file, `Missing Mixtape Phase 2 file`));

expect("lib/mixtape-route-auth.ts", /requireMatchingUserId/, "Session user token match required");
expect("lib/mixtape-access.ts", /can_create_mixtapes/, "Creator gate must call can_create_mixtapes RPC");
expect("lib/mixtape-validation.ts", /MIXTAPE_BUCKET = "mixtapes"/, "Mixtape bucket constant missing");
expect("lib/mixtape-validation.ts", /104857600|MIXTAPE_AUDIO_MAX_BYTES/, "Bucket size limit missing");
expect("lib/mixtape-validation.ts", /parts\[2\] !== "tracks"|\/tracks\//, "Track path layout missing");
expect("lib/mixtape-validation.ts", /validateMixtapeTrackPublishRules/, "Publish duration rules missing");

expect("app/api/mixtapes/route.ts", /scopeParam === "mine"[\s\S]*featured/, "GET scopes public/mine/featured missing");
expect("app/api/mixtapes/route.ts", /requireMixtapeRequestCreator/, "POST create must require creator auth");
expect("app/api/mixtapes/[id]/route.ts", /status: "archived"/, "DELETE must archive");
expect("app/api/mixtapes/tracks/[id]/route.ts", /position/, "Track reorder via position missing");
expect("app/api/mixtapes/uploads/route.ts", /prepare-audio/, "Signed audio upload action missing");
expect("app/api/mixtapes/uploads/route.ts", /prepare-cover/, "Signed cover upload action missing");
expect("app/api/mixtapes/playback/route.ts", /begin_mixtape_playback_session/, "Begin session RPC missing");
expect("app/api/mixtapes/playback/route.ts", /advance_mixtape_playback_session/, "Advance session RPC missing");
expect("app/api/mixtapes/playback/route.ts", /record_mixtape_qualified_play/, "Qualified play RPC missing");
expect("app/api/mixtapes/playback/route.ts", /validateMixtapeOwnedTrackStoragePath/, "Playback storage validation missing");

expect("components/mixtapes/MixtapeDiscoveryWorkspace.tsx", /from "@\/lib\/mixtape-discovery"/, "Discovery helper wiring missing");
expect("components/mixtapes/MixtapeDiscoveryWorkspace.tsx", /\/api\/mixtapes/, "Discovery catalog fetch missing");
expect("components/mixtapes/MixtapeStudioWorkspace.tsx", /\/api\/mixtapes\/uploads/, "Studio upload route missing");
expect("components/mixtapes/MixtapeListeningControls.tsx", /podcast-playback-controls/, "Global audio control pattern missing");

expect("lib/desktop-app-navigation.ts", /\{ view: "Mixtapes" \}/, "Mixtapes nav item missing");
expect("lib/desktop-app-navigation.ts", /\{ view: "Mixtape Studio", requiresMixtapeStudio: true \}/, "Mixtape Studio nav item missing");
expect("lib/role-based-navigation.ts", /"Mixtapes"/, "Listener Mixtapes destination missing");
expect("lib/role-based-navigation.ts", /Mixtape Studio/, "Mixtape Studio access gate missing");

expect("app/page.tsx", /MixtapeDiscoveryWorkspace/, "Mixtapes discovery shell wiring missing");
expect("app/page.tsx", /MixtapeShowWorkspace/, "Mixtape detail shell wiring missing");
expect("app/page.tsx", /onPlayMixtape/, "Mixtape playback handler missing in shell");
expect("app/page.tsx", /\/api\/mixtapes\/playback/, "Mixtape signed URL playback route missing in shell");
expect("app/page.tsx", /MixtapeListeningControls/, "Mixtape listening chrome wiring missing");
expect("components/mixtapes/MixtapeStudioAnalyticsPanel.tsx", /\/api\/mixtapes\/analytics/, "Studio analytics panel missing");
expect("app/mixtapes/page.tsx", /initialPublicMixtapeDiscovery/, "Mixtapes deep link page missing");
expect("lib/mixtape-playback-client.ts", /mixtapeTrackToPlaybackSong/, "Global audio engine adapter missing");

forbid("app/api/mixtapes/route.ts", /stripe/i, "Stripe must stay disabled for mixtapes");
for (const uiFile of fs.readdirSync(path.join(root, "components/mixtapes"))) {
    if (!/\.(tsx|ts|css)$/.test(uiFile)) continue;
    forbid(`components/mixtapes/${uiFile}`, /stripe/i, "Stripe must stay disabled in mixtape UI");
}

if (failures.length > 0) {
    console.error("Mixtape Phase 2 verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Mixtape Phase 2 static verification passed.");