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

const requiredFiles = [
  "app/api/podcasts/route.ts",
  "app/api/podcasts/[id]/route.ts",
  "app/api/podcasts/episodes/route.ts",
  "app/api/podcasts/episodes/[id]/route.ts",
  "app/api/podcasts/uploads/route.ts",
  "app/api/podcasts/playback/route.ts",
  "app/api/podcasts/likes/route.ts",
  "components/podcasts/PodcastDiscoveryWorkspace.tsx",
  "components/podcasts/PodcastStudioWorkspace.tsx",
  "components/podcasts/podcasts.module.css",
  "lib/podcast-types.ts",
  "lib/podcast-access.ts",
  "lib/podcast-validation.ts",
  "lib/podcast-delete-lifecycle.ts",
  "supabase/migrations/202608200001_podcast_phase1_foundation.sql",
  "supabase/migrations/202608200002_podcast_storage_buckets.sql",
  "supabase/migrations/202608210001_podcast_episode_likes.sql",
];

requiredFiles.forEach((file) => expectFile(file, "Missing Podcast Phase 1 file"));

expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /create table if not exists public\.podcast_shows/i, "Podcast show table missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /create table if not exists public\.podcast_episodes/i, "Podcast episode table missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /episode_type in \('audio', 'video'\)/i, "Audio/video episode constraint missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /public\.can_create_podcasts/i, "Creator role SQL gate missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /'podcast_show', 'podcast_episode'/i, "Library save extension missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /'podcast_episode'\)\);/i, "Recently played extension missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /enable row level security/i, "Podcast RLS missing");
expect("supabase/migrations/202608200001_podcast_phase1_foundation.sql", /revoke insert, update, delete[\s\S]*podcast_shows from authenticated/i, "Podcast API-only mutation boundary missing");
expect("supabase/migrations/202608200002_podcast_storage_buckets.sql", /'podcast-audio'/i, "Podcast audio bucket missing");
expect("supabase/migrations/202608200002_podcast_storage_buckets.sql", /'podcast-video'/i, "Podcast video bucket missing");
expect("supabase/migrations/202608200002_podcast_storage_buckets.sql", /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i, "Owner storage boundary missing");

expect("lib/desktop-app-navigation.ts", /\{ view: "Podcasts" \}/, "Global Podcasts navigation missing");
expect("lib/desktop-app-navigation.ts", /\{ view: "Podcast Studio", requiresCreator: true \}/, "Creator-only Podcast Studio navigation missing");
expect("lib/role-based-navigation.ts", /"Podcasts"/, "Listener Podcast destination missing");
expect("lib/listener-media-actions.ts", /"Podcast Studio"/, "Listener Podcast Studio denial missing");

expect("app/api/podcasts/uploads/route.ts", /requirePodcastRequestCreator/, "Podcast upload creator authorization missing");
expect("app/api/podcasts/episodes/route.ts", /verifyPodcastStoredMedia/, "Server media verification missing");
expect("lib/podcast-storage-verification.ts", /inspectVideoBytesForUploadCompatibility/, "H.264\/AAC video verification missing");
expect("lib/podcast-storage-verification.ts", /hasMpegAudioFrame[\s\S]*hasAacAdtsFrame[\s\S]*mp4a/, "MP3\/M4A\/AAC byte verification missing");
expect("lib/podcast-delete-lifecycle.ts", /EPISODE_COUNT_CONFIRMATION_REQUIRED/, "Show episode-count confirmation missing");
expect("lib/podcast-delete-lifecycle.ts", /podcast-audio|PODCAST_COVERS_BUCKET/, "Podcast storage deletion lifecycle missing");
expect("app/api/podcasts/playback/route.ts", /createSignedUrl/, "Private Podcast signed playback missing");
expect("app/api/podcasts/playback/route.ts", /validatePodcastOwnedStoragePath/, "Podcast playback ownership boundary missing");
expect("app/api/podcasts/playback/route.ts", /increment_podcast_episode_metric/, "Podcast play/view counting missing");

expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /All[\s\S]*Audio[\s\S]*Video/, "Podcast discovery tabs missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /onPlayPodcast/, "Podcast discovery playback callback missing");
expect("components/podcasts/PodcastStudioWorkspace.tsx", /inspectVideoFileForUploadCompatibility/, "Studio video preflight missing");
expect("components/podcasts/PodcastStudioWorkspace.tsx", /confirmEpisodeCount/, "Studio show deletion count confirmation missing");
expect("components/podcasts/podcasts.module.css", /@media\s*\(max-width:\s*820px\)/, "Podcast mobile breakpoint missing");
expect("components/podcasts/podcasts.module.css", /padding-bottom:\s*var\(--mobile-player-reserve/, "Podcast bottom-player clearance missing");

expect("app/api/podcasts/route.ts", /isEpisodeShapedShowPayload/, "Show endpoint rejects episode-shaped payloads");
expect("app/api/podcasts/episodes/route.ts", /podcast_id: podcastId/, "Episode insert uses selected show_id");
expect("app/api/podcasts/episodes/route.ts", /\.from\("podcast_episodes"\)/, "Episode creation inserts episode rows only");
expect("components/podcasts/PodcastStudioWorkspace.tsx", /studioEditorMode === "show"/, "Studio Create Podcast mode missing");
expect("components/podcasts/PodcastStudioWorkspace.tsx", /studioEditorMode === "episode"/, "Studio Create Episode mode missing");
expect("app/page.tsx", /currentPodcastEpisode\?\.episodeType === "video" && podcastPlayableUrl/, "Podcast video signed URL bypass missing");
expect("app/api/podcasts/playback/route.ts", /metricOnly/, "Playback metric-only increment missing");
expect("app/api/podcasts/likes/route.ts", /podcast_episode_likes/, "Podcast likes API missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /toggleLike/, "Discovery like action missing");
expect("components/podcasts/podcasts.module.css", /episodeCardVideo > \.episodeArtwork/, "Compact video episode artwork missing");
expect("app/page.tsx", /function playPodcast\(/, "Podcast shared-player adapter missing");
expect("app/page.tsx", /currentPodcastEpisode\?\.episodeType === "video"/, "Video Podcast player integration missing");
expect("app/page.tsx", /data-podcast-player="audio"/, "Audio Podcast player integration missing");
expect("app/page.tsx", /<PodcastDiscoveryWorkspace/, "Podcast discovery workspace not mounted");
expect("app/page.tsx", /<PodcastStudioWorkspace/, "Podcast Studio workspace not mounted");
expect("app/page.tsx", /itemType: "podcast"/, "Podcast Recently Played item type missing");
expect("app/page.tsx", /recentlyPlayedPodcasts/, "Podcast Recently Played tab missing");

const queueMigration = read("supabase/migrations/202607140001_create_user_media_queue.sql");
if (/podcast/i.test(queueMigration)) {
  failures.push("Existing queue migration was modified to include Podcast media");
}

if (failures.length > 0) {
  console.error("Podcast Phase 1 verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Podcast Phase 1 static verification passed.");
console.log("Live Supabase CRUD/upload/playback checks remain blocked until migrations are applied.");
