/**
 * Podcast Phase 2G static contract: skip, playback speed, and sleep timer.
 * Usage: node scripts/verify-podcast-phase2g.mjs
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

expectFile("lib/podcast-playback-controls.ts", "Phase 2G playback helper missing");
expectFile("components/podcasts/PodcastListeningControls.tsx", "Phase 2G listening controls component missing");
expectFile("scripts/verify-podcast-phase2g.mjs", "Phase 2G verify script missing");

expect("lib/podcast-playback-controls.ts", /export const PODCAST_SKIP_BACK_SECONDS = 15/, "Skip back 15 seconds missing");
expect("lib/podcast-playback-controls.ts", /export const PODCAST_SKIP_FORWARD_SECONDS = 30/, "Skip forward 30 seconds missing");
expect("lib/podcast-playback-controls.ts", /PODCAST_PLAYBACK_RATES = \[0\.75, 1, 1\.25, 1\.5, 2\]/, "Playback speeds missing");
expect("lib/podcast-playback-controls.ts", /PODCAST_SLEEP_MINUTE_OPTIONS = \[5, 15, 30, 60\]/, "Sleep minute options missing");
expect("lib/podcast-playback-controls.ts", /"off" \| "end-of-episode"/, "Sleep off/end-of-episode modes missing");
expect("lib/podcast-playback-controls.ts", /export function clampPodcastSeekSeconds/, "Seek clamp helper missing");
expect("lib/podcast-playback-controls.ts", /Math\.max\(0,/, "Clamp must never go below 0");
expect("lib/podcast-playback-controls.ts", /Math\.min\(duration,/, "Clamp must never exceed duration");
expect("lib/podcast-playback-controls.ts", /export function podcastSleepDurationMs/, "Sleep duration helper missing");
forbid("lib/podcast-playback-controls.ts", /user_music_state|localStorage|create table/, "Playback helper must stay client-session only");

expect("components/podcasts/PodcastListeningControls.tsx", /variant: "desktop" \| "mobile"/, "Desktop and mobile control variants missing");
expect("components/podcasts/PodcastListeningControls.tsx", /includeSkip/, "Video/mobile skip menu flag missing");
expect("components/podcasts/PodcastListeningControls.tsx", /Skip back 15 seconds/, "Skip back control missing");
expect("components/podcasts/PodcastListeningControls.tsx", /Skip forward 30 seconds/, "Skip forward control missing");
expect("components/podcasts/PodcastListeningControls.tsx", /End of episode/, "End of episode sleep option missing");
expect("components/podcasts/PodcastListeningControls.tsx", /createPortal/, "Menus must portal so player height stays unchanged");
expect("components/podcasts/podcasts.module.css", /\.listeningMobileTrigger[\s\S]*min-height:\s*44px/, "Mobile listening trigger touch target missing");
expect("components/podcasts/podcasts.module.css", /\.listeningMenuRow button[\s\S]*min-height:\s*44px/, "Menu action touch target missing");

expect("app/page.tsx", /from "\.\.\/lib\/podcast-playback-controls"/, "Page must use Phase 2G playback helper");
expect("app/page.tsx", /from "\.\.\/components\/podcasts\/PodcastListeningControls"/, "Page must mount Phase 2G controls");
expect("app/page.tsx", /skipActivePodcast\(-PODCAST_SKIP_BACK_SECONDS\)/, "Audio/video skip back wiring missing");
expect("app/page.tsx", /skipActivePodcast\(PODCAST_SKIP_FORWARD_SECONDS\)/, "Audio/video skip forward wiring missing");
expect("app/page.tsx", /clampPodcastSeekSeconds/, "Player skip must clamp through helper");
expect("app/page.tsx", /aria-label="Skip back 15 seconds"/, "Audio skip back button missing");
expect("app/page.tsx", /aria-label="Skip forward 30 seconds"/, "Audio skip forward button missing");
expect("app/page.tsx", /data-podcast-player="audio"/, "Audio podcast player gate missing");
expect("app/page.tsx", /data-podcast-player=\{currentPodcastEpisode\?\.episodeType === "video" \? "video" : undefined\}/, "Video podcast player gate missing");
expect("app/page.tsx", /playbackRate = podcastAudioActive \? podcastPlaybackRate : 1/, "Shared audio element must reset rate off podcast");
expect("app/page.tsx", /playbackRate = podcastVideoActive \? podcastPlaybackRate : 1/, "Shared video element must reset rate off podcast");
expect("app/page.tsx", /podcastSleepModeRef\.current === "end-of-episode"/, "End-of-episode sleep intercept missing");
expect("app/page.tsx", /playAdjacentPodcastEpisode\("next"\)/, "Normal podcast autoplay must remain");
expect("app/page.tsx", /function stopPodcastForSleep/, "Timed sleep stop helper missing");
expect("app/page.tsx", /clearTimeout\(podcastSleepTimerRef/, "Sleep timer cleanup missing");
expect("app/page.tsx", /setPodcastPlaybackRate\(1\)/, "Leaving podcast must reset speed state");

expect("app/page.tsx", /from "\.\.\/lib\/podcast-resume"/, "Phase 2F resume helper must remain");
expect("app/page.tsx", /podcastResumePositionRef/, "Phase 2F audio resume seek must remain");
expect("app/page.tsx", /lookupPodcastResumePosition/, "Phase 2F resume lookup must remain");
expect("app/page.tsx", /continueListeningProgress=\{podcastContinueListeningProgress\}/, "Phase 2F Continue listening must remain");
expect("app/page.tsx", /playAdjacentPodcastEpisode\("previous"\)/, "Previous episode control must remain");

forbid("app/page.tsx", /remoteMusicStateSaveBody[\s\S]{0,240}podcastPlaybackRate/, "Must not persist podcast speed into shared music state");
forbid("lib/desktop-media-queue.ts", /podcast/, "Queue must not gain podcast types in Phase 2G");
forbid("app/api/user-music-state/route.ts", /playbackRate|podcastSleep/, "Music state API must not store podcast speed/sleep");

const pkg = read("package.json");
if (!pkg.includes("verify:podcasts-2g")) failures.push("package.json missing verify:podcasts-2g");
if (!pkg.includes("verify-podcast-phase2g.mjs")) failures.push("package.json verify:podcasts must include Phase 2G");

const migrationDir = path.join(root, "supabase", "migrations");
const newPhase2gMigration = fs.readdirSync(migrationDir).some((name) => /podcast.*2g|2g.*podcast|podcast.*sleep|podcast.*playback.?rate/i.test(name));
if (newPhase2gMigration) failures.push("Phase 2G created a podcast database migration");

if (failures.length > 0) {
    console.error("Podcast Phase 2G verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Podcast Phase 2G static verification passed.");
