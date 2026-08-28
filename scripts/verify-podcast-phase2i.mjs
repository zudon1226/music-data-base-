/**
 * Podcast Phase 2I static contract: liked discovery collection and native share.
 * Usage: node scripts/verify-podcast-phase2i.mjs
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

expectFile("lib/podcast-share.ts", "Phase 2I share helper missing");
expectFile("scripts/verify-podcast-phase2i.mjs", "Phase 2I verify script missing");

const migrations = fs.existsSync(path.join(root, "supabase/migrations"))
  ? fs.readdirSync(path.join(root, "supabase/migrations"))
  : [];
if (migrations.some((name) => /phase2i|podcast.*2i/i.test(name))) {
  failures.push("Phase 2I must not create a database migration");
}

expect("lib/podcast-discovery.ts", /\["discover", "saved", "following", "liked"\]/, "Liked discovery section missing");
expect("lib/podcast-discovery.ts", /export function filterLikedPodcastDiscovery/, "Liked filter helper missing");
expect("lib/podcast-discovery.ts", /export function missingLikedPodcastEpisodeIds/, "Liked hydrate helper missing");
expect("lib/podcast-discovery.ts", /likedEpisodeIds\.has\(episode\.id\)[\s\S]*isPublishedPodcastEpisode/, "Liked filter must keep published episodes only");
expect("lib/podcast-discovery.ts", /isPublishedPodcastShow\(show\)/, "Liked filter must keep published shows only");
expect("lib/podcast-discovery.ts", /export function missingSavedPodcastIds/, "Saved hydrate helper must remain");
expect("lib/podcast-discovery.ts", /export function filterFollowingPodcastDiscovery/, "Following filter must remain");

expect("lib/podcast-share.ts", /navigator\.share/, "Native Web Share missing");
expect("lib/podcast-share.ts", /navigator\.clipboard\.writeText/, "Clipboard fallback missing");
expect("lib/podcast-share.ts", /window\.prompt\("Copy this link"/, "Prompt copy fallback missing");
expect("lib/podcast-share.ts", /AbortError/, "Share cancellation must be ignored");
expect("lib/podcast-share.ts", /return "canceled"/, "Share cancel result missing");
expect("lib/podcast-share.ts", /podcastShareUrl/, "Share helper must reuse podcastShareUrl");
forbid("lib/podcast-share.ts", /\/api\/follows/, "Share helper must not call creator follows");

expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /id: "liked", label: "Liked"/, "Liked discovery tab missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /filterLikedPodcastDiscovery/, "Discovery must filter liked episodes");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /missingLikedPodcastEpisodeIds/, "Discovery must hydrate missing liked episodes");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /fetch\(`\/api\/podcasts\/episodes\/\$\{encodeURIComponent\(episodeId\)\}`/, "Liked hydrate must reuse public episode GET");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /styles\.discoverySections/, "Discovery sections must use a separate tab class");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /aria-label="Filter podcasts by format"/, "All/Audio/Video format tabs must remain");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /All[\s\S]*Audio[\s\S]*Video/, "Format tabs must remain All/Audio/Video");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see liked podcasts/, "Guest Liked empty copy missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /No liked episodes yet/, "Signed-in Liked empty copy missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /\/api\/podcasts\/likes/, "Liked collection must reuse existing likes API");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /\/api\/podcasts\/follows/, "Phase 2H show follows must remain");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /toggleFollowShow/, "Phase 2H follow toggle must remain");
forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /\/api\/follows/, "Discovery must not call creator follows API");
forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /sharePodcastLink|navigator\.share/, "Discover cards must not gain share in Phase 2I");

expect("components/podcasts/PodcastShowWorkspace.tsx", /sharePodcastLink/, "Show page must use native share helper");
expect("components/podcasts/PodcastShowWorkspace.tsx", /result === "canceled"/, "Show share cancel must not be treated as failure");
expect("components/podcasts/PodcastShowWorkspace.tsx", /Show link copied\./, "Show clipboard success copy must remain");
expect("components/podcasts/PodcastShowWorkspace.tsx", /\/api\/podcasts\/follows/, "Show page must keep Phase 2H follows");
forbid("components/podcasts/PodcastShowWorkspace.tsx", /\/api\/follows/, "Show page must not call creator follows API");

expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /sharePodcastLink/, "Episode page must use native share helper");
expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /result === "canceled"/, "Episode share cancel must not be treated as failure");
expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /Episode link copied\./, "Episode clipboard success copy must remain");
expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /\/api\/podcasts\/follows/, "Episode page must keep Phase 2H follows");
forbid("components/podcasts/PodcastEpisodeWorkspace.tsx", /\/api\/follows/, "Episode page must not call creator follows API");

expect("components/podcasts/podcasts.module.css", /\.tabs \{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, "Format tabs must stay three columns");
expect("components/podcasts/podcasts.module.css", /\.discoverySections \{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/, "Desktop discovery sections must support four tabs");
expect("components/podcasts/podcasts.module.css", /\.discoverySections \{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, "Mobile discovery sections must wrap to two columns");
forbid("components/podcasts/podcasts.module.css", /\.tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4/, "Must not change global .tabs to four columns");

expect("lib/podcast-notifications.ts", /from\("podcast_show_follows"\)/, "Phase 2H notification fan-out must remain");
forbid("lib/podcast-notifications.ts", /user_follows/, "Notifications must not use creator follows");
expect("app/page.tsx", /skipActivePodcast\(-PODCAST_SKIP_BACK_SECONDS\)/, "Phase 2G skip back must remain");
expect("app/page.tsx", /playAdjacentPodcastEpisode\("next"\)/, "Podcast autoplay must remain");
expect("app/page.tsx", /continueListeningProgress=\{podcastContinueListeningProgress\}/, "Phase 2F Continue listening must remain");
forbid("app/page.tsx", /from ["'].*podcast-share["']|sharePodcastLink/, "Phase 2I must not wire share through app/page.tsx");
forbid("lib/desktop-media-queue.ts", /podcast/, "Queue must not gain podcast types in Phase 2I");
forbid("app/api/follows/route.ts", /podcast_show_follows|podcast-share|filterLikedPodcastDiscovery/, "Creator follows API must stay untouched");
forbid("lib/billing/plan-entitlements.ts", /podcast-share|filterLikedPodcastDiscovery|podcast_show_follows/, "Billing must stay untouched by Phase 2I");
expect("app/page.tsx", /const GLOBAL_SEARCH_VIEWS: View\[\] = \["Home", "Videos", "Library", "Beats", "Artists", "Trending"\]/, "Global Home search views must stay unchanged");
expect("app/page.tsx", /\(\["Songs", "Videos", "Albums"\] as LibraryTab\[\]\)/, "Shared Library tabs must stay unchanged");

const pkg = read("package.json");
if (!pkg.includes("verify:podcasts-2i")) failures.push("package.json missing verify:podcasts-2i");
if (!pkg.includes("verify-podcast-phase2i.mjs")) failures.push("package.json verify:podcasts must include Phase 2I");

if (failures.length > 0) {
  console.error("Podcast Phase 2I verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Podcast Phase 2I static verification passed.");
