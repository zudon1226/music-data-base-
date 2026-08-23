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
  "app/api/podcasts/analytics/route.ts",
  "lib/podcast-analytics.ts",
  "components/podcasts/PodcastStudioAnalytics.tsx",
  "components/podcasts/PodcastDiscoveryWorkspace.tsx",
  "components/podcasts/PodcastShowWorkspace.tsx",
  "components/podcasts/PodcastEpisodeWorkspace.tsx",
  "components/podcasts/PodcastStudioWorkspace.tsx",
  "components/podcasts/PodcastEpisodeComments.tsx",
  "components/moderation/PersistedModerationReports.tsx",
  "app/api/podcasts/episodes/[id]/comments/route.ts",
  "app/api/podcasts/comments/[id]/route.ts",
  "app/api/podcasts/comments/[id]/report/route.ts",
  "app/api/moderation/reports/route.ts",
  "lib/podcast-comments.ts",
  "supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql",
  "app/podcast/[id]/page.tsx",
  "app/podcast/episode/[id]/page.tsx",
  "lib/podcast-routes.ts",
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
expect("app/page.tsx", /<PodcastShowWorkspace/, "Podcast show workspace not mounted");
expect("app/page.tsx", /<PodcastEpisodeWorkspace/, "Podcast episode workspace not mounted");
expect("app/page.tsx", /<PodcastStudioWorkspace/, "Podcast Studio workspace not mounted");
expect("app/page.tsx", /function openPodcastShow\(/, "Podcast show deep-link opener missing");
expect("app/page.tsx", /function openPodcastEpisode\(/, "Podcast episode deep-link opener missing");
expect("next.config.ts", /source: "\/podcast\/episode\/:id"/, "Podcast episode rewrite missing");
expect("next.config.ts", /source: "\/podcast\/:id"/, "Podcast show rewrite missing");
expect("app/api/podcasts/episodes/[id]/route.ts", /export async function GET/, "Public episode GET missing");
expect("lib/role-based-navigation.ts", /"Podcast Show"/, "Listener Podcast show destination missing");
expect("lib/role-based-navigation.ts", /"Podcast Episode"/, "Listener Podcast episode destination missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /onOpenShow/, "Discovery show navigation missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /onOpenEpisode/, "Discovery episode navigation missing");
expect("components/podcasts/PodcastShowWorkspace.tsx", /onPlayPodcast/, "Show page playback callback missing");
expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /onPlayPodcast/, "Episode page playback callback missing");
expect("components/podcasts/podcasts.module.css", /\.detailHeader/, "Show/episode detail header styles missing");
expect("app/page.tsx", /itemType: "podcast"/, "Podcast Recently Played item type missing");
expect("app/page.tsx", /recentlyPlayedPodcasts/, "Podcast Recently Played tab missing");
expect("lib/podcast-analytics.ts", /export function buildPodcastAnalytics/, "Podcast analytics aggregator missing");
expect("lib/podcast-analytics.ts", /audioPlays[\s\S]*videoViews/, "Separated audio plays and video views missing");
expect("app/api/podcasts/analytics/route.ts", /requirePodcastRequestCreator/, "Podcast analytics creator authorization missing");
expect("app/api/podcasts/analytics/route.ts", /eq\("user_id", ownerUserId\)/, "Podcast analytics owner isolation missing");
expect("app/api/podcasts/analytics/route.ts", /buildPodcastAnalytics/, "Podcast analytics payload builder missing");
expect("components/podcasts/PodcastStudioWorkspace.tsx", /<PodcastStudioAnalytics/, "Podcast Studio analytics section missing");
expect("components/podcasts/PodcastStudioAnalytics.tsx", /\/api\/podcasts\/analytics/, "Studio analytics fetch missing");
expect("components/podcasts/PodcastStudioAnalytics.tsx", /Refresh analytics/, "Studio analytics refresh missing");
expect("components/podcasts/podcasts.module.css", /\.studioWorkspace \.analyticsSection/, "Studio-scoped analytics styles missing");
expect("components/podcasts/podcasts.module.css", /\.studioWorkspace \.analyticsMetricGrid/, "Studio-scoped analytics metric cards missing");
expect("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql", /create table if not exists public\.podcast_episode_comments/i, "Podcast comments table missing");
expect("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql", /references public\.podcast_episodes\(id\) on delete cascade/i, "Podcast comments episode FK missing");
expect("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql", /references auth\.users\(id\) on delete cascade/i, "Podcast comments user FK missing");
expect("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql", /podcast_episode_comments_episode_created_idx/i, "Podcast comments episode index missing");
expect("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql", /revoke insert, update, delete[\s\S]*podcast_episode_comments from authenticated/i, "Podcast comments API-only mutation boundary missing");
expect("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql", /moderation_reports_comment_reporter_uidx/i, "Podcast comment duplicate-report index missing");
expect("app/api/podcasts/episodes/[id]/comments/route.ts", /requirePodcastRequestUser/, "Podcast comment create uses authenticated user auth");
expect("app/api/podcasts/episodes/[id]/comments/route.ts", /user_id:\s*auth\.userId/, "Podcast comment insert ignores client user_id");
expect("app/api/podcasts/comments/[id]/route.ts", /You can only delete your own comments/, "Podcast own-comment delete guard missing");
expect("app/api/podcasts/comments/[id]/route.ts", /isAdminUserId/, "Podcast comment admin delete missing");
expect("app/api/podcasts/comments/[id]/report/route.ts", /item_type:\s*"comment"/, "Podcast comment reports reuse moderation_reports");
expect("app/api/podcasts/comments/[id]/report/route.ts", /You already reported this comment/, "Podcast duplicate report rejection missing");
expect("app/api/moderation/reports/route.ts", /from\("podcast_episode_comments"\)[\s\S]*delete/, "Admin remove deletes podcast comment");
expect("components/podcasts/PodcastEpisodeWorkspace.tsx", /<PodcastEpisodeComments/, "Episode page comments section missing");
expect("components/podcasts/PodcastEpisodeComments.tsx", /Submit/, "Episode comment composer missing");
expect("components/podcasts/podcasts.module.css", /\.commentsSection/, "Episode comments styles missing");
expect("app/page.tsx", /<PersistedModerationReports/, "Trust queue persisted reports hook missing");

const commentCreateSource = read("app/api/podcasts/episodes/[id]/comments/route.ts");
if (/requirePodcastRequestCreator/.test(commentCreateSource)) {
  failures.push("Podcast comment create incorrectly requires creator role");
}

const commentDeleteSource = read("app/api/podcasts/comments/[id]/route.ts");
if (/requirePodcastOwner|show\.user_id|podcast_shows/.test(commentDeleteSource)) {
  failures.push("Podcast comment delete grants show-owner delete-other");
}

const commentsMigration = read("supabase/migrations/202608230001_podcast_phase2c_episode_comments.sql");
if (/create table[\s\S]*podcast_episode_comment_reports/i.test(commentsMigration)) {
  failures.push("Phase 2C created a second comment reports table");
}

const showWorkspace = read("components/podcasts/PodcastShowWorkspace.tsx");
if (/PodcastEpisodeComments|Comments/.test(showWorkspace)) {
  failures.push("Podcast show page incorrectly includes comments");
}

const analyticsSource = read("app/api/podcasts/analytics/route.ts");
if (/create table|alter table|from\("podcast_analytics"\)/i.test(analyticsSource)) {
  failures.push("Podcast analytics introduced a new analytics table");
}

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
