/**
 * Video-only Creator account wiring (static + capability matrix).
 * Usage: node scripts/verify-video-creator-account.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const page = read("app/page.tsx");
const migration = read("supabase/migrations/202611221200_video_creator_account_type.sql");
const resolved = read("lib/resolved-account-role.ts");
const signup = read("lib/signup-account-type.ts");
const dashboard = read("components/creator/CreatorDashboardWorkspace.tsx");

record("migration defines music vs video upload helpers", migration.includes("can_upload_music_content")
    && migration.includes("can_upload_video_content")
    && migration.includes("founding_creator"));
record("founding_creator in profile constraint", migration.includes("'founding_creator'"));
record("songs RLS uses music gate", migration.includes("can_upload_music_content(auth.uid())")
    && migration.includes("public.songs"));
record("videos RLS uses video gate", migration.includes("can_upload_video_content(auth.uid())")
    && migration.includes("public.videos"));
record("storage restrictive policies for songs/videos", migration.includes("app_songs_insert_music_creator")
    && migration.includes("app_videos_insert_video_creator"));

record("signup grants creator role", signup.includes('accountType === "creator"')
    && signup.includes("founding_creator"));
record("resolver separates video creator", resolved.includes("isVideoCreator")
    && resolved.includes('primaryNormalized === "creator"')
    && resolved.includes('return "creator";'));
record("music/video upload access helpers", resolved.includes("requireMusicUploadAccess")
    && resolved.includes("requireVideoUploadAccess"));

record("Creator Dashboard workspace wired", page.includes("CreatorDashboardWorkspace")
    && page.includes('view === "Creator Dashboard"')
    && page.includes("shouldShowCreatorDashboardControl"));
record("dashboard earnings placeholder locked", dashboard.includes("data-earnings-placeholder")
    && dashboard.includes("Monetization"));

record("upload APIs enforce split gates", read("app/api/upload-audio/route.ts").includes("requireMusicUploadAccess")
    && read("app/api/upload-video/route.ts").includes("requireVideoUploadAccess")
    && read("app/api/video-upload/route.ts").includes("requireVideoUploadAccess")
    && read("app/api/albums/create/route.ts").includes("requireMusicUploadAccess"));

const unitTests = [
    "lib/media-upload-permissions.test.mjs",
    "lib/resolved-account-role-creator.test.mjs",
    "lib/signup-account-type-marker.test.mjs",
];
for (const rel of unitTests) {
    const run = spawnSync(process.execPath, [path.join(root, rel)], { cwd: root, encoding: "utf8" });
  const ok = run.status === 0;
    record(`unit: ${rel}`, ok, ok ? "" : (run.stderr || run.stdout || "").trim().slice(0, 200));
}

const failed = results.filter((row) => !row.ok).length;
console.log(`\nVIDEO_CREATOR_ACCOUNT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);