/**
 * Local-only: compare owner musicData IDs/keys to PostgreSQL (no values/secrets).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[line.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE URL or SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const OWNER_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userResult, error: userError } = await sb.auth.admin.getUserById(OWNER_ID);
if (userError) {
  console.error("getUserById failed:", userError.message);
  process.exit(1);
}

const meta = userResult.user?.user_metadata || {};
const music = meta.musicData && typeof meta.musicData === "object" ? meta.musicData : {};
const songs = Array.isArray(music.songs) ? music.songs : [];
const videos = Array.isArray(music.videos) ? music.videos : [];
const songIds = songs.map((s) => s?.id).filter(Boolean);
const videoIds = videos.map((v) => v?.id).filter(Boolean);

const placeholder = "00000000-0000-0000-0000-000000000000";
const { data: dbSongs } = await sb
  .from("songs")
  .select("id")
  .in("id", songIds.length ? songIds : [placeholder]);
const { data: dbVideos } = await sb
  .from("videos")
  .select("id")
  .in("id", videoIds.length ? videoIds : [placeholder]);
const { data: ums } = await sb
  .from("user_music_state")
  .select("user_id,library_ids,playlists,active_playlist_id,recently_played")
  .eq("user_id", OWNER_ID)
  .maybeSingle();
const { count: likes } = await sb
  .from("song_likes")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { count: libs } = await sb
  .from("library_saves")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { count: follows } = await sb
  .from("artist_follows")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { data: profile } = await sb
  .from("profiles")
  .select("display_name,account_type,avatar_url")
  .or(`id.eq.${OWNER_ID},user_id.eq.${OWNER_ID}`)
  .maybeSingle();

const dbSongSet = new Set((dbSongs || []).map((r) => r.id));
const dbVideoSet = new Set((dbVideos || []).map((r) => r.id));

console.log(
  JSON.stringify(
    {
      role: meta.role || null,
      displayNamePresent: Boolean(meta.displayName),
      songIdsCount: songIds.length,
      songIdsInDb: dbSongSet.size,
      songIdsMissing: songIds.filter((id) => !dbSongSet.has(id)),
      songSampleKeys: songs[0] ? Object.keys(songs[0]) : [],
      videoIdsCount: videoIds.length,
      videoIdsInDb: dbVideoSet.size,
      videoIdsMissing: videoIds.filter((id) => !dbVideoSet.has(id)),
      videoSampleKeys: videos[0] ? Object.keys(videos[0]) : [],
      artistProfileCount: Array.isArray(music.artistProfiles) ? music.artistProfiles.length : 0,
      artistSampleKeys: music.artistProfiles?.[0]
        ? Object.keys(music.artistProfiles[0])
        : [],
      recentCount: Array.isArray(music.recentlyPlayed) ? music.recentlyPlayed.length : 0,
      recentSampleKeys: music.recentlyPlayed?.[0]
        ? Object.keys(music.recentlyPlayed[0])
        : [],
      umsExists: Boolean(ums),
      umsRecentLen: Array.isArray(ums?.recently_played) ? ums.recently_played.length : 0,
      umsLibLen: Array.isArray(ums?.library_ids) ? ums.library_ids.length : 0,
      umsPlLen: Array.isArray(ums?.playlists) ? ums.playlists.length : 0,
      likes: likes ?? 0,
      libs: libs ?? 0,
      follows: follows ?? 0,
      profileAccountType: profile?.account_type || null,
      profileDisplayNamePresent: Boolean(profile?.display_name),
      metaLikedCount: Array.isArray(music.likedIds) ? music.likedIds.length : 0,
      metaLibraryCount: Array.isArray(music.libraryIds) ? music.libraryIds.length : 0,
      metaFollowedCount: Array.isArray(music.followedIds) ? music.followedIds.length : 0,
    },
    null,
    2,
  ),
);
