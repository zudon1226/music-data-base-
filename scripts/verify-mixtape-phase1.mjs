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

function expectFile(relativePath, label) {
    if (!fs.existsSync(path.join(root, relativePath))) failures.push(`${label} (${relativePath})`);
}

const foundation = "supabase/migrations/202611181000_mixtape_phase1_foundation.sql";
const storage = "supabase/migrations/202611181001_mixtape_storage_bucket.sql";

expectFile(foundation, "Mixtape foundation migration missing");
expectFile(storage, "Mixtape storage migration missing");
expectFile(
    "supabase/migrations/202611201430_mixtape_reports_moderation_audit.sql",
    "Mixtape report moderation audit migration missing",
);
expectFile("lib/mixtape-play-threshold.shared.mjs", "Mixtape play threshold helper missing");
expectFile("lib/mixtape-play-threshold.test.mjs", "Mixtape play threshold test missing");
expectFile("lib/mixtape-playback-engagement.shared.mjs", "Mixtape playback engagement helper missing");
expectFile("lib/mixtape-playback-engagement.test.mjs", "Mixtape playback engagement test missing");
expectFile("docs/mixtape-phase1-dj-provisioning.md", "DJ provisioning doc missing");

const tables = [
    "mixtape_categories",
    "mixtapes",
    "mixtape_tracks",
    "mixtape_favorites",
    "mixtape_playback_sessions",
    "mixtape_plays",
    "mixtape_reports",
];

for (const table of tables) {
    expect(foundation, new RegExp(`create table if not exists public\\.${table}`, "i"), `${table} table missing`);
    expect(foundation, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} RLS missing`);
}

expect(foundation, /public\.can_create_mixtapes/i, "can_create_mixtapes missing");
expect(foundation, /can_upload_creator_content\(check_user_id\)/i, "Artist/producer gate must reuse can_upload_creator_content");
expect(foundation, /'dj', 'founding_dj'/i, "DJ role eligibility missing");
expect(foundation, /approval_status = 'approved'/i, "DJ must require founding approval");
expect(foundation, /begin_mixtape_playback_session/i, "Playback session begin RPC missing");
expect(foundation, /advance_mixtape_playback_session/i, "Playback session advance RPC missing");
expect(foundation, /record_mixtape_qualified_play/i, "Qualified play RPC missing");
expect(foundation, /unique \(track_id, user_id, playback_session_id\)/, "Session play dedup constraint missing");
expect(foundation, /mixtape_play_qualification_threshold/i, "Play threshold function missing");
expect(foundation, /enforce_mixtape_track_publish_duration/i, "Publish duration trigger missing");
expect(foundation, /revoke insert, update, delete[\s\S]*mixtapes from authenticated/i, "Mixtape API-only mutation boundary missing");
expect(foundation, /mixtapes_public_read/i, "Guest published read policy missing");
expect(foundation, /mixtapes_owner_read/i, "Owner draft read policy missing");
expect(foundation, /mixtape_tracks_public_read/i, "Track public read policy missing");
forbid(foundation, /grant insert on table public\.mixtapes to authenticated/i, "Authenticated must not receive direct mixtape insert grants");
expect(foundation, /revoke all on function public\.record_mixtape_qualified_play[\s\S]*authenticated/i, "Play RPC must stay service_role");
expect(foundation, /grant execute on function public\.record_mixtape_qualified_play\(uuid, uuid\) to service_role/i, "Play RPC service_role grant missing");

expect(foundation, /split_part\(storage_path, '\/', 1\) = user_id::text/i, "Track storage ownership segment missing");
expect(foundation, /split_part\(storage_path, '\/', 3\) = 'tracks'/i, "Track storage tracks segment missing");
expect(foundation, /split_part\(cover_storage_path, '\/', 1\) = user_id::text/i, "Cover storage ownership segment missing");

expect(storage, /'mixtapes'/i, "Mixtapes bucket missing");
expect(storage, /public = excluded\.public[\s\S]*false/, "Mixtapes bucket must stay private");
expect(storage, /'mixtapes'/i, "Storage boundary must include mixtapes");
expect(storage, /app_bucket_select_boundary_v2[\s\S]*'mixtapes'/i, "Select boundary must gate mixtapes");
expect(storage, /app_private_bucket_owner_insert_v2[\s\S]*'mixtapes'/i, "Private owner insert must include mixtapes");
{
    const storageSource = read(storage);
    const publicReadBlock = storageSource.match(
        /app_public_bucket_read_v2[\s\S]*?app_public_bucket_owner_insert_v2/,
    );
    if (publicReadBlock && /'mixtapes'/.test(publicReadBlock[0])) {
        failures.push(`Mixtapes must not be public-read (${storage})`);
    }
}

function compareStoragePolicyParity() {
    const baselinePath = "supabase/migrations/202609131001_align_launch_rls_grant_catalog.sql";
    if (!fs.existsSync(path.join(root, baselinePath))) {
        failures.push(`Baseline storage migration missing for parity check (${baselinePath})`);
        return;
    }
    const baseline = read(baselinePath);
    const mixtapeSource = read(storage);
    const publicRead =
        /bucket_id in \(\s*'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'\s*\)/;
    if (!publicRead.test(baseline) || !publicRead.test(mixtapeSource)) {
        failures.push("Public bucket read list must match baseline pattern");
    }
    const publicReadBlock = mixtapeSource.match(
        /app_public_bucket_read_v2[\s\S]*?app_public_bucket_owner_insert_v2/,
    );
    if (publicReadBlock && /'mixtapes'/.test(publicReadBlock[0])) {
        failures.push(`mixtapes must not appear in public read policy (${storage})`);
    }
    if (!mixtapeSource.includes("'podcast-audio', 'podcast-video', 'mixtapes'")) {
        failures.push("mixtapes must be listed with other private owner buckets");
    }
}

compareStoragePolicyParity();

if (failures.length) {
    console.error("verify-mixtape-phase1.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-mixtape-phase1.mjs: ok");