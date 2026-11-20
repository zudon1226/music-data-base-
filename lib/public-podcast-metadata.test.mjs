/**
 * Public podcast page metadata (pure builders + URL safety).
 * Run: node lib/public-podcast-metadata.test.mjs
 */
import assert from "node:assert/strict";
import {
    buildPodcastDiscoveryMetadata,
    buildPublicPodcastEpisodeMetadata,
    buildPublicPodcastShowMetadata,
    buildRestrictedPodcastMetadata,
    cleanPodcastMetadataText,
    isUnsafePodcastMetadataMediaUrl,
    podcastEpisodePath,
    podcastShowPath,
    resolvePublicPodcastMetadataImageUrl,
} from "./public-podcast-metadata.shared.mjs";

const SHOW_ID = "3624d901-e787-4421-9600-b350155a7f43";
const AUDIO_ID = "4fa0ac8d-999f-4b30-be7b-2a4841f52872";
const VIDEO_ID = "65da7c00-89e5-4f9d-a04a-ea2062c18293";
const siteUrl = "https://example.test";

const showFixture = {
    id: SHOW_ID,
    userId: "00000000-0000-4000-8000-000000000001",
    title: "Staging Test Show",
    description: "A published show for listener QA.",
    coverImageUrl: "https://cdn.example.test/show-cover.jpg",
    coverStoragePath: "",
    category: "Podcast",
    languageCode: "en",
    explicitContent: false,
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    creatorName: "Test Creator",
    episodeCount: 2,
};

const audioFixture = {
    id: AUDIO_ID,
    podcastId: SHOW_ID,
    userId: showFixture.userId,
    title: "Audio Episode",
    description: "Published audio episode.",
    episodeNumber: 1,
    seasonNumber: 1,
    episodeType: "audio",
    mediaUrl: "",
    storagePath: "",
    artworkUrl: "https://cdn.example.test/audio-art.jpg",
    artworkStoragePath: "",
    thumbnailUrl: "",
    durationSeconds: 120,
    status: "published",
    publishedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    podcastTitle: showFixture.title,
    creatorName: showFixture.creatorName,
    playCount: 1,
    viewCount: 0,
    likeCount: 0,
};

const videoFixture = {
    ...audioFixture,
    id: VIDEO_ID,
    title: "Video Episode",
    description: "Published video episode.",
    episodeType: "video",
    thumbnailUrl: "https://cdn.example.test/video-thumb.jpg",
    viewCount: 2,
};

assert.equal(cleanPodcastMetadataText("  Hello   world  ", 80), "Hello world");
assert.ok(isUnsafePodcastMetadataMediaUrl("https://x.supabase.co/storage/v1/object/sign/podcast-audio/foo"));
assert.ok(isUnsafePodcastMetadataMediaUrl("podcast-video/user/file.mp4"));
assert.ok(isUnsafePodcastMetadataMediaUrl("https://cdn.example.test/file?token=abc"));
assert.ok(!isUnsafePodcastMetadataMediaUrl("https://cdn.example.test/show-cover.jpg"));

assert.equal(
    resolvePublicPodcastMetadataImageUrl(siteUrl, "", "podcast-audio/secret.mp4", "/safe.png"),
    `${siteUrl}/safe.png`,
);

const discovery = buildPodcastDiscoveryMetadata(siteUrl);
assert.equal(discovery.title, "Podcasts | Music Data Base");
assert.equal(discovery.alternates.canonical, `${siteUrl}/podcast`);
assert.equal(discovery.openGraph.url, `${siteUrl}/podcast`);
assert.ok(String(discovery.openGraph.images[0].url).includes("music-data-base-logo.png"));
assert.ok(!JSON.stringify(discovery).includes("storage_path"));
assert.ok(!JSON.stringify(discovery).includes("object/sign"));

const showMeta = buildPublicPodcastShowMetadata(showFixture, siteUrl);
assert.ok(showMeta.title.includes("Staging Test Show"));
assert.equal(showMeta.alternates.canonical, `${siteUrl}${podcastShowPath(SHOW_ID)}`);
assert.equal(showMeta.openGraph.images[0].url, "https://cdn.example.test/show-cover.jpg");
assert.ok(!JSON.stringify(showMeta).includes("coverStoragePath"));

const audioMeta = buildPublicPodcastEpisodeMetadata(audioFixture, showFixture, siteUrl);
assert.ok(audioMeta.title.includes("Audio Episode"));
assert.ok(audioMeta.title.includes("Staging Test Show"));
assert.equal(audioMeta.alternates.canonical, `${siteUrl}${podcastEpisodePath(AUDIO_ID)}`);
assert.equal(audioMeta.openGraph.type, "music.song");
assert.ok(!JSON.stringify(audioMeta).includes("storagePath"));
assert.ok(!JSON.stringify(audioMeta).includes("signedUrl"));

const videoMeta = buildPublicPodcastEpisodeMetadata(videoFixture, showFixture, siteUrl);
assert.equal(videoMeta.openGraph.type, "video.other");
assert.equal(videoMeta.openGraph.images[0].url, "https://cdn.example.test/video-thumb.jpg");

const restricted = buildRestrictedPodcastMetadata("episode");
assert.equal(restricted.robots.index, false);
assert.ok(!restricted.description.includes("secret draft title"));

console.log("public-podcast-metadata.test.mjs: ok");