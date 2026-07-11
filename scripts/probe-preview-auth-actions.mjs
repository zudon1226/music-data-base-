/**
 * Preview auth + protected action probe (no secrets printed).
 * Creates ephemeral test user, signs in, calls protected APIs on preview host.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PREVIEW_HOST = "https://music-data-base-ho0khj8j5-zudon1226-5137s-projects.vercel.app";

function readEnv(name) {
    const text = readFileSync(".env.local", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    if (!line) return "";
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = `preview-probe-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;

const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function probeRequest(label, path, method, body, accessToken) {
    const url = `${PREVIEW_HOST}${path}`;
    const headers = {
        "Content-Type": "application/json",
        apikey: anonKey,
    };
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
    });
    const text = await response.text();
    let responseBody = text;
    try {
        responseBody = JSON.stringify(JSON.parse(text));
    }
    catch {
        // keep raw
    }
    return {
        action: label,
        requestUrl: url,
        httpStatus: response.status,
        responseBody: responseBody.slice(0, 500),
        authorizationPresent: accessToken ? "YES" : "NO",
        apikeyPresent: "YES",
    };
}

console.log("=== AUTH BOOTSTRAP PROBE ===");
console.log("signup_email", email.replace(/@.*/, "@***"));

const signUp = await supabase.auth.signUp({ email, password });
if (signUp.error) {
    console.log("SIGNUP_FAILED", signUp.error.message);
    process.exit(1);
}

const signIn = await supabase.auth.signInWithPassword({ email, password });
if (signIn.error || !signIn.data.session) {
    console.log("SIGNIN_FAILED", signIn.error?.message || "no session");
    process.exit(1);
}

const session = signIn.data.session;
const accessToken = session.access_token || "";
const refreshToken = session.refresh_token || "";
const userId = session.user?.id || "";

console.log("SESSION_FOUND", {
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    hasUserId: Boolean(userId),
    accessTokenPrefix: accessToken.slice(0, 12),
});

if (!accessToken) console.log("TOKEN READY FAILED: missing access token");
else if (!refreshToken) console.log("TOKEN READY FAILED: missing refresh token");
else if (!userId) console.log("TOKEN READY FAILED: missing user id");
else console.log("TOKEN READY", { userId });

const actions = [
    ["Like", "/api/song-likes", "POST", { songId: "00000000-0000-4000-8000-000000000001", like: true, userId, user_id: userId }],
    ["Save", "/api/library/save", "POST", { item_id: "00000000-0000-4000-8000-000000000001", item_type: "song", userId, user_id: userId }],
    ["Follow", "/api/artist-follow", "POST", { artistId: "test-artist", artistName: "Test Artist", follow: true, userId, user_id: userId }],
    ["Playlist", "/api/playlists", "POST", { id: crypto.randomUUID(), name: "Probe Playlist", cover: "", playlistType: "song", userId, user_id: userId }],
    ["Upload", "/api/video-upload", "POST", { sessionUserId: userId, userId, title: "probe", storagePath: "probe/path.mp4" }],
    ["Library", `/api/library-saves?userId=${encodeURIComponent(userId)}`, "GET", null],
];

console.log("\n=== PROTECTED ACTION RESULTS ===");
for (const [label, path, method, body] of actions) {
    const result = await probeRequest(label, path, method, body, accessToken);
    console.log(JSON.stringify(result, null, 2));
    if (result.httpStatus >= 400 || result.authorizationPresent === "NO") {
        console.log("\nFIRST_FAILURE", label);
        process.exit(2);
    }
}

console.log("\nALL_ACTIONS_HTTP_OK");
