import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
    path.join(root, "supabase/migrations/202610211200_storage_moderation_catalog_read_gate.sql"),
    "utf8",
);

assert.match(migration, /moderation_state = 'clear'/);
assert.match(migration, /trim\(both '\/' from coalesce\(s\.storage_path/);
assert.match(migration, /trim\(both '\/' from coalesce\(v\.storage_path/);
assert.doesNotMatch(migration, /like\s+'%/i, "must not use substring LIKE path matching");
assert.match(migration, /set public = false[\s\S]*where name in \('songs', 'videos'\)/);
assert.match(migration, /storage_catalog_object_may_be_read/);
assert.match(migration, /total_count = 1 and clear_count = 1/);
assert.match(migration, /drop policy if exists app_bucket_platform_admin_full_access on storage\.objects/);
assert.match(migration, /drop policy if exists "Music Data Base public read videos" on storage\.objects/);
assert.match(migration, /drop policy if exists "Anyone can read songs" on storage\.objects/);
assert.doesNotMatch(migration, /like\s+'%/i, "must not use substring LIKE path matching");
assert.match(migration, /drop policy if exists app_public_bucket_read on storage\.objects/);
assert.match(migration, /app_bucket_select_boundary_v2/);

const adminMigration = readFileSync(
    path.join(root, "supabase/migrations/202610211300_storage_admin_moderated_select.sql"),
    "utf8",
);

assert.match(adminMigration, /drop policy if exists app_bucket_platform_admin_full_access on storage\.objects/);
assert.match(adminMigration, /drop policy if exists app_bucket_platform_admin_full_access_v2/);
assert.match(adminMigration, /drop policy if exists app_platform_admin_songs_videos_manage_v2/);
assert.match(adminMigration, /drop policy if exists app_platform_admin_songs_videos_update_v2/);
assert.match(adminMigration, /drop policy if exists app_platform_admin_songs_videos_delete_v2/);
assert.match(adminMigration, /app_platform_admin_songs_videos_manage_v2/);
const adminAllPolicy = adminMigration.slice(
    adminMigration.indexOf("create policy app_bucket_platform_admin_full_access_v2"),
    adminMigration.indexOf("create policy app_platform_admin_songs_videos_manage_v2"),
);
assert.doesNotMatch(adminAllPolicy, /'songs'/, "admin ALL must not include songs bucket");
assert.doesNotMatch(adminAllPolicy, /'videos'/, "admin ALL must not include videos bucket");

console.log("storage-migration-read-gate tests passed.");
