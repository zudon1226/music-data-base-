/**
 * Direct Supabase RLS checks (anon + authenticated only; not service role).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import {
    PHASE28_E2E_ARTIST_ID,
    PHASE28_E2E_DRAFT_SONG_ID,
    PHASE28_E2E_PUBLIC_SONG_ID,
} from "./provision-phase28-staging-fixtures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";

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

let fails = 0;
function pass(msg) {
    console.log(`PASS ${msg}`);
}
function fail(msg) {
    console.error(`FAIL ${msg}`);
    fails += 1;
}

const env = parseEnv(join(root, ".env.staging.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
if (!url.includes(STAGING_REF)) {
    fail("staging ref");
    process.exit(1);
}

const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const admin = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const { data: anonDraft, error: anonDraftErr } = await anon
    .from("songs")
    .select("id")
    .eq("id", PHASE28_E2E_DRAFT_SONG_ID);
if (anonDraftErr) {
    fail(`anon draft select error: ${anonDraftErr.message.slice(0, 80)}`);
} else if (!anonDraft?.length) {
    pass("anon cannot read private draft");
} else {
    fail("anon read private draft");
}

const { data: anonPublic, error: anonPublicErr } = await anon
    .from("songs")
    .select("id")
    .eq("id", PHASE28_E2E_PUBLIC_SONG_ID);
if (anonPublicErr) {
    fail(`anon public select: ${anonPublicErr.message.slice(0, 80)}`);
} else if (anonPublic?.length === 1) {
    pass("anon can read public streaming song");
} else {
    fail("anon cannot read public streaming song");
}

const { error: anonPlayWrite } = await anon.from("song_play_qualified_events").insert({
    song_id: PHASE28_E2E_PUBLIC_SONG_ID,
    listener_key: "anon:probe",
    playback_session_id: "c0000000-0000-4000-8000-000000000001",
});
if (anonPlayWrite) {
    pass("anon cannot insert play events");
} else {
    fail("anon inserted play events");
}

loadMixtapeStagingE2eCredentialsFromFile();
const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
if (!email || !password) {
    console.log("BLOCKED authenticated RLS — creds missing");
} else {
    const authed = createClient(url, anonKey, { auth: { persistSession: false } });
    const login = await authed.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) {
        fail("creator sign-in");
    } else {
        const creator = createClient(url, anonKey, { auth: { persistSession: false } });
        await creator.auth.setSession({
            access_token: login.data.session.access_token,
            refresh_token: login.data.session.refresh_token,
        });
        const { data: ownDraft } = await creator.from("songs").select("id").eq("id", PHASE28_E2E_DRAFT_SONG_ID);
        if (ownDraft?.length === 1) {
            pass("owner reads own draft");
        } else {
            fail("owner cannot read own draft");
        }
        if (!admin) {
            console.log("BLOCKED peer draft RLS — service key unavailable for fixture setup");
        } else {
        const { data: template } = await admin
            .from("songs")
            .select("id,user_id")
            .eq("streaming_enabled", true)
            .neq("user_id", PHASE28_E2E_ARTIST_ID)
            .limit(1)
            .maybeSingle();
        if (template?.id) {
            await admin.from("songs").update({ streaming_enabled: false }).eq("id", template.id);
            const { data: peerDraft } = await creator.from("songs").select("id").eq("id", template.id);
            if (!peerDraft?.length) {
                pass("creator cannot read another owners draft");
            } else {
                fail("creator read peer draft");
            }
            await admin.from("songs").update({ streaming_enabled: true }).eq("id", template.id);
        } else {
            console.log("BLOCKED peer draft RLS — no foreign-owned song on staging");
        }
        }
    }
}

if (fails) {
    console.log("\nverify-phase28h-songs-rls.mjs FAIL");
    process.exit(1);
}
console.log("\nverify-phase28h-songs-rls.mjs PASS");