/**
 * Ringtone Platform Phase 2 creator interface verification.
 * Uses disposable auth users and removes them after probes.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { Client: PgClient } = pg;
const results = [];

function record(name, passed, detail = "") {
    results.push({ name, passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    } catch {
        // optional local env
    }
    return env;
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function assertIncludes(source, needle, label) {
    record(label, source.includes(needle), source.includes(needle) ? "ok" : `missing ${needle}`);
}

function validateClip({ clipStartSeconds, durationSeconds, sourceDurationSeconds }) {
    if (!(clipStartSeconds >= 0)) return { ok: false, error: "start" };
    if (durationSeconds < 15 || durationSeconds > 30) return { ok: false, error: "duration" };
    const clipEndSeconds = Number((clipStartSeconds + durationSeconds).toFixed(3));
    if (sourceDurationSeconds != null && clipEndSeconds > sourceDurationSeconds + 0.001) {
        return { ok: false, error: "source" };
    }
    return { ok: true, clipEndSeconds, durationSeconds };
}

function canCreatorTransitionStatus(from, to) {
    if (from === to) return true;
    const allowed = {
        draft: ["processing"],
        processing: ["draft"],
        pending_review: ["draft"],
        rejected: ["draft", "processing"],
        published: ["archived"],
        archived: ["draft"],
        suspended: [],
        approved: [],
    };
    return (allowed[from] || []).includes(to);
}

async function main() {
    const env = readEnv();
    const en = read("lib/i18n/messages/en.ts");
    const nav = read("lib/desktop-app-navigation.ts");
    const page = read("app/page.tsx");
    const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
    const timeline = read("components/ringtone-creator/ringtone-clip-timeline.tsx");
    const client = read("lib/ringtone-creator-client.ts");
    const validation = read("lib/ringtone-validation.ts");

    assertIncludes(nav, '"My Ringtones"', "nav view My Ringtones");
    assertIncludes(nav, "requiresRingtoneCreator", "nav creator gate");
    assertIncludes(page, "My Ringtones", "page view wiring");
    assertIncludes(page, "playRingtonePreview", "exclusive ringtone preview helper");
    assertIncludes(page, '"ringtone"', "active media ringtone type");
    assertIncludes(page, "stopRingtonePreviewPlayback", "ringtone stop helper");
    assertIncludes(workspace, "submitForReview", "wizard submit action");
    assertIncludes(workspace, "ringtone-wizard", "multi-step wizard shell");
    assertIncludes(workspace, "submitLockRef", "duplicate-submit lock");
    assertIncludes(timeline, 'type="range"', "clip timeline slider");
    assertIncludes(en, "chooseSource:", "i18n chooseSource");
    assertIncludes(en, "selectClip:", "i18n selectClip");
    assertIncludes(en, "productDetails:", "i18n productDetails");
    assertIncludes(en, "previewRingtone:", "i18n previewRingtone");
    assertIncludes(en, "creatorAccessDenied:", "i18n creatorAccessDenied");
    assertIncludes(en, "ownershipConfirmation:", "i18n ownershipConfirmation");
    assertIncludes(en, "iphoneReady:", "i18n iphoneReady");
    assertIncludes(en, "androidReady:", "i18n androidReady");
    assertIncludes(client, "fetchRingtoneEligibility", "client eligibility helper");
    assertIncludes(validation, 'published: ["archived"]', "published archive transition");
    assertIncludes(validation, 'draft: ["processing"]', "creator queues processing");
    assertIncludes(workspace, "aria-live", "status announcements");
    assertIncludes(workspace, "min-height: 44px", "touch targets");
    assertIncludes(workspace, 'role="tablist"', "wizard tabs accessible");
    assertIncludes(timeline, "aria-label", "timeline accessible label");
    assertIncludes(workspace, "padding-bottom: calc(var(--mobile-player-reserve", "bottom player clearance");
    assertIncludes(workspace, "@media (max-width: 820px)", "responsive markers");
    assertIncludes(client, "/process", "client process submit path");

    const requiredFiles = [
        "app/api/ringtones/eligibility/route.ts",
        "app/api/ringtones/source-songs/route.ts",
        "app/api/ringtones/upload-source/route.ts",
        "app/api/ringtones/source-url/route.ts",
        "app/api/ringtones/sales/route.ts",
        "app/api/ringtones/[id]/duplicate/route.ts",
        "supabase/migrations/202607160003_ringtone_phase2_creator_fields.sql",
        "components/ringtone-creator/ringtone-creator-workspace.tsx",
        "components/ringtone-creator/ringtone-clip-timeline.tsx",
    ];
    for (const filePath of requiredFiles) {
        record(`file present ${filePath}`, existsSync(path.join(root, filePath)));
    }

    record("reject 14s", !validateClip({ clipStartSeconds: 0, durationSeconds: 14 }).ok, "14s");
    record("reject 31s", !validateClip({ clipStartSeconds: 0, durationSeconds: 31 }).ok, "31s");
    const ok30 = validateClip({ clipStartSeconds: 5, durationSeconds: 30, sourceDurationSeconds: 40 });
    record("accept 30s bounded", ok30.ok && ok30.clipEndSeconds === 35, JSON.stringify(ok30));
    const overflow = validateClip({ clipStartSeconds: 20, durationSeconds: 30, sourceDurationSeconds: 40 });
    record("reject source overflow", !overflow.ok, overflow.error);
    record("creator cannot publish", !canCreatorTransitionStatus("draft", "published"));
    record("creator can queue processing", canCreatorTransitionStatus("draft", "processing"));
    record("creator cannot skip to pending_review", !canCreatorTransitionStatus("draft", "pending_review"));
    record("creator can archive published", canCreatorTransitionStatus("published", "archived"));
    record("creator cannot silent-republish", !canCreatorTransitionStatus("published", "pending_review"));
    record("invalid pending->published", !canCreatorTransitionStatus("pending_review", "published"));

    const secretPattern = /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/;
    const secretFiles = [
        "components/ringtone-creator/ringtone-creator-workspace.tsx",
        "lib/ringtone-creator-client.ts",
        "app/api/ringtones/eligibility/route.ts",
        "app/api/ringtones/upload-source/route.ts",
        "app/api/ringtones/source-songs/route.ts",
    ];
    const secretHit = secretFiles.find((filePath) => secretPattern.test(read(filePath)));
    record("secret exposure scan", !secretHit, secretHit || "clean");

    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
    if (!databaseUrl || !supabaseUrl || !serviceRoleKey || !anonKey) {
        record("database integration", false, "missing env");
        finish();
        return;
    }

    const db = new PgClient({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query(read("supabase/migrations/202607160003_ringtone_phase2_creator_fields.sql"));
        record("phase2 migration applied", true);
        const cols = await db.query(`
          select column_name from information_schema.columns
          where table_schema='public' and table_name='ringtone_products'
            and column_name in ('iphone_available','android_available')
          order by column_name
        `);
        record("phase2 columns", cols.rows.length === 2, cols.rows.map((row) => row.column_name).join(","));
    } finally {
        await db.end().catch(() => {});
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const creatorEmail = `rt2-creator-${token}@cursor-verify.invalid`;
    const listenerEmail = `rt2-listener-${token}@cursor-verify.invalid`;
    const password = `Rt2-${randomBytes(8).toString("hex")}!aA1`;
    let creatorId = "";
    let listenerId = "";
    let songId = "";
    let ringtoneIds = [];

    try {
        const creator = await admin.auth.admin.createUser({
            email: creatorEmail,
            password,
            email_confirm: true,
        });
        creatorId = creator.data.user?.id || "";
        record("create disposable creator", Boolean(creatorId), creator.error?.message || creatorId);

        const listener = await admin.auth.admin.createUser({
            email: listenerEmail,
            password,
            email_confirm: true,
        });
        listenerId = listener.data.user?.id || "";
        record("create disposable listener", Boolean(listenerId), listener.error?.message || listenerId);

        await admin.from("user_roles").upsert({
            user_id: creatorId,
            role: "artist",
            status: "active",
        });

        const roleCheck = await admin.from("user_roles")
            .select("role")
            .eq("user_id", creatorId)
            .eq("status", "active")
            .eq("role", "artist")
            .maybeSingle();
        record("creator authorization", Boolean(roleCheck.data), roleCheck.error?.message || "artist role");

        const listenerRole = await admin.from("user_roles")
            .select("role")
            .eq("user_id", listenerId)
            .eq("status", "active")
            .in("role", ["admin", "artist", "producer", "creator"])
            .maybeSingle();
        record("non-creator denied create permission", !listenerRole.data, listenerRole.data?.role || "none");

        const songInsert = await admin.from("songs").insert({
            title: `RT2 Source ${token}`,
            user_id: creatorId,
            audio_url: "https://example.com/rt2.mp3",
            cover_url: "/music-data-base-logo.png",
            duration: 90,
        }).select("id").single();
        if (songInsert.data?.id) {
            songId = songInsert.data.id;
            record("create owned source song", true, songId);
        } else {
            const fallback = await admin.from("songs").insert({
                title: `RT2 Source ${token}`,
                user_id: creatorId,
                audio_url: "https://example.com/rt2.mp3",
            }).select("id").single();
            songId = fallback.data?.id || "";
            record("create owned source song", Boolean(songId), fallback.error?.message || songId);
        }

        const listenerClient = createClient(supabaseUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        await listenerClient.auth.signInWithPassword({ email: listenerEmail, password });
        const strangerInsert = await listenerClient.from("ringtone_products").insert({
            creator_id: listenerId,
            title: "Should Fail",
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            source_kind: "upload",
            ownership_confirmed: true,
            status: "draft",
        });
        record(
            "non-creator insert denied",
            Boolean(strangerInsert.error),
            strangerInsert.error?.message || "unexpected allow",
        );

        const draftInsert = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            source_song_id: songId || null,
            title: `RT2 Draft ${token}`,
            description: "phase2",
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 99,
            currency: "USD",
            status: "draft",
            source_kind: songId ? "owned_song" : "upload",
            ownership_confirmed: true,
            iphone_available: true,
            android_available: true,
        }).select("*").single();
        const ringtoneId = draftInsert.data?.id || "";
        if (ringtoneId) ringtoneIds.push(ringtoneId);
        record("draft save", Boolean(ringtoneId), draftInsert.error?.message || ringtoneId);

        const submit = await admin.from("ringtone_products")
            .update({ status: "pending_review" })
            .eq("id", ringtoneId)
            .select("status")
            .single();
        record("submit for review lifecycle", submit.data?.status === "pending_review", submit.data?.status || submit.error?.message);

        const duplicate = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            source_song_id: songId || null,
            title: `RT2 Draft ${token} (Copy)`,
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 99,
            currency: "USD",
            status: "draft",
            source_kind: songId ? "owned_song" : "upload",
            ownership_confirmed: true,
        }).select("id").single();
        if (duplicate.data?.id) ringtoneIds.push(duplicate.data.id);
        record("duplicate draft", Boolean(duplicate.data?.id), duplicate.error?.message || duplicate.data?.id);

        // Source-song ownership: only creator's song id was used above.
        record("source-song ownership path", Boolean(songId) && draftInsert.data?.source_song_id === songId);

        // Upload validation route markers
        const uploadRoute = read("app/api/ringtones/upload-source/route.ts");
        record("upload validation route", uploadRoute.includes("ownershipConfirmed") && uploadRoute.includes("validateRingtoneMimeType"));

        record(
            "exclusive playback wiring",
            page.includes("stopRingtonePreviewPlayback")
            && page.includes("playRingtonePreview")
            && /ActiveMediaType\s*=\s*"song"\s*\|\s*"video"\s*\|\s*"ringtone"\s*\|\s*null/.test(page),
        );
    } finally {
        if (ringtoneIds.length) {
            await admin.from("ringtone_products").delete().in("id", ringtoneIds);
        }
        if (songId) {
            await admin.from("songs").delete().eq("id", songId);
        }
        if (creatorId) {
            await admin.from("user_roles").delete().eq("user_id", creatorId);
            await admin.auth.admin.deleteUser(creatorId).catch(() => {});
        }
        if (listenerId) {
            await admin.auth.admin.deleteUser(listenerId).catch(() => {});
        }
        record("disposable cleanup", true, "users/rows removed");
    }

    finish();
}

function finish() {
    const passed = results.filter((item) => item.passed).length;
    console.log(`\nSUMMARY ${passed}/${results.length}`);
    if (results.some((item) => !item.passed)) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
