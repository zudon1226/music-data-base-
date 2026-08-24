/**
 * Podcast Phase 2E static contract: discovery search, categories, Saved, Following.
 * Usage: node scripts/verify-podcast-phase2e.mjs
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

expectFile("lib/podcast-discovery.ts", "Phase 2E discovery helper missing");
expectFile("scripts/verify-podcast-phase2e.mjs", "Phase 2E verify script missing");

expect("lib/podcast-discovery.ts", /export function normalizePodcastSearchQuery/, "Search query normalizer missing");
expect("lib/podcast-discovery.ts", /export function podcastShowMatchesQuery/, "Show search matcher missing");
expect("lib/podcast-discovery.ts", /export function podcastEpisodeMatchesQuery/, "Episode search matcher missing");
expect("lib/podcast-discovery.ts", /show\.title[\s\S]*show\.creatorName[\s\S]*show\.description[\s\S]*show\.category/, "Show search fields incomplete");
expect("lib/podcast-discovery.ts", /episode\.title[\s\S]*episode\.podcastTitle[\s\S]*episode\.creatorName[\s\S]*episode\.description/, "Episode search fields incomplete");
expect("lib/podcast-discovery.ts", /export function uniquePodcastCategories/, "Category chip helper missing");
expect("lib/podcast-discovery.ts", /export function filterSavedPodcastDiscovery/, "Saved filter helper missing");
expect("lib/podcast-discovery.ts", /export function filterFollowingPodcastDiscovery/, "Following filter helper missing");
expect("lib/podcast-discovery.ts", /show\.userId !== currentUserId/, "Following must exclude the current user");
expect("lib/podcast-discovery.ts", /status === "published"/, "Published-only helpers missing");

expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /from "@\/lib\/podcast-discovery"/, "Discovery workspace must use Phase 2E helper");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /aria-label="Search published podcasts"/, "Local podcast search missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Filter podcasts by category/, "Category chips missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Discover[\s\S]*Saved[\s\S]*Following/, "Discover/Saved/Following sections missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /All[\s\S]*Audio[\s\S]*Video/, "Format tabs must remain");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /list=following/, "Following must reuse /api/follows list=following");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /\/api\/library-saves/, "Saved must reuse /api/library-saves");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /fetch\(`\/api\/podcasts\/\$\{encodeURIComponent\(showId\)\}`/, "Saved show hydrate must use public show GET");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /fetch\(`\/api\/podcasts\/episodes\/\$\{encodeURIComponent\(episodeId\)\}`/, "Saved episode hydrate must use public episode GET");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /No podcasts match your search/, "Search empty state missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see saved podcasts/, "Guest Saved empty state missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see podcasts from creators you follow/, "Guest Following empty state missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /isPublishedPodcastShow/, "Discovery must keep published-only shows");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /isPublishedPodcastEpisode/, "Discovery must keep published-only episodes");

expect("components/podcasts/podcasts.module.css", /\.discoverySearch/, "Discovery search styles missing");
expect("components/podcasts/podcasts.module.css", /\.categoryChips/, "Category chip styles missing");
expect("components/podcasts/podcasts.module.css", /\.discoverySearch input[\s\S]*min-height:\s*44px/, "Search touch target missing");
expect("components/podcasts/podcasts.module.css", /\.categoryChip[\s\S]*min-height:\s*44px/, "Category chip touch target missing");
expect("components/podcasts/podcasts.module.css", /padding-bottom:\s*var\(--mobile-player-reserve/, "Podcast player clearance must remain");

expect("app/page.tsx", /const GLOBAL_SEARCH_VIEWS: View\[\] = \["Home", "Videos", "Library", "Beats", "Artists", "Trending"\]/, "Global Home search views must stay unchanged");
expect("app/page.tsx", /view !== "Podcasts"/, "Podcasts must stay excluded from global search heading");
expect("app/page.tsx", /\(\["Songs", "Videos", "Albums"\] as LibraryTab\[\]\)/, "Shared Library tabs must stay unchanged");
expect("app/page.tsx", /<PodcastDiscoveryWorkspace/, "Podcast discovery workspace must remain mounted");
expect("lib/desktop-media-queue.ts", /MediaQueueType|"song" \| "video"/, "Queue types must remain song/video only");

forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /scope=mine/, "Discovery must not load Studio/mine drafts");
forbid("components/podcasts/PodcastShowWorkspace.tsx", /discoverySearch|PodcastDiscoverySection/, "Show page must stay outside Phase 2E UI");
forbid("components/podcasts/PodcastEpisodeWorkspace.tsx", /discoverySearch|PodcastDiscoverySection/, "Episode page must stay outside Phase 2E UI");
forbid("components/podcasts/PodcastStudioWorkspace.tsx", /discoverySearch|filterSavedPodcastDiscovery/, "Studio must stay outside Phase 2E UI");
forbid("lib/podcast-notifications.ts", /filterPodcastDiscovery|discoverySearch/, "Phase 2D notifications must stay untouched");
forbid("app/api/podcasts/route.ts", /searchParams\.get\("q"\)|searchParams\.get\("category"\)/, "Public podcast GET must not gain search/category params in Phase 2E");

const page = read("app/page.tsx");
if (!page.includes("function playPodcast(") || !page.includes('itemType: "podcast"')) {
    failures.push("Phase 1–2D podcast playback/recent wiring missing from app/page.tsx");
}

if (failures.length > 0) {
    console.error("Podcast Phase 2E verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Podcast Phase 2E static verification passed.");
