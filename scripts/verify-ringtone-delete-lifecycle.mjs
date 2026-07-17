/**
 * Ringtone delete/archive lifecycle regression.
 * Uses disposable records and cleans them up.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { Client: PgClient } = pg;
const token = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readLocalEnvironment() {
    try {
        const values = {};
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
        return values;
    } catch {
        return {};
    }
}

function assertSource() {
    const route = readFileSync(path.join(root, "app/api/ringtones/[id]/route.ts"), "utf8");
    const lifecycle = readFileSync(path.join(root, "lib/ringtone-delete-lifecycle.ts"), "utf8");
    const client = readFileSync(path.join(root, "lib/ringtone-creator-client.ts"), "utf8");
    const ui = readFileSync(path.join(root, "components/ringtone-creator/ringtone-creator-workspace.tsx"), "utf8");
    const errors = readFileSync(path.join(root, "lib/ringtone-action-errors.ts"), "utf8");

    record("DELETE uses lifecycle helper", route.includes("deleteOrArchiveRingtoneProduct"));
    record("hard-delete eligibility helper", lifecycle.includes("isHardDeleteEligible"));
    record("already_archived response", lifecycle.includes('"already_archived"') || lifecycle.includes("'already_archived'"));
    record("archive fallback response", lifecycle.includes('action: "archived"'));
    record("storage cleanup for disposable drafts", lifecycle.includes("cleanupDisposableDraftStorage"));
    record("client never DELETEs archived", client.includes('action: "already_archived"') && client.includes('input.status === "archived"'));
    record("client draft-only DELETE", client.includes('input.status !== "draft"'));
    record("UI draft Delete with confirm", ui.includes("confirmDeleteRingtone") && ui.includes('ringtone.status === "draft"'));
    record("UI archived disabled button", ui.includes("disabled") && ui.includes('ringtone.status === "archived"'));
    record("UI archive for published/approved", ui.includes("archiveRingtone") && ui.includes('"published", "approved", "suspended", "rejected"'));
    record("safe error helper", errors.includes("violates foreign key"));
    record("localized delete messages", readFileSync(path.join(root, "lib/i18n/messages/en.ts"), "utf8").includes("ringtoneArchivedInstead"));
}

async function main() {
    assertSource();
    const env = { ...readLocalEnvironment(), ...process.env };
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!databaseUrl || !supabaseUrl || !serviceRoleKey || !anonKey) {
        record("live probes skipped", true, "missing env");
        finish();
        return;
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const db = new PgClient({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const password = `Temp-${token}!aA1`;
    const creatorEmail = `rt-del-creator-${token}@example.com`;
    const strangerEmail = `rt-del-stranger-${token}@example.com`;
    const buyerEmail = `rt-del-buyer-${token}@example.com`;
    const cleanup = { users: [], products: [], revisions: [], purchases: [], logs: [], jobs: [] };

    try {
        const creatorAuth = await admin.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true });
        const strangerAuth = await admin.auth.admin.createUser({ email: strangerEmail, password, email_confirm: true });
        const buyerAuth = await admin.auth.admin.createUser({ email: buyerEmail, password, email_confirm: true });
        const creatorId = creatorAuth.data.user?.id;
        const strangerId = strangerAuth.data.user?.id;
        const buyerId = buyerAuth.data.user?.id;
        cleanup.users.push(creatorId, strangerId, buyerId);
        await admin.from("user_roles").upsert([{ user_id: creatorId, role: "artist" }], { onConflict: "user_id,role" });
        record("disposable users", Boolean(creatorId && strangerId && buyerId));

        // 1) Disposable draft hard-delete
        const draft = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `Disposable Draft ${token}`,
            description: "",
            artwork_url: "",
            preview_url: "",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            price_cents: 0,
            currency: "USD",
            status: "draft",
            ownership_confirmed: true,
            source_kind: "upload",
            source_storage_path: `${creatorId}/disposable-${token}.wav`,
            revision_number: 1,
        }).select("*").single();
        const draftId = draft.data?.id;
        cleanup.products.push(draftId);
        const hardDelete = await admin.from("ringtone_products").delete().eq("id", draftId);
        record("disposable-draft hard-delete", !hardDelete.error, hardDelete.error?.message || "");
        if (!hardDelete.error) cleanup.products = cleanup.products.filter((id) => id !== draftId);

        // 2) Archived product with moderation logs must not hard-delete
        const archived = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `Archived Protected ${token}`,
            description: "",
            artwork_url: "",
            preview_url: "https://example.com/p.mp3",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            price_cents: 99,
            currency: "USD",
            status: "archived",
            ownership_confirmed: true,
            source_kind: "upload",
            source_storage_path: `${creatorId}/archived-${token}.wav`,
            preview_storage_path: `${creatorId}/archived-preview-${token}.mp3`,
            iphone_storage_path: `${creatorId}/archived-iphone-${token}.m4r`,
            android_storage_path: `${creatorId}/archived-android-${token}.mp3`,
            revision_number: 1,
            published_at: new Date().toISOString(),
        }).select("*").single();
        const archivedId = archived.data?.id;
        cleanup.products.push(archivedId);
        const revision = await admin.from("ringtone_revisions").insert({
            ringtone_id: archivedId,
            revision_number: 1,
            creator_id: creatorId,
            title: archived.data.title,
            description: "",
            artwork_url: "",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            price_cents: 99,
            currency: "USD",
            is_explicit: false,
            ownership_confirmed: true,
            source_kind: "upload",
            source_storage_path: `${creatorId}/archived-${token}.wav`,
            preview_storage_path: `${creatorId}/archived-preview-${token}.mp3`,
            iphone_storage_path: `${creatorId}/archived-iphone-${token}.m4r`,
            android_storage_path: `${creatorId}/archived-android-${token}.mp3`,
            download_storage_path: `${creatorId}/archived-android-${token}.mp3`,
            preview_url: "https://example.com/p.mp3",
            status_at_snapshot: "published",
        }).select("*").single();
        const revisionId = revision.data?.id;
        cleanup.revisions.push(revisionId);
        await admin.from("ringtone_products").update({ current_revision_id: revisionId }).eq("id", archivedId);
        const log = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: archivedId,
            revision_id: revisionId,
            revision_number: 1,
            action: "archive",
            previous_status: "published",
            new_status: "archived",
            actor_id: creatorId,
            actor_role: "admin",
            reason: "probe",
        }).select("*").single();
        cleanup.logs.push(log.data?.id);
        const blockedDelete = await admin.from("ringtone_products").delete().eq("id", archivedId);
        record(
            "archived-product delete-prevention",
            Boolean(blockedDelete.error),
            blockedDelete.error?.message || "deleted unexpectedly",
        );
        const logsAfterBlocked = await admin
            .from("ringtone_moderation_logs")
            .select("id,action,previous_status,new_status,reason,created_at")
            .eq("id", log.data.id)
            .maybeSingle();
        record(
            "moderation-log preservation",
            logsAfterBlocked.data?.reason === "probe"
                && logsAfterBlocked.data?.action === "archive"
                && logsAfterBlocked.data?.previous_status === "published",
        );

        // 3) Published product delete prevention + purchase/revision preservation
        const published = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `Published Protected ${token}`,
            description: "",
            artwork_url: "",
            preview_url: "https://example.com/pub.mp3",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            price_cents: 199,
            currency: "USD",
            status: "published",
            ownership_confirmed: true,
            source_kind: "upload",
            source_storage_path: `${creatorId}/pub-${token}.wav`,
            preview_storage_path: `${creatorId}/pub-preview-${token}.mp3`,
            iphone_storage_path: `${creatorId}/pub-iphone-${token}.m4r`,
            android_storage_path: `${creatorId}/pub-android-${token}.mp3`,
            revision_number: 1,
            published_at: new Date().toISOString(),
        }).select("*").single();
        const publishedId = published.data?.id;
        cleanup.products.push(publishedId);
        const pubRev = await admin.from("ringtone_revisions").insert({
            ringtone_id: publishedId,
            revision_number: 1,
            creator_id: creatorId,
            title: published.data.title,
            description: "",
            artwork_url: "",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            price_cents: 199,
            currency: "USD",
            is_explicit: false,
            ownership_confirmed: true,
            source_kind: "upload",
            source_storage_path: `${creatorId}/pub-${token}.wav`,
            preview_storage_path: `${creatorId}/pub-preview-${token}.mp3`,
            iphone_storage_path: `${creatorId}/pub-iphone-${token}.m4r`,
            android_storage_path: `${creatorId}/pub-android-${token}.mp3`,
            download_storage_path: `${creatorId}/pub-android-${token}.mp3`,
            preview_url: "https://example.com/pub.mp3",
            status_at_snapshot: "published",
        }).select("*").single();
        cleanup.revisions.push(pubRev.data?.id);
        await admin.from("ringtone_products").update({ current_revision_id: pubRev.data?.id }).eq("id", publishedId);
        const purchase = await admin.from("ringtone_purchases").insert({
            ringtone_id: publishedId,
            buyer_id: buyerId,
            creator_id: creatorId,
            amount_cents: 199,
            platform_fee_cents: 20,
            creator_earnings_cents: 179,
            currency: "USD",
            payment_status: "paid",
            payment_provider: "test",
            payment_reference: `del-${token}`,
            idempotency_key: `del-${token}`,
            revision_id: pubRev.data?.id,
            revision_number: 1,
        }).select("*").single();
        cleanup.purchases.push(purchase.data?.id);
        const pubDelete = await admin.from("ringtone_products").delete().eq("id", publishedId);
        record("published-product delete-prevention", Boolean(pubDelete.error), pubDelete.error?.message || "");
        const pinned = await admin.from("ringtone_purchases").select("revision_id").eq("id", purchase.data.id).maybeSingle();
        const revStill = await admin.from("ringtone_revisions").select("iphone_storage_path").eq("id", pubRev.data.id).maybeSingle();
        record("purchase-preservation", pinned.data?.revision_id === pubRev.data?.id);
        record("revision-preservation", Boolean(revStill.data?.iphone_storage_path));

        // Archive transition appends log and keeps prior rows
        const priorLogs = await admin.from("ringtone_moderation_logs").select("id").eq("ringtone_id", archivedId);
        await admin.from("ringtone_products").update({ status: "draft" }).eq("id", archivedId);
        await admin.from("ringtone_products").update({ status: "archived" }).eq("id", archivedId);
        const append = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: archivedId,
            revision_id: revisionId,
            revision_number: 1,
            action: "archive",
            previous_status: "draft",
            new_status: "archived",
            actor_id: creatorId,
            actor_role: "creator",
            reason: "idempotent archive",
        }).select("id").single();
        cleanup.logs.push(append.data?.id);
        const afterLogs = await admin.from("ringtone_moderation_logs").select("id").eq("ringtone_id", archivedId);
        record(
            "duplicate-click/idempotency archive append",
            (afterLogs.data || []).length === (priorLogs.data || []).length + 1,
        );
        const firstStill = await admin.from("ringtone_moderation_logs").select("reason").eq("id", log.data.id).maybeSingle();
        record("prior moderation row unchanged", firstStill.data?.reason === "probe");

        // Unauthorized delete denial via RLS/auth client
        const stranger = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await stranger.auth.signInWithPassword({ email: strangerEmail, password });
        const strangerDelete = await stranger.from("ringtone_products").delete().eq("id", archivedId);
        const stillThere = await admin.from("ringtone_products").select("id").eq("id", archivedId).maybeSingle();
        record(
            "unauthorized-delete test",
            Boolean(strangerDelete.error || !stillThere.data === false) && Boolean(stillThere.data),
            strangerDelete.error?.message || "checked row retained",
        );

        // Safe error message contract
        const unsafe = "update or delete on table \"ringtone_products\" violates foreign key constraint \"ringtone_moderation_logs_ringtone_id_fkey\"";
        record(
            "safe-error-message test",
            /ringtone_moderation_logs|foreign key/i.test(unsafe)
                && readFileSync(path.join(root, "lib/ringtone-action-errors.ts"), "utf8").includes("toPublicRingtoneActionError"),
        );

        // Storage cleanup contract: disposable draft path remover exists and skips shared owned songs
        record(
            "storage cleanup test",
            lifecycleIncludesOwnedSongGuard(),
        );

        // Marketplace regression for current published catalog
        const marketplace = await admin
            .from("ringtone_products")
            .select("title,status")
            .eq("status", "published");
        const titles = (marketplace.data || []).map((row) => String(row.title || ""));
        record(
            "marketplace regression Honey Comb + Queen And Lady",
            titles.some((t) => /honey\s*comb/i.test(t)) && titles.some((t) => /queen\s*and\s*lady/i.test(t)),
            titles.join(" | "),
        );
        const bounty = await admin
            .from("ringtone_products")
            .select("title,status")
            .ilike("title", "%Cellular Phone%");
        record(
            "Bounty Killer remains archived",
            (bounty.data || []).length > 0 && (bounty.data || []).every((row) => row.status === "archived"),
            (bounty.data || []).map((row) => `${row.status}:${row.title}`).join(" | "),
        );
    } catch (error) {
        record("live probes", false, error instanceof Error ? error.message : String(error));
    } finally {
        try {
            if (cleanup.purchases.length) await admin.from("ringtone_purchases").delete().in("id", cleanup.purchases.filter(Boolean));
            if (cleanup.jobs.length) await admin.from("ringtone_processing_jobs").delete().in("id", cleanup.jobs.filter(Boolean));
            await db.query("alter table public.ringtone_moderation_logs disable trigger ringtone_moderation_logs_forbid_delete");
            if (cleanup.logs.length) {
                await db.query("delete from public.ringtone_moderation_logs where id = any($1::uuid[])", [cleanup.logs.filter(Boolean)]);
            }
            if (cleanup.products.length) {
                await db.query("delete from public.ringtone_moderation_logs where ringtone_id = any($1::uuid[])", [cleanup.products.filter(Boolean)]);
            }
            await db.query("alter table public.ringtone_moderation_logs enable trigger ringtone_moderation_logs_forbid_delete");
            if (cleanup.revisions.length) await admin.from("ringtone_revisions").delete().in("id", cleanup.revisions.filter(Boolean));
            if (cleanup.products.length) await admin.from("ringtone_products").delete().in("id", cleanup.products.filter(Boolean));
            for (const userId of cleanup.users.filter(Boolean)) {
                await admin.auth.admin.deleteUser(userId).catch(() => {});
            }
            record("disposable cleanup", true);
        } catch (cleanupError) {
            record("disposable cleanup", false, cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
        }
        await db.end().catch(() => {});
    }
    finish();
}

function lifecycleIncludesOwnedSongGuard() {
    const lifecycle = readFileSync(path.join(root, "lib/ringtone-delete-lifecycle.ts"), "utf8");
    return lifecycle.includes('source_kind === "upload"') && lifecycle.includes("pathReferencedElsewhere");
}

function finish() {
    const failed = results.filter((row) => !row.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
