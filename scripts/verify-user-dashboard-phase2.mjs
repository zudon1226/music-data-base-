/**
 * User Dashboard Phase 2 static verifier.
 * Usage: node scripts/verify-user-dashboard-phase2.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function mustExist(rel) {
    record(`file exists ${rel}`, existsSync(path.join(root, rel)));
}

function includesAll(rel, needles, label) {
    const text = read(rel);
    const missing = needles.filter((needle) => !text.includes(needle));
    record(label, missing.length === 0, missing.length ? missing.slice(0, 4).join(" | ") : "ok");
}

mustExist("supabase/migrations/202607170003_user_dashboard_phase2.sql");
mustExist("app/api/follows/route.ts");
mustExist("app/api/activity-feed/route.ts");
mustExist("app/api/creator-insights/route.ts");
mustExist("app/api/public-profile/route.ts");
mustExist("components/dashboard/activity-feed-panel.tsx");
mustExist("components/dashboard/creator-insights-panel.tsx");
mustExist("components/dashboard/follow-button.tsx");
mustExist("components/dashboard/public-profile-follow-client.tsx");
mustExist("lib/dashboard/activity-kinds.ts");
mustExist("lib/dashboard/record-activity.ts");
mustExist("lib/dashboard/public-profile-extras.ts");

includesAll("supabase/migrations/202607170003_user_dashboard_phase2.sql", [
    "user_follows",
    "user_activity_events",
    "is_public",
    "platform_admin_full_access",
    "enable row level security",
], "phase2 migration coverage");

includesAll("app/api/follows/route.ts", [
    "requireMatchingUserId",
    "isMutual",
    "followerCount",
    "follow !== false",
], "follows API");

includesAll("app/api/activity-feed/route.ts", [
    "user_activity_events",
    "scope",
    "requireMatchingUserId",
], "activity feed API");

includesAll("app/api/creator-insights/route.ts", [
    "widgets",
    "topSongs",
    "weeklyPlays",
    "monthlyPlays",
    "requireMatchingUserId",
], "creator insights API");

includesAll("app/page.tsx", [
    "CreatorInsightsPanel",
    "ActivityFeedPanel",
    "FollowButton",
    "dashboard.follow.follow",
], "page wiring");

includesAll("components/PublicProfileView.tsx", [
    "PublicProfileFollowClient",
    "Public Playlists",
    "publicPlaylists",
], "public profile view");

includesAll("lib/i18n/messages/en.ts", [
    "follow: {",
    "activity: {",
    "widgets: {",
    "insights: {",
], "english phase2 keys");

const secretPattern = /(sk_live_|sk_test_|SUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"]eyJ)/i;
for (const file of [
    "app/api/follows/route.ts",
    "app/api/activity-feed/route.ts",
    "app/api/creator-insights/route.ts",
    "app/api/public-profile/route.ts",
    "components/dashboard/follow-button.tsx",
]) {
    record(`secret scan ${file}`, !secretPattern.test(read(file)));
}

const failed = results.filter((item) => !item.ok);
console.log(`\nUser Dashboard Phase 2: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    for (const item of failed) console.error(` - ${item.name}: ${item.detail}`);
    process.exit(1);
}
