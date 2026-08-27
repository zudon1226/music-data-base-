/**
 * Podcast Phase 2F static contract: resume / Continue Listening from existing Recently Played.
 * Usage: node scripts/verify-podcast-phase2f.mjs
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

expectFile("lib/podcast-resume.ts", "Phase 2F resume helper missing");
expectFile("scripts/verify-podcast-phase2f.mjs", "Phase 2F verify script missing");

expect("lib/podcast-resume.ts", /export const PODCAST_RESUME_MIN_SECONDS = 5/, "Resume minimum progress missing");
expect("lib/podcast-resume.ts", /PODCAST_RESUME_COMPLETED_RATIO = 0\.95/, "Completed ratio missing");
expect("lib/podcast-resume.ts", /export function isEligiblePodcastResume/, "Eligibility helper missing");
expect("lib/podcast-resume.ts", /export function podcastResumeStartSeconds/, "Resume start helper missing");
expect("lib/podcast-resume.ts", /export function selectContinueListeningPodcasts/, "Continue listening selector missing");
expect("lib/podcast-resume.ts", /isPublishedPodcastEpisode/, "Continue listening must require published episodes");
expect("lib/podcast-resume.ts", /from "@\/lib\/podcast-discovery"/, "Resume helper must reuse discovery published check");

forbid("lib/podcast-resume.ts", /from\("user_recently_played"\)|create table|localStorage/, "Resume helper must not create a second history store");

expect("lib/podcast-types.ts", /startPosition\?: number/, "Playback request startPosition missing");

expect("app/page.tsx", /from "\.\.\/lib\/podcast-resume"/, "Page must use Phase 2F resume helper");
expect("app/page.tsx", /podcastContinueListeningProgress/, "Continue listening progress must come from existing Recently Played");
expect("app/page.tsx", /mediaType: "podcast_episode"/, "Existing podcast Recently Played sync must remain");
expect("app/page.tsx", /lookupPodcastResumePosition/, "Podcast resume lookup missing");
expect("app/page.tsx", /podcastResumePositionRef/, "Podcast audio resume seek missing");
expect("app/page.tsx", /resolvePodcastPlayback\(stub, \[stub\], resolved\.position\)/, "Recently Played podcast resume must pass saved position");
expect("app/page.tsx", /recordPodcastRecentlyPlayed\(episode, startPosition\)/, "Resume start must not overwrite progress with zero");
expect("app/page.tsx", /continueListeningProgress=\{podcastContinueListeningProgress\}/, "Discovery must receive existing Recently Played progress");

expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /selectContinueListeningPodcasts/, "Discovery must select Continue listening from published catalog");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Continue listening/, "Continue listening heading missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Resume \$\{item\.episode\.title\}/, "Resume control missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /aria-label="Search published podcasts"/, "Phase 2E search must remain");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Discover[\s\S]*Saved[\s\S]*Following/, "Phase 2E sections must remain");
expect("components/podcasts/podcasts.module.css", /\.continueListening/, "Continue listening styles missing");
expect("components/podcasts/podcasts.module.css", /\.continueListeningCard[\s\S]*min-height:\s*44px/, "Resume touch target missing");
expect("components/podcasts/podcasts.module.css", /padding-bottom:\s*var\(--mobile-player-reserve/, "Podcast player clearance must remain");

expect("app/page.tsx", /const GLOBAL_SEARCH_VIEWS: View\[\] = \["Home", "Videos", "Library", "Beats", "Artists", "Trending"\]/, "Global Home search views must stay unchanged");
expect("app/page.tsx", /\(\["Songs", "Videos", "Albums"\] as LibraryTab\[\]\)/, "Shared Library tabs must stay unchanged");
expect("lib/desktop-media-queue.ts", /MediaQueueType|"song" \| "video"/, "Queue types must remain song/video only");

forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /scope=mine/, "Discovery must not load Studio/mine drafts");
forbid("lib/podcast-notifications.ts", /podcastResume|continueListening/, "Phase 2D notifications must stay untouched");
forbid("app/api/podcasts/route.ts", /searchParams\.get\("q"\)|searchParams\.get\("category"\)/, "Public podcast GET must not gain search/category params");
forbid("lib/desktop-media-queue.ts", /podcast/, "Queue must not gain podcast types in Phase 2F");
forbid("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /playback_position_seconds/, "Phase 2F must not rewrite Phase 1 foundation migration");

const migrationDir = path.join(root, "supabase", "migrations");
const newResumeMigration = fs.readdirSync(migrationDir).some((name) => /podcast.*resume|resume.*podcast|continue.?listen/i.test(name));
if (newResumeMigration) failures.push("Phase 2F created a podcast resume migration");

if (failures.length > 0) {
    console.error("Podcast Phase 2F verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Podcast Phase 2F static verification passed.");
