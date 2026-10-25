/**
 * Temporary local-DB fault injection for isolated playback probes (127.0.0.1:54322 only).
 * Always pair inject* calls with restore* in finally blocks.
 */
import pg from "pg";

const SONGS_BACKUP = "songs_mdb_isolated_fault_backup";
const VIDEOS_BACKUP = "videos_mdb_isolated_fault_backup";

export async function dropModerationStateColumns(client) {
    await client.query("alter table public.songs drop column if exists moderation_state");
    await client.query("alter table public.videos drop column if exists moderation_state");
    await client.query("alter table public.albums drop column if exists moderation_state");
    await client.query("alter table public.podcast_episodes drop column if exists moderation_state");
    await client.query("notify pgrst, 'reload schema'");
}

export async function restoreModerationStateColumns(client) {
    await client.query("alter table public.songs add column if not exists moderation_state text not null default 'clear'");
    await client.query("alter table public.videos add column if not exists moderation_state text not null default 'clear'");
    await client.query("alter table public.albums add column if not exists moderation_state text not null default 'clear'");
    await client.query("alter table public.podcast_episodes add column if not exists moderation_state text not null default 'clear'");
    await client.query(`
        alter table public.songs drop constraint if exists songs_moderation_state_check;
        alter table public.songs add constraint songs_moderation_state_check
          check (moderation_state in ('clear', 'takedown_pending', 'removed'));
    `);
    await client.query(`
        alter table public.videos drop constraint if exists videos_moderation_state_check;
        alter table public.videos add constraint videos_moderation_state_check
          check (moderation_state in ('clear', 'takedown_pending', 'removed'));
    `);
    await client.query("notify pgrst, 'reload schema'");
}

export async function hideCatalogTable(client, tableName, backupName) {
    const exists = await client.query(
        "select to_regclass($1) as reg",
        [`public.${tableName}`],
    );
    if (!exists.rows[0]?.reg) {
        return false;
    }
    await client.query(`alter table public.${tableName} rename to ${backupName}`);
    await client.query("notify pgrst, 'reload schema'");
    return true;
}

export async function restoreCatalogTable(client, tableName, backupName) {
    const hidden = await client.query(
        "select to_regclass($1) as reg",
        [`public.${backupName}`],
    );
    if (!hidden.rows[0]?.reg) {
        return false;
    }
    await client.query(`alter table public.${backupName} rename to ${tableName}`);
    await client.query("notify pgrst, 'reload schema'");
    return true;
}

export async function hideSongsCatalogTable(client) {
    return hideCatalogTable(client, "songs", SONGS_BACKUP);
}

export async function restoreSongsCatalogTable(client) {
    return restoreCatalogTable(client, "songs", SONGS_BACKUP);
}

export async function hideVideosCatalogTable(client) {
    return hideCatalogTable(client, "videos", VIDEOS_BACKUP);
}

export async function restoreVideosCatalogTable(client) {
    return restoreCatalogTable(client, "videos", VIDEOS_BACKUP);
}

export function createIsolatedPgClient(connectionString) {
    const parsed = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        throw new Error("Fault injection refused: database must be localhost.");
    }
    if ((parsed.port || "5432") !== "54322") {
        throw new Error("Fault injection refused: database must use port 54322.");
    }
    return new pg.Client({ connectionString });
}
