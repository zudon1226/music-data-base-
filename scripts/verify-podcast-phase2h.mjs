/**
 * Podcast Phase 2H static contract: show-level follow, isolated from creator user_follows.
 * Usage: node scripts/verify-podcast-phase2h.mjs
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

expectFile("lib/podcast-show-follows.ts", "Phase 2H show-follow helper missing");
expectFile("app/api/podcasts/follows/route.ts", "Phase 2H follows API missing");
expectFile("scripts/verify-podcast-phase2h.mjs", "Phase 2H verify script missing");
expectFile("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", "Phase 2H migration missing");

expect("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", /create table if not exists public\.podcast_show_follows/, "Show follows table missing");
expect("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", /references public\.podcast_shows\(id\) on delete cascade/, "Show follow show FK missing");
expect("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", /references auth\.users\(id\) on delete cascade/, "Show follow user FK missing");
expect("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", /unique \(show_id, user_id\)/, "Show follow uniqueness missing");
expect("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", /revoke insert, update, delete[\s\S]*podcast_show_follows from authenticated/, "Show follows API-only mutation boundary missing");
forbid("supabase/migrations/202608280001_podcast_phase2h_show_follows.sql", /alter table public\.user_follows|drop table public\.user_follows/, "Phase 2H must not alter user_follows");

expect("lib/podcast-show-follows.ts", /export function canFollowPodcastShow/, "Self-follow guard helper missing");
expect("lib/podcast-show-follows.ts", /viewerUserId !== ownerUserId/, "Self-follow helper must compare viewer and owner");
expect("app/api/podcasts/follows/route.ts", /from\("podcast_show_follows"\)/, "Follows API must use show-follow table");
expect("app/api/podcasts/follows/route.ts", /You cannot follow your own podcast/, "API must reject following own show");
expect("app/api/podcasts/follows/route.ts", /status !== "published"/, "API must only allow following published shows");
forbid("app/api/podcasts/follows/route.ts", /user_follows|\/api\/follows/, "Follows API must not use creator follows");

expect("lib/podcast-data.ts", /from\("podcast_show_follows"\)/, "Show follower counts must use show follows");
forbid("lib/podcast-data.ts", /user_follows/, "Show follower counts must not use creator follows");
expect("lib/podcast-discovery.ts", /followingShowIds/, "Following filter must use show ids");
expect("lib/podcast-discovery.ts", /export function missingFollowedPodcastShowIds/, "Followed-show hydrate helper missing");
expect("lib/podcast-notifications.ts", /from\("podcast_show_follows"\)/, "Notifications must resolve show followers");
forbid("lib/podcast-notifications.ts", /user_follows/, "Notifications must not use creator follows");
expect("lib/podcast-notifications.ts", /podcast_episode_published:\$\{episodeId\}/, "2D event_key must remain");
expect("lib/podcast-analytics.ts", /ownedShows\.reduce\(\(total, show\) => total \+ safeCount\(show\.followerCount\)/, "Analytics followers must sum per-show counts");
expect("lib/podcast-delete-lifecycle.ts", /from\("podcast_show_follows"\)/, "Show delete must clean show follows");

expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /\/api\/podcasts\/follows/, "Discovery must load show follows");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /toggleFollowShow/, "Discovery must toggle show follow");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see shows you follow/, "Guest Following copy must be show-based");
expect("components/podcasts/PodcastShowWorkspace.tsx", /\/api\/podcasts\/follows/, "Show page must use show follows");
expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /\/api\/podcasts\/follows/, "Episode page must use show follows");
forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /\/api\/follows/, "Discovery must not call creator follows API");
forbid("components/podcasts/PodcastShowWorkspace.tsx", /\/api\/follows/, "Show page must not call creator follows API");
forbid("components/podcasts/PodcastEpisodeWorkspace.tsx", /\/api\/follows/, "Episode page must not call creator follows API");

expect("app/page.tsx", /from "\.\.\/lib\/podcast-resume"/, "Phase 2F resume helper must remain");
expect("app/page.tsx", /continueListeningProgress=\{podcastContinueListeningProgress\}/, "Phase 2F Continue listening must remain");
expect("app/page.tsx", /skipActivePodcast\(-PODCAST_SKIP_BACK_SECONDS\)/, "Phase 2G skip back must remain");
expect("app/page.tsx", /playAdjacentPodcastEpisode\("next"\)/, "Podcast autoplay must remain");
expect("app/page.tsx", /playAdjacentPodcastEpisode\("previous"\)/, "Previous episode control must remain");
forbid("app/page.tsx", /\/api\/podcasts\/follows|podcast-show-follows/, "Phase 2H must not wire follows through app/page.tsx");

forbid("lib/desktop-media-queue.ts", /podcast/, "Queue must not gain podcast types in Phase 2H");
forbid("app/api/follows/route.ts", /podcast_show_follows/, "Creator follows API must stay untouched by Phase 2H");
forbid("lib/billing/plan-entitlements.ts", /podcast_show_follows/, "Billing must stay untouched by Phase 2H");

const pkg = read("package.json");
if (!pkg.includes("verify:podcasts-2h")) failures.push("package.json missing verify:podcasts-2h");
if (!pkg.includes("verify-podcast-phase2h.mjs")) failures.push("package.json verify:podcasts must include Phase 2H");

if (failures.length > 0) {
  console.error("Podcast Phase 2H verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Podcast Phase 2H static verification passed.");
