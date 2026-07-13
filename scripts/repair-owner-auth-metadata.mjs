/**
 * One-time, server-only repair for oversized Auth user_metadata on the owner account.
 *
 * - Uses SUPABASE_SERVICE_ROLE_KEY from .env.local (never shipped to the browser).
 * - Backs up full metadata under .local-secrets/ (gitignored).
 * - Migrates preservable app collections into PostgreSQL tables idempotently.
 * - Replaces Auth user_metadata with minimal identity fields only.
 * - Does NOT delete/recreate the user or change the UUID.
 *
 * Usage:
 *   node scripts/repair-owner-auth-metadata.mjs
 *   node scripts/repair-owner-auth-metadata.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

const OWNER_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";
const OWNER_EMAIL = "zudon1226@gmail.com";
const DRY_RUN = process.argv.includes("--dry-run");

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

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function sanitizeMinimalMetadata(source, profile) {
  const displayName =
    asString(source.displayName) ||
    asString(source.display_name) ||
    asString(profile?.display_name) ||
    OWNER_EMAIL.split("@")[0];
  const role =
    (asString(source.role) ||
      asString(source.accountRole) ||
      asString(profile?.account_type) ||
      "listener").toLowerCase();
  const avatarUrl =
    asString(source.avatarUrl) ||
    asString(source.avatar_url) ||
    asString(profile?.avatar_url);

  const next = { displayName, role };
  if (avatarUrl) next.avatarUrl = avatarUrl;
  return next;
}

function summarizeMusicData(music) {
  const keys = Object.keys(music || {});
  return {
    topLevelKeys: keys,
    sizes: Object.fromEntries(
      keys.map((key) => [key, { type: typeof music[key], bytes: byteSize(music[key]) }]),
    ),
    counts: {
      songs: asArray(music.songs).length,
      videos: asArray(music.videos).length,
      playlists: asArray(music.playlists).length,
      recentlyPlayed: asArray(music.recentlyPlayed).length,
      libraryIds: asArray(music.libraryIds).length,
      likedIds: asArray(music.likedIds).length,
      followedIds: asArray(music.followedIds).length,
      followedArtistIds: asArray(music.followedArtistIds).length,
      artistProfiles: asArray(music.artistProfiles).length,
      queueIds: asArray(music.queueIds).length,
    },
  };
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(
  JSON.stringify(
    {
      phase: "start",
      dryRun: DRY_RUN,
      ownerId: OWNER_ID,
      ownerEmail: OWNER_EMAIL,
    },
    null,
    2,
  ),
);

const { data: userResult, error: userError } = await sb.auth.admin.getUserById(OWNER_ID);
if (userError || !userResult?.user) {
  console.error("getUserById failed:", userError?.message || "user missing");
  process.exit(1);
}

const user = userResult.user;
if (String(user.email || "").toLowerCase() !== OWNER_EMAIL) {
  console.error("Refusing repair: email mismatch for target user id");
  process.exit(1);
}

const currentMetadata = (user.user_metadata || {});
const music =
  currentMetadata.musicData && typeof currentMetadata.musicData === "object"
    ? currentMetadata.musicData
    : {};

const backupDir = resolve(process.cwd(), ".local-secrets");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve(backupDir, `owner-user-metadata-backup-${stamp}.json`);
const backupPayload = {
  backedUpAt: new Date().toISOString(),
  userId: OWNER_ID,
  email: OWNER_EMAIL,
  user_metadata: currentMetadata,
  app_metadata: user.app_metadata || {},
};
if (!DRY_RUN) {
  writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), "utf8");
}

console.log(
  JSON.stringify(
    {
      phase: "backup",
      dryRun: DRY_RUN,
      backupPath: DRY_RUN ? "(skipped)" : backupPath,
      totalUserMetadataBytes: byteSize(currentMetadata),
      musicDataSummary: summarizeMusicData(music),
    },
    null,
    2,
  ),
);

const { data: existingProfile } = await sb
  .from("profiles")
  .select("display_name,account_type,avatar_url,is_admin")
  .or(`id.eq.${OWNER_ID},user_id.eq.${OWNER_ID}`)
  .maybeSingle();

const { data: existingState } = await sb
  .from("user_music_state")
  .select("library_ids,recently_played,playlists,active_playlist_id")
  .eq("user_id", OWNER_ID)
  .maybeSingle();

const migration = {
  user_music_state: { recentlyPlayed: 0, libraryIds: 0, playlists: 0, activePlaylistId: false },
  song_likes: 0,
  library_saves: 0,
  artist_follows: 0,
  skipped: {
    songs: {
      reason:
        "Legacy non-UUID client song blobs; owner already has songs rows in public.songs. Kept in backup only.",
      count: asArray(music.songs).length,
    },
    videos: {
      reason:
        "Legacy non-UUID client video blobs; owner already has videos rows in public.videos. Kept in backup only.",
      count: asArray(music.videos).length,
    },
    artistProfiles: {
      reason:
        "No dedicated destination table; client rebuilds artist profiles from songs. Kept in backup only.",
      count: asArray(music.artistProfiles).length,
    },
    queueIds: { reason: "Ephemeral playback queue; not persisted.", count: asArray(music.queueIds).length },
    currentSongId: {
      reason: "Ephemeral playback pointer; not persisted.",
      present: Boolean(asString(music.currentSongId)),
    },
  },
};

const metaRecent = asArray(music.recentlyPlayed);
const dbRecent = asArray(existingState?.recently_played);
const nextRecent = dbRecent.length > 0 ? dbRecent : metaRecent;

const metaLibrary = asArray(music.libraryIds);
const dbLibrary = asArray(existingState?.library_ids);
const nextLibrary = dbLibrary.length > 0 ? dbLibrary : metaLibrary;

const metaPlaylists = asArray(music.playlists);
const dbPlaylists = asArray(existingState?.playlists);
const nextPlaylists = dbPlaylists.length > 0 ? dbPlaylists : metaPlaylists;

const metaActive = asString(music.activePlaylistId) || asString(music.active_playlist_id);
const dbActive = asString(existingState?.active_playlist_id);
const nextActive = dbActive || metaActive || "";

migration.user_music_state.recentlyPlayed = dbRecent.length > 0 ? 0 : metaRecent.length;
migration.user_music_state.libraryIds = dbLibrary.length > 0 ? 0 : metaLibrary.length;
migration.user_music_state.playlists = dbPlaylists.length > 0 ? 0 : metaPlaylists.length;
migration.user_music_state.activePlaylistId = !dbActive && Boolean(metaActive);

if (!DRY_RUN) {
  const { error: umsError } = await sb.from("user_music_state").upsert(
    {
      user_id: OWNER_ID,
      library_ids: nextLibrary,
      recently_played: nextRecent,
      playlists: nextPlaylists,
      active_playlist_id: nextActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (umsError) {
    console.error("user_music_state upsert failed:", umsError.message);
    process.exit(1);
  }
}

for (const likedId of asArray(music.likedIds).map(asString).filter(Boolean)) {
  if (DRY_RUN) {
    migration.song_likes += 1;
    continue;
  }
  const { error } = await sb
    .from("song_likes")
    .upsert({ song_id: likedId, user_id: OWNER_ID }, { onConflict: "song_id,user_id", ignoreDuplicates: true });
  if (!error) migration.song_likes += 1;
}

for (const libraryId of asArray(music.libraryIds).map(asString).filter(Boolean)) {
  if (!isUuid(libraryId)) continue;
  if (DRY_RUN) {
    migration.library_saves += 1;
    continue;
  }
  const { error } = await sb.from("library_saves").upsert(
    { user_id: OWNER_ID, item_id: libraryId, item_type: "song" },
    { onConflict: "user_id,item_id,item_type", ignoreDuplicates: true },
  );
  if (!error) migration.library_saves += 1;
}

const followIds = [
  ...asArray(music.followedArtistIds),
  ...asArray(music.followedIds),
]
  .map(asString)
  .filter(Boolean);
for (const artistId of [...new Set(followIds)]) {
  if (DRY_RUN) {
    migration.artist_follows += 1;
    continue;
  }
  const { error } = await sb.from("artist_follows").upsert(
    { artist_id: artistId, artist_name: artistId, user_id: OWNER_ID },
    { onConflict: "artist_id,user_id", ignoreDuplicates: true },
  );
  if (!error) migration.artist_follows += 1;
}

const nextMetadata = sanitizeMinimalMetadata(currentMetadata, existingProfile);

if (!DRY_RUN) {
  const { error: profileError } = await sb.from("profiles").upsert(
    {
      id: OWNER_ID,
      user_id: OWNER_ID,
      display_name: nextMetadata.displayName,
      account_type: "admin",
      is_admin: true,
      avatar_url: nextMetadata.avatarUrl || existingProfile?.avatar_url || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) {
    console.error("profiles upsert failed:", profileError.message);
    process.exit(1);
  }

  const { error: roleError } = await sb.from("user_roles").upsert(
    {
      user_id: OWNER_ID,
      role: "admin",
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,role" },
  );
  if (roleError) {
    console.error("user_roles upsert failed:", roleError.message);
    process.exit(1);
  }

  // Admin API merges user_metadata — null every non-allowed key so musicData is removed.
  const authMetadata = {
    displayName: nextMetadata.displayName,
    role: "admin",
    ...(nextMetadata.avatarUrl ? { avatarUrl: nextMetadata.avatarUrl } : {}),
  };
  const clearKeys = [
    "musicData",
    "songs",
    "videos",
    "playlists",
    "libraryIds",
    "likedIds",
    "queueIds",
    "followedIds",
    "followedArtistIds",
    "artistProfiles",
    "recentlyPlayed",
    "currentSongId",
    "activePlaylistId",
    "accountRole",
    "email",
    "email_verified",
    "phone_verified",
    "sub",
    "display_name",
    "full_name",
    "name",
    "avatar_url",
  ];
  const adminPatch = { ...authMetadata };
  for (const key of Object.keys(currentMetadata)) {
    if (!(key in authMetadata)) {
      adminPatch[key] = null;
    }
  }
  for (const key of clearKeys) {
    if (!(key in authMetadata)) {
      adminPatch[key] = null;
    }
  }

  const { error: updateError } = await sb.auth.admin.updateUserById(OWNER_ID, {
    user_metadata: adminPatch,
  });
  if (updateError) {
    console.error("updateUserById failed:", updateError.message);
    process.exit(1);
  }

  // Invalidate existing sessions so clients must re-login with the slim JWT.
  const logoutRes = await fetch(`${url}/auth/v1/admin/users/${OWNER_ID}/logout`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });
  if (logoutRes.ok || logoutRes.status === 204) {
    console.log(JSON.stringify({ phase: "sessions", method: "logout-endpoint", invalidated: true }, null, 2));
  } else {
    const ban = await sb.auth.admin.updateUserById(OWNER_ID, { ban_duration: "1s" });
    if (ban.error) {
      console.warn("session invalidate warning:", ban.error.message);
    } else {
      await new Promise((r) => setTimeout(r, 1500));
      const unban = await sb.auth.admin.updateUserById(OWNER_ID, { ban_duration: "none" });
      if (unban.error) {
        console.warn("session unban warning:", unban.error.message);
      } else {
        console.log(JSON.stringify({ phase: "sessions", method: "ban-duration-pulse", invalidated: true }, null, 2));
      }
    }
  }
}

const { data: verifyUser, error: verifyError } = await sb.auth.admin.getUserById(OWNER_ID);
if (verifyError) {
  console.error("post-repair getUserById failed:", verifyError.message);
  process.exit(1);
}

const repairedMeta = verifyUser.user?.user_metadata || {};
console.log(
  JSON.stringify(
    {
      phase: "complete",
      dryRun: DRY_RUN,
      migration,
      remainingMetadataKeys: Object.keys(repairedMeta),
      remainingMetadataBytes: byteSize(repairedMeta),
      musicDataStillPresent: Object.prototype.hasOwnProperty.call(repairedMeta, "musicData"),
      note: DRY_RUN
        ? "Dry run only. Re-run without --dry-run to apply."
        : "Repair applied. Sign in again and verify /auth/v1/user returns 200 with a normal-sized JWT.",
    },
    null,
    2,
  ),
);
