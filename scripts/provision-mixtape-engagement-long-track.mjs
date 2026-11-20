/**
 * Staging-only: published mixtape with real ~65s + 10s audio for browser engagement.
 * Uses .env.staging.local + E2E artist id (no passwords logged).
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_ENV_FILE = ".env.staging.local";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const E2E_ARTIST_ID = "f0502a2e-d27b-42fc-99ee-78dddcf89fe0";
const evidenceDir = join(root, "tmp-mixtape-approved-e2e");
const mediaDir = join(evidenceDir, "engagement-media");
const FIXTURE_PATH = join(evidenceDir, "engagement-long-fixture.json");
mkdirSync(mediaDir, { recursive: true });

const runToken = randomBytes(4).toString("hex");
const TITLE = `mdb-engagement-long-${runToken}`;

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function refFromUrl(url) {
    const m = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return m ? m[1].toLowerCase() : "";
}

function decodeJwtRef(token) {
    if (!token || !token.includes(".")) return "";
    try {
        return String(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).ref || "");
    } catch {
        return "";
    }
}

function assertStagingApiIdentity(env) {
    const urlRef = refFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || "");
    const anonRef = decodeJwtRef(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    const serviceRef = decodeJwtRef(env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (urlRef === PRODUCTION_REF || anonRef === PRODUCTION_REF || serviceRef === PRODUCTION_REF) {
        throw new Error("Production Supabase ref detected — abort");
    }
    if (urlRef !== STAGING_REF || anonRef !== STAGING_REF || serviceRef !== STAGING_REF) {
        throw new Error("Staging API identity mismatch");
    }
}

function buildAudio(outPath, seconds) {
    if (!ffmpegPath) throw new Error("ffmpeg-static missing");
    execFileSync(ffmpegPath, [
        "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-q:a", "9", "-acodec", "libmp3lame", outPath,
    ], { stdio: "pipe" });
}

async function main() {
    const stagingPath = join(root, STAGING_ENV_FILE);
    if (!existsSync(stagingPath)) throw new Error(`${STAGING_ENV_FILE} required`);
    const staging = parseEnvFile(stagingPath);
    assertStagingApiIdentity(staging);
    const ref = refFromUrl(staging.NEXT_PUBLIC_SUPABASE_URL);
    if (ref !== STAGING_REF) throw new Error(`ref=${ref} not staging`);
    const serviceKey = staging.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!serviceKey || !staging.NEXT_PUBLIC_SUPABASE_URL) throw new Error("supabase staging keys missing");

    const longMp3 = join(mediaDir, `${TITLE}-65s.mp3`);
    const shortMp3 = join(mediaDir, `${TITLE}-10s.mp3`);
    buildAudio(longMp3, 65);
    buildAudio(shortMp3, 10);
    const longDur = 65;
    const shortDur = 10;

    const mixtapeId = randomUUID();
    const longTrackId = randomUUID();
    const shortTrackId = randomUUID();
    const longPath = `${E2E_ARTIST_ID}/${mixtapeId}/tracks/${randomUUID()}-${TITLE}-65s.mp3`;
    const shortPath = `${E2E_ARTIST_ID}/${mixtapeId}/tracks/${randomUUID()}-${TITLE}-10s.mp3`;

    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const longBlob = readFileSync(longMp3);
    const shortBlob = readFileSync(shortMp3);
    const up1 = await admin.storage.from("mixtapes").upload(longPath, longBlob, { contentType: "audio/mpeg", upsert: true });
    const up2 = await admin.storage.from("mixtapes").upload(shortPath, shortBlob, { contentType: "audio/mpeg", upsert: true });
    if (up1.error || up2.error) throw new Error("storage upload failed");

    const now = new Date().toISOString();
    const mixtapeInsert = await admin.from("mixtapes").insert({
        id: mixtapeId,
        user_id: E2E_ARTIST_ID,
        title: TITLE,
        description: "Browser engagement long audio (staging-only)",
        genre: "Audit",
        status: "published",
        moderation_state: "clear",
        published_at: now,
    });
    if (mixtapeInsert.error) throw mixtapeInsert.error;
    const tracksInsert = await admin.from("mixtape_tracks").insert([
        {
            id: longTrackId,
            mixtape_id: mixtapeId,
            user_id: E2E_ARTIST_ID,
            position: 1,
            title: `${TITLE}-65s`,
            storage_path: longPath,
            file_name: `${TITLE}-65s.mp3`,
            mime_type: "audio/mpeg",
            file_size: longBlob.length,
            duration_seconds: longDur,
            status: "published",
            moderation_state: "clear",
            published_at: now,
        },
        {
            id: shortTrackId,
            mixtape_id: mixtapeId,
            user_id: E2E_ARTIST_ID,
            position: 2,
            title: `${TITLE}-10s`,
            storage_path: shortPath,
            file_name: `${TITLE}-10s.mp3`,
            mime_type: "audio/mpeg",
            file_size: shortBlob.length,
            duration_seconds: shortDur,
            status: "published",
            moderation_state: "clear",
            published_at: now,
        },
    ]);
    if (tracksInsert.error) throw tracksInsert.error;

    const fixture = {
        createdAt: new Date().toISOString(),
        title: TITLE,
        mixtapeId,
        longTrackId,
        shortTrackId,
        longDurationSeconds: longDur,
        shortDurationSeconds: shortDur,
        detailUrl: `http://localhost:3003/mixtape/${mixtapeId}`,
        ownerUserId: E2E_ARTIST_ID,
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
    console.log(`Fixture: ${FIXTURE_PATH}`);
    console.log(`mixtapeId=${mixtapeId} longDur=${longDur}s`);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});