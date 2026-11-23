/**
 * Staging-only Phase 28 fixtures for E2E artist (no ownership reassignment of 07fdeef9 fixture).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const ROLL_CALL_ID = "497b9cfd-e752-4060-9528-5134a2ff7f37";
export const PHASE28_E2E_ARTIST_ID = "f0502a2e-d27b-42fc-99ee-78dddcf89fe0";
export const PHASE28_E2E_PUBLIC_SONG_ID = "a8c41f12-3e4b-4f20-9d8e-1028e2e00001";
export const PHASE28_E2E_DRAFT_SONG_ID = "b9d52a23-4f5c-4011-ae9f-2028e2e00002";

function parseEnv(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 1) continue;
        env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return env;
}

const env = parseEnv(join(root, ".env.staging.local"));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!supabaseUrl.includes(STAGING_REF) || !serviceKey) {
    console.error("FAIL staging env");
    process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const { data: template } = await admin
    .from("songs")
    .select("audio_url,storage_path,cover_url,avatar_url,duration,type,category")
    .eq("streaming_enabled", true)
    .neq("id", ROLL_CALL_ID)
    .limit(1)
    .maybeSingle();

if (!template?.storage_path) {
    console.error("FAIL no template song on staging");
    process.exit(1);
}

const publicRow = {
    ...template,
    id: PHASE28_E2E_PUBLIC_SONG_ID,
    title: "Phase28 E2E Artist Public",
    artist: "MDB Phase28 E2E",
    user_id: PHASE28_E2E_ARTIST_ID,
    streaming_enabled: true,
    ringtone_enabled: false,
    plays: 0,
    likes: 0,
};

const draftRow = {
    ...template,
    id: PHASE28_E2E_DRAFT_SONG_ID,
    title: "Phase28 E2E Artist Draft",
    artist: "MDB Phase28 E2E",
    user_id: PHASE28_E2E_ARTIST_ID,
    streaming_enabled: false,
    ringtone_enabled: false,
    plays: 0,
    likes: 0,
};

for (const row of [publicRow, draftRow]) {
    const { error } = await admin.from("songs").upsert(row, { onConflict: "id" });
    if (error) {
        console.error(`FAIL upsert song ${String(row.id).slice(0, 8)}: ${error.message.slice(0, 120)}`);
        process.exit(1);
    }
}
await admin
    .from("songs")
    .update({ streaming_enabled: false, ringtone_enabled: false })
    .eq("id", PHASE28_E2E_DRAFT_SONG_ID);
await admin
    .from("songs")
    .update({ streaming_enabled: true, ringtone_enabled: false })
    .eq("id", PHASE28_E2E_PUBLIC_SONG_ID);

const { data: catalogPublic } = await admin
    .from("songs")
    .select("id")
    .eq("streaming_enabled", true)
    .neq("id", ROLL_CALL_ID)
    .limit(1)
    .maybeSingle();

if (catalogPublic?.id) {
    await admin.from("library_saves").upsert(
        {
            user_id: PHASE28_E2E_ARTIST_ID,
            item_id: catalogPublic.id,
            item_type: "song",
        },
        { onConflict: "user_id,item_id,item_type" },
    );
    await admin.from("library_saves").upsert(
        {
            user_id: PHASE28_E2E_ARTIST_ID,
            item_id: PHASE28_E2E_PUBLIC_SONG_ID,
            item_type: "song",
        },
        { onConflict: "user_id,item_id,item_type" },
    );
}

console.log("provision-phase28-staging-fixtures PASS");
console.log(`  e2e_artist_prefix=${PHASE28_E2E_ARTIST_ID.slice(0, 8)}…`);
console.log(`  e2e_public_prefix=${PHASE28_E2E_PUBLIC_SONG_ID.slice(0, 8)}…`);
console.log(`  e2e_draft_prefix=${PHASE28_E2E_DRAFT_SONG_ID.slice(0, 8)}…`);