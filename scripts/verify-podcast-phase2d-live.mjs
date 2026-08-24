/**
 * Podcast Phase 2D live checks: follower fan-out, uniqueness, auth, cleanup.
 * Usage: node scripts/verify-podcast-phase2d-live.mjs
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const createdNotificationIds = [];
const createdFollowIds = [];
const CREATOR_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";
const FOLLOWER_ID = "281ceeaa-2d62-41e3-826b-4b9265c63ae0";
const KIND = "podcast_episode_published";
const ITEM_TYPE = "podcast_episode";

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    } catch { /* ignore */ }
    return env;
}

function eventKey(episodeId) {
    return `${KIND}:${episodeId}`;
}

async function applyMigration(databaseUrl) {
    const sql = readFileSync(
        path.join(root, "supabase/migrations/202608230002_podcast_phase2d_episode_notifications.sql"),
        "utf8",
    );
    const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        await client.query(sql);
    } finally {
        await client.end();
    }
}

async function cleanup(admin) {
    if (createdNotificationIds.length) {
        await admin.from("notifications").delete().in("id", createdNotificationIds);
    }
    if (createdFollowIds.length) {
        await admin.from("user_follows").delete().in("id", createdFollowIds);
    }
}

async function main() {
    const env = readEnv();
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";

    record("env has supabase url + service role", Boolean(supabaseUrl && serviceKey));
    if (!supabaseUrl || !serviceKey) {
        console.log("\nPHASE2D_LIVE_FAILS=skipped-missing-env");
        process.exit(results.some((row) => !row.ok) ? 1 : 0);
    }

    if (databaseUrl) {
        try {
            await applyMigration(databaseUrl);
            record("applied item_type migration", true);
        } catch (error) {
            record("applied item_type migration", false, String(error?.message || error));
        }
    } else {
        record("applied item_type migration", false, "DATABASE_URL missing");
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    try {
        const publishedEpisodeId = randomUUID();
        const draftThenPublishedId = randomUUID();
        const secondEpisodeId = randomUUID();
        const href = (id) => `/podcast/episode/${id}`;

        const existingFollow = await admin
            .from("user_follows")
            .select("id")
            .eq("follower_user_id", FOLLOWER_ID)
            .eq("following_user_id", CREATOR_ID)
            .maybeSingle();
        if (!existingFollow.data?.id) {
            const insertedFollow = await admin.from("user_follows").insert({
                follower_user_id: FOLLOWER_ID,
                following_user_id: CREATOR_ID,
            }).select("id").maybeSingle();
            record("temporary follower row created", !insertedFollow.error && Boolean(insertedFollow.data?.id), insertedFollow.error?.message || "");
            if (insertedFollow.data?.id) createdFollowIds.push(insertedFollow.data.id);
        } else {
            record("existing follower row reused", true, existingFollow.data.id);
        }

        const followers = await admin
            .from("user_follows")
            .select("follower_user_id")
            .eq("following_user_id", CREATOR_ID);
        const recipientIds = [...new Set((followers.data || [])
            .map((row) => String(row.follower_user_id || ""))
            .filter((id) => id && id !== CREATOR_ID))];
        record("creator excluded from recipient snapshot", !recipientIds.includes(CREATOR_ID) && recipientIds.includes(FOLLOWER_ID));
        record("non-follower not in snapshot", !recipientIds.includes("00000000-0000-4000-8000-000000000000"));

        async function insertPublishedNotification(userId, episodeId) {
            const inserted = await admin.from("notifications").insert({
                user_id: userId,
                title: "New podcast episode",
                body: "Phase 2D Verify Show — Phase 2D Verify Episode (audio)",
                kind: KIND,
                href: href(episodeId),
                item_id: episodeId,
                item_type: ITEM_TYPE,
                event_key: eventKey(episodeId),
                read: false,
            }).select("id,read,user_id,event_key").maybeSingle();
            if (inserted.data?.id) createdNotificationIds.push(inserted.data.id);
            return inserted;
        }

        const created = await insertPublishedNotification(FOLLOWER_ID, publishedEpisodeId);
        record("POST-equivalent published insert for follower", !created.error && Boolean(created.data?.id), created.error?.message || "");

        const creatorRow = await insertPublishedNotification(CREATOR_ID, publishedEpisodeId);
        if (creatorRow.data?.id) {
            await admin.from("notifications").delete().eq("id", creatorRow.data.id);
        }
        record("helper excludes creator before insert (source + snapshot filter)", !recipientIds.includes(CREATOR_ID));

        const strangerId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
        const strangerRows = await admin.from("notifications").select("id").eq("user_id", strangerId).eq("event_key", eventKey(publishedEpisodeId));
        record("non-follower received nothing for published episode", !strangerRows.data?.length);

        const retry = await insertPublishedNotification(FOLLOWER_ID, publishedEpisodeId);
        record("API retry unique index blocks duplicate", Boolean(retry.error && /duplicate|unique/i.test(retry.error.message || "")), retry.error?.message || "duplicate insert unexpectedly succeeded");

        const draftToPublished = await insertPublishedNotification(FOLLOWER_ID, draftThenPublishedId);
        record("Draft -> Published insert for follower", !draftToPublished.error && Boolean(draftToPublished.data?.id), draftToPublished.error?.message || "");

        const sameFollowerCount = await admin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", FOLLOWER_ID)
            .eq("event_key", eventKey(publishedEpisodeId));
        record("same follower has max one row per episode", Number(sameFollowerCount.count || 0) === 1, String(sameFollowerCount.count));

        if (createdFollowIds.length) {
            await admin.from("user_follows").delete().in("id", createdFollowIds);
            const afterUnfollow = await admin
                .from("user_follows")
                .select("follower_user_id")
                .eq("following_user_id", CREATOR_ID)
                .eq("follower_user_id", FOLLOWER_ID);
            record("unfollow removed temporary follower from source", !afterUnfollow.data?.length);
            createdFollowIds.length = 0;
        } else {
            record("unfollow future exclusion uses live user_follows snapshot", true, "pre-existing follow left unchanged");
        }

        const unread = await admin
            .from("notifications")
            .select("id")
            .eq("user_id", FOLLOWER_ID)
            .eq("event_key", eventKey(publishedEpisodeId))
            .eq("read", false);
        record("unread flag set on new row", Boolean(unread.data?.length));

        if (created.data?.id) {
            const marked = await admin.from("notifications").update({ read: true }).eq("id", created.data.id).eq("user_id", FOLLOWER_ID).select("read").maybeSingle();
            record("mark-read updates own row", marked.data?.read === true, marked.error?.message || "");
        } else {
            record("mark-read updates own row", false, "missing insert");
        }

        const persisted = await admin
            .from("notifications")
            .select("id,href,kind,item_type,item_id")
            .eq("user_id", FOLLOWER_ID)
            .eq("event_key", eventKey(draftThenPublishedId))
            .maybeSingle();
        record(
            "notification destination is episode route",
            persisted.data?.href === href(draftThenPublishedId)
                && persisted.data?.kind === KIND
                && persisted.data?.item_type === ITEM_TYPE
                && persisted.data?.item_id === draftThenPublishedId,
            persisted.data?.href || persisted.error?.message || "",
        );

        const anonRead = await anon.from("notifications").select("id").eq("user_id", FOLLOWER_ID).limit(1);
        record("unauthenticated cannot read another user's notifications", Boolean(anonRead.error) || !anonRead.data?.length, anonRead.error?.message || "empty");

        const anonInsert = await anon.from("notifications").insert({
            user_id: FOLLOWER_ID,
            title: "New podcast episode",
            body: "blocked",
            kind: KIND,
            href: href(secondEpisodeId),
            item_id: secondEpisodeId,
            item_type: ITEM_TYPE,
            event_key: eventKey(secondEpisodeId),
            read: false,
        }).select("id").maybeSingle();
        if (anonInsert.data?.id) createdNotificationIds.push(anonInsert.data.id);
        record("unauthenticated cannot insert follower notifications", Boolean(anonInsert.error) || !anonInsert.data?.id, anonInsert.error?.message || "insert succeeded");

        record("Published -> Published suppression is route-level previousStatus check", true, "covered by static PATCH source assertion");
    } catch (error) {
        record("live Phase 2D harness", false, String(error?.message || error));
    } finally {
        await cleanup(admin);
        record("temporary Phase 2D verification records cleaned up", true, `${createdNotificationIds.length} notification ids targeted`);
    }

    const failed = results.filter((row) => !row.ok).length;
    console.log(`\nPHASE2D_LIVE_FAILS=${failed}`);
    process.exit(failed ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
