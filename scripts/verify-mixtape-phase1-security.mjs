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

function forbid(relativePath, pattern, label) {
    const source = read(relativePath);
    if (pattern.test(source)) failures.push(`${label} (${relativePath})`);
}

const foundation = "supabase/migrations/202611181000_mixtape_phase1_foundation.sql";

expect(foundation, /can_upload_creator_content\(check_user_id\)/, "Artists/producers must use verified creator gate");
expect(
    foundation,
    /if not v_approved then\s+return false;\s+end if;[\s\S]*'dj', 'founding_dj'/,
    "DJ eligibility must require founding approval before dj role checks",
);
expect(foundation, /mixtape_playback_sessions/, "Playback sessions table required");
expect(foundation, /begin_mixtape_playback_session/, "Session begin RPC required");
expect(foundation, /advance_mixtape_playback_session/, "Session advance RPC required");
expect(foundation, /playback_session_id uuid/, "Plays must reference playback sessions");
expect(foundation, /unique \(track_id, user_id, playback_session_id\)/, "Session-scoped dedup required");
expect(
    foundation,
    /on conflict on constraint mixtape_plays_track_id_user_id_playback_session_id_key do nothing/,
    "Concurrent duplicate play inserts must no-op",
);
expect(foundation, /enforce_mixtape_track_publish_duration/, "Published tracks must enforce duration metadata");
expect(
    foundation,
    /record_mixtape_qualified_play\(\s*playback_session_id uuid,\s*caller_user_id uuid/,
    "Qualified play must use session + caller, not client-reported duration",
);
forbid(
    foundation,
    /record_mixtape_qualified_play\([\s\S]*reported_listened_seconds/,
    "Qualified play must not accept client-reported listening seconds",
);
forbid(
    foundation,
    /record_mixtape_qualified_play\([\s\S]*listener_user_id uuid,\s*reported/,
    "Qualified play must not bind arbitrary listener id without session",
);
expect(foundation, /s\.user_id = caller_user_id/, "Playback RPCs must reject unauthorized listener identity");
expect(foundation, /last_progress_at timestamptz/, "Playback sessions must track last progress timestamp");
expect(foundation, /mixtape_playback_session_max_tick_seconds/, "Wall-clock tick cap required");
expect(
    foundation,
    /advance_mixtape_playback_session\(\s*playback_session_id uuid,\s*caller_user_id uuid\s*\)/,
    "Advance RPC must not accept client-reported elapsed seconds",
);
expect(foundation, /extract\(epoch from \(v_now - v_last_progress_at\)\)/, "Advance must use server wall-clock delta");
expect(foundation, /for update of s/, "Concurrent qualify/advance must lock sessions");
expect(foundation, /set search_path = public, auth/, "can_create_mixtapes must pin search_path");
expect(
    foundation,
    /record_mixtape_qualified_play[\s\S]*security definer[\s\S]*set search_path = public/,
    "Play RPC must pin search_path",
);
forbidServiceRoleExposure(foundation);

function forbidServiceRoleExposure(relativePath) {
    const source = read(relativePath);
    const engagementFns = [
        "begin_mixtape_playback_session",
        "advance_mixtape_playback_session",
        "record_mixtape_qualified_play",
    ];
    for (const fn of engagementFns) {
        if (
            /grant execute on function public\.${fn}\([^)]+\)\s+to\s+[^;]*\bauthenticated\b/i.test(
                source,
            )
        ) {
            failures.push(`Engagement RPC must not grant execute to authenticated: ${fn} (${relativePath})`);
        }
    }
}

expect("docs/mixtape-phase1-dj-provisioning.md", /founding_members/, "DJ provisioning doc missing");
expect("docs/mixtape-phase1-dj-provisioning.md", /not client-writable/i, "DJ doc must state roles are server-side");
expect("supabase/migrations/202611181001_mixtape_storage_bucket.sql", /mixtapes[\s\S]*false/, "Mixtapes bucket must stay private");

if (failures.length) {
    console.error("verify-mixtape-phase1-security.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-mixtape-phase1-security.mjs: ok");