/**
 * Isolated-database proof for the profile privilege boundary.
 * Refuses any database that is not the local Docker Postgres on 127.0.0.1:54322.
 * Rolls back profile writes. Does not print credentials or emails.
 *
 * Run: node scripts/verify-profile-privilege-lock.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = "supabase_db_music-data-base";
const migrationPath = path.join(root, "supabase/migrations/202610272000_lock_profile_privilege_columns.sql");

function assertLocalPort(port) {
    return new Promise((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port }, () => {
            socket.end();
            resolve();
        });
        socket.on("error", () => reject(new Error(`127.0.0.1:${port} is not open. Refusing to continue.`)));
    });
}

function psql(sql) {
    return execFileSync("docker", [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-c",
        sql,
    ], { encoding: "utf8" });
}

function psqlFile(filePath) {
    const sql = readFileSync(filePath);
    execFileSync("docker", [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
    ], { input: sql });
}

function mustFail(sql, label, pattern = /permission denied|cannot be changed|cannot be set|cannot be granted|row-level security|new row violates/i) {
    try {
        psql(sql);
    } catch (error) {
        const text = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
        if (pattern.test(text)) {
            console.log(`PASS blocked: ${label}`);
            return;
        }
        throw new Error(`${label} failed for an unexpected reason.`);
    }
    throw new Error(`${label} was allowed.`);
}

await assertLocalPort(54322);
await assertLocalPort(54321);
const identity = psql("select inet_server_addr()::text as addr, current_database() as db;");
if (!/postgres/.test(identity)) {
    throw new Error("Refusing to run: database name was not postgres.");
}
console.log("Confirmed local Docker Postgres on 127.0.0.1:54322.");

psqlFile(migrationPath);
console.log("Applied profile privilege migration to the local database.");

const privileges = psql(`
select
  has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE') as update_is_admin,
  has_column_privilege('authenticated', 'public.profiles', 'account_type', 'UPDATE') as update_account_type,
  has_column_privilege('authenticated', 'public.profiles', 'account_type', 'INSERT') as insert_account_type,
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') as update_display_name,
  has_table_privilege('authenticated', 'public.profiles', 'DELETE') as delete_profile,
  has_table_privilege('authenticated', 'public.user_roles', 'INSERT') as insert_role,
  has_column_privilege('service_role', 'public.profiles', 'is_admin', 'UPDATE') as service_update_is_admin;
`);
const flags = privileges.split("\n").map((line) => line.trim()).filter(Boolean);
const dataLine = flags.find((line) => line.startsWith("f") || line.startsWith("t"));
if (!dataLine) throw new Error("Could not read privilege flags.");
const [updateAdmin, updateType, insertType, updateName, deleteProfile, insertRole, serviceAdmin] = dataLine.split("|").map((part) => part.trim());
if (updateAdmin !== "f" || updateType !== "f" || insertType !== "f" || updateName !== "t" || deleteProfile !== "f" || insertRole !== "f" || serviceAdmin !== "t") {
    throw new Error(`Unexpected privileges: ${dataLine}`);
}
console.log("PASS column privileges: clients cannot write is_admin or account_type; display_name remains editable; service_role can update is_admin.");

const listener = psql(`
select id::text
from public.profiles
where coalesce(is_admin, false) = false
  and coalesce(account_type, '') <> 'admin'
limit 1;
`).split("\n").map((line) => line.trim()).find((line) => /^[0-9a-f-]{36}$/i.test(line));
if (!listener) throw new Error("No ordinary local profile was available for the rollback test.");

const claims = JSON.stringify({ sub: listener, role: "authenticated" }).replace(/'/g, "''");
mustFail(`
begin;
select set_config('request.jwt.claims', '${claims}', true);
set local role authenticated;
update public.profiles set is_admin = true where id = '${listener}';
rollback;
`, "authenticated is_admin update");

mustFail(`
begin;
select set_config('request.jwt.claims', '${claims}', true);
set local role authenticated;
update public.profiles set account_type = 'admin' where id = '${listener}';
rollback;
`, "authenticated account_type update");

mustFail(`
begin;
select set_config('request.jwt.claims', '${claims}', true);
set local role authenticated;
insert into public.user_roles (user_id, role, status)
values ('${listener}', 'admin', 'active');
rollback;
`, "authenticated admin role insert");

psql(`
begin;
select set_config('request.jwt.claims', '${claims}', true);
set local role authenticated;
update public.profiles set display_name = display_name where id = '${listener}';
rollback;
`);
console.log("PASS ordinary display_name update is still allowed and was rolled back.");

const serviceClaims = JSON.stringify({ sub: listener, role: "service_role" }).replace(/'/g, "''");
psql(`
begin;
select set_config('request.jwt.claims', '${serviceClaims}', true);
set local role service_role;
update public.profiles
set account_type = case when account_type = 'listener' then 'artist' else 'listener' end
where id = '${listener}';
rollback;
`);
console.log("PASS service_role account_type update still succeeds and was rolled back.");

mustFail(`
begin;
grant update (is_admin) on table public.profiles to authenticated;
select set_config('request.jwt.claims', '${claims}', true);
set local role authenticated;
update public.profiles set is_admin = true where id = '${listener}';
rollback;
`, "authenticated is_admin update after a temporary column grant", /is_admin cannot be changed by client update/);

const privilegeAfter = psql(`
select has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE') as update_is_admin;
`);
if (!privilegeAfter.split("\n").some((line) => line.trim() === "f")) {
    throw new Error("Temporary is_admin grant did not roll back.");
}
console.log("PASS temporary is_admin grant rolled back.");

const adminFlag = psql(`
select public.is_platform_admin('${listener}'::uuid) as is_admin;
`).split("\n").map((line) => line.trim()).find((line) => line === "t" || line === "f");
if (adminFlag !== "f") throw new Error("Ordinary profile was reported as a platform admin.");
console.log("PASS ordinary profile is not a platform admin.");

const bucketFlags = psql(`
select id || ':' || public::text
from storage.buckets
where id in ('songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews')
order by id;
`);
for (const bucket of ["albums", "covers", "producer-beats", "ringtone-previews"]) {
    if (!bucketFlags.includes(`${bucket}:true`)) {
        throw new Error(`Artwork bucket ${bucket} is no longer public. This check does not change storage policies.`);
    }
}
for (const bucket of ["songs", "videos"]) {
    if (!bucketFlags.includes(`${bucket}:false`)) {
        throw new Error(`Media bucket ${bucket} is public on this isolated database. Leaving storage policies unchanged.`);
    }
}
console.log("PASS artwork buckets stay public and song/video buckets stay private on this isolated database. Storage policies were not changed.");

mustFail(`
begin;
select set_config('request.jwt.claims', '${claims}', true);
set local role authenticated;
insert into storage.objects (bucket_id, name)
values ('videos', '00000000-0000-4000-8000-000000000099/privilege-probe.txt');
rollback;
`, "authenticated upload into another user's video folder");

console.log("verify-profile-privilege-lock.mjs passed");
