/**
 * Final verification sweep for owner Auth metadata repair.
 * Never prints passwords, tokens, or full metadata values.
 *
 * Optional: set OWNER_LOGIN_PASSWORD in .env.local for live login checks.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const OWNER_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";
const OWNER_EMAIL = "zudon1226@gmail.com";
const NORMAL_JWT_MAX_BYTES = 8_000; // normal access tokens are usually ~1–3 KB

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

function result(name, pass, detail) {
  return { name, pass: Boolean(pass), detail };
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const password = env.OWNER_LOGIN_PASSWORD || env.ZUDON_LOGIN_PASSWORD || "";

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];

// --- Auth metadata / admin / PostgreSQL ---
const { data: userPack, error: userErr } = await admin.auth.admin.getUserById(OWNER_ID);
const user = userPack?.user;
const meta = (user?.user_metadata || {});
const metaKeys = Object.keys(meta);
const forbidden = [
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
];
const hasAppDataInMeta = forbidden.some((k) => meta[k] != null);
const metaBytes = byteSize(meta);

results.push(
  result(
    "7_no_app_data_in_user_metadata",
    !userErr && !hasAppDataInMeta && metaBytes < 1000,
    {
      metadataKeys: metaKeys,
      metadataBytes: metaBytes,
      forbiddenPresent: forbidden.filter((k) => meta[k] != null),
      error: userErr?.message || null,
    },
  ),
);

const { data: profile } = await admin
  .from("profiles")
  .select("account_type,is_admin,display_name")
  .or(`id.eq.${OWNER_ID},user_id.eq.${OWNER_ID}`)
  .maybeSingle();
const { data: roles } = await admin
  .from("user_roles")
  .select("role,status")
  .eq("user_id", OWNER_ID);
const emailOwner = String(user?.email || "").toLowerCase() === OWNER_EMAIL;
const adminIntact =
  emailOwner &&
  (profile?.is_admin === true || profile?.account_type === "admin") &&
  (roles || []).some((r) => r.role === "admin" && r.status === "active");

results.push(
  result("5_owner_admin_permissions", adminIntact, {
    emailMatches: emailOwner,
    profileAccountType: profile?.account_type || null,
    profileIsAdmin: profile?.is_admin ?? null,
    roles: roles || [],
  }),
);

const { count: songsCount } = await admin
  .from("songs")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { count: videosCount } = await admin
  .from("videos")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { data: ums } = await admin
  .from("user_music_state")
  .select("library_ids,playlists,recently_played,active_playlist_id")
  .eq("user_id", OWNER_ID)
  .maybeSingle();
const { count: likesCount } = await admin
  .from("song_likes")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { count: libsCount } = await admin
  .from("library_saves")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { count: followsCount } = await admin
  .from("artist_follows")
  .select("*", { count: "exact", head: true })
  .eq("user_id", OWNER_ID);
const { data: producer } = await admin
  .from("producer_profiles")
  .select("id,user_id")
  .eq("user_id", OWNER_ID)
  .maybeSingle();
const { data: artistish } = await admin
  .from("profiles")
  .select("id,user_id,account_type")
  .or(`id.eq.${OWNER_ID},user_id.eq.${OWNER_ID}`)
  .maybeSingle();

const appStateOk =
  (songsCount ?? 0) > 0 &&
  (videosCount ?? 0) >= 0 &&
  Boolean(ums) &&
  Array.isArray(ums.playlists) &&
  Array.isArray(ums.library_ids) &&
  (likesCount ?? 0) > 0 &&
  (libsCount ?? 0) > 0 &&
  (followsCount ?? 0) > 0;

results.push(
  result("6_app_features_data_intact", appStateOk, {
    songsOwned: songsCount ?? 0,
    videosOwned: videosCount ?? 0,
    playlists: Array.isArray(ums?.playlists) ? ums.playlists.length : 0,
    libraryIds: Array.isArray(ums?.library_ids) ? ums.library_ids.length : 0,
    recentlyPlayed: Array.isArray(ums?.recently_played) ? ums.recently_played.length : 0,
    favorites: likesCount ?? 0,
    librarySaves: libsCount ?? 0,
    followers: followsCount ?? 0,
    producerProfilePresent: Boolean(producer?.id),
    profilePresent: Boolean(artistish?.id),
    whitelistEmail: OWNER_EMAIL,
  }),
);

results.push(
  result(
    "8_app_state_in_postgresql_only",
    !hasAppDataInMeta && appStateOk,
    {
      authHasAppCollections: hasAppDataInMeta,
      postgresCollectionsPresent: {
        user_music_state: Boolean(ums),
        song_likes: (likesCount ?? 0) > 0,
        library_saves: (libsCount ?? 0) > 0,
        artist_follows: (followsCount ?? 0) > 0,
        songs: (songsCount ?? 0) > 0,
        videos: (videosCount ?? 0) >= 0,
      },
    },
  ),
);

// --- Live login path ---
let loginStatus = null;
let getUserStatus = null;
let jwtBytes = null;
let saw520 = false;
let loginMethod = "password";

async function mintOwnerAccessToken() {
  if (password) {
    const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: OWNER_EMAIL, password }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    return {
      method: "password",
      status: tokenRes.status,
      accessToken: typeof tokenJson.access_token === "string" ? tokenJson.access_token : "",
      error: tokenJson.error_description || tokenJson.msg || null,
    };
  }

  // Password not available: mint a one-time session via Admin magiclink + verifyOtp.
  // Does not change the user's password or UUID.
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: OWNER_EMAIL,
  });
  if (link.error) {
    return { method: "magiclink", status: 0, accessToken: "", error: link.error.message };
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) {
    return { method: "magiclink", status: 0, accessToken: "", error: "hashed_token missing" };
  }

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (verified.error || !verified.data.session?.access_token) {
    // Some GoTrue versions expect type magiclink
    const verified2 = await anonClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (verified2.error || !verified2.data.session?.access_token) {
      return {
        method: "magiclink",
        status: 0,
        accessToken: "",
        error: verified2.error?.message || verified.error?.message || "verifyOtp failed",
      };
    }
    return {
      method: "magiclink",
      status: 200,
      accessToken: verified2.data.session.access_token,
      error: null,
    };
  }
  return {
    method: "magiclink",
    status: 200,
    accessToken: verified.data.session.access_token,
    error: null,
  };
}

const minted = await mintOwnerAccessToken();
loginMethod = minted.method;
loginStatus = minted.status;
const accessToken = minted.accessToken || "";
jwtBytes = accessToken ? Buffer.byteLength(accessToken, "utf8") : null;
if (loginStatus === 520) saw520 = true;

results.push(
  result("1_login_success", loginStatus === 200 && Boolean(accessToken), {
    method: loginMethod,
    tokenStatus: loginStatus,
    hasAccessToken: Boolean(accessToken),
    error: minted.error,
  }),
);

if (accessToken) {
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  getUserStatus = userRes.status;
  if (userRes.status === 520) saw520 = true;
  const userBody = await userRes.json().catch(() => ({}));
  const returnedMeta = userBody?.user_metadata || userBody?.user?.user_metadata || {};
  results.push(
    result("2_get_user_http_200", userRes.status === 200, {
      status: userRes.status,
      returnedMetadataKeys: Object.keys(returnedMeta),
    }),
  );
} else {
  results.push(result("2_get_user_http_200", false, { status: null, reason: "no access token" }));
}

results.push(
  result("3_no_520_responses", !saw520 && loginStatus !== 520 && getUserStatus !== 520, {
    tokenStatus: loginStatus,
    getUserStatus,
  }),
);

results.push(
  result(
    "4_jwt_size_normal",
    typeof jwtBytes === "number" && jwtBytes > 0 && jwtBytes < NORMAL_JWT_MAX_BYTES,
    { accessTokenBytes: jwtBytes, limit: NORMAL_JWT_MAX_BYTES, priorBloatedApprox: 110_000 },
  ),
);

console.log(
  JSON.stringify(
    {
      ownerId: OWNER_ID,
      ownerEmail: OWNER_EMAIL,
      results,
      summary: {
        pass: results.filter((r) => r.pass).length,
        fail: results.filter((r) => !r.pass).length,
      },
    },
    null,
    2,
  ),
);

process.exit(results.every((r) => r.pass) ? 0 : 1);
