/**
 * Append-only moderation-log + lifecycle regression harness.
 * Creates disposable users/products, verifies immutable history, then cleans up.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { Client: PgClient } = pg;

function isUnsafeRingtoneErrorMessage(message) {
    return /ringtone_moderation_logs|is immutable|violates foreign key|PGRST|postgres|sqlstate|relation /i.test(String(message || ""));
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

const env = { ...readLocalEnvironment(), ...process.env };
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const token = `${Date.now()}-${randomBytes(4).toString("hex")}`;

const results = [];
function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    const mark = ok ? "PASS" : "FAIL";
    console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assertSourceContracts() {
    const route = readFileSync(path.join(root, "app/api/ringtones/[id]/route.ts"), "utf8");
    const client = readFileSync(path.join(root, "lib/ringtone-creator-client.ts"), "utf8");
    const revisions = readFileSync(path.join(root, "lib/ringtone-revisions.ts"), "utf8");
    const migration = readFileSync(
        path.join(root, "supabase/migrations/202607170001_ringtone_moderation_logs_append_only_fks.sql"),
        "utf8",
    );
    const errors = readFileSync(path.join(root, "lib/ringtone-action-errors.ts"), "utf8");
    const validation = readFileSync(path.join(root, "lib/ringtone-validation.ts"), "utf8");
    record("source DELETE archives when moderation history exists", route.includes("MODERATION_HISTORY_RETAINED") && route.includes("hasModerationHistory"));
    record("source PATCH appends status transition logs", route.includes("appendStatusTransitionLog") || route.includes("writeRingtoneModerationLog"));
    record("source never surfaces immutable table text", route.includes("toPublicRingtoneActionError") && errors.includes("is immutable"));
    record("source client sanitizes unsafe errors", client.includes("formatRingtoneClientError"));
    record("source return-to-review helper present", client.includes("returnRingtoneToReview"));
    record("source revision start appends log", revisions.includes('action: "return_to_review"'));
    record("source FK migration uses ON DELETE RESTRICT", /on delete restrict/i.test(migration));
    record(
        "creator transition matrix source",
        validation.includes('archived: ["draft"]')
            && validation.includes('published: ["archived"]')
            && validation.includes('rejected: ["draft", "processing", "archived"]')
            && !validation.includes('draft: ["published"]'),
    );
    record(
        "admin transition matrix source",
        validation.includes('pending_review: ["approved", "rejected", "draft"]')
            && validation.includes('approved: ["published", "rejected", "archived"]')
            && validation.includes('suspended: ["published", "archived"]'),
    );
    record(
        "unsafe error detector",
        isUnsafeRingtoneErrorMessage("ringtone_moderation_logs is immutable")
            && !isUnsafeRingtoneErrorMessage("Title is required."),
    );
}

async function main() {
    assertSourceContracts();

    if (!databaseUrl || !supabaseUrl || !serviceRoleKey || !anonKey) {
        record("live DB probes skipped (missing env)", true, "source contracts only");
        finish(0);
        return;
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const db = new PgClient({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const cleanup = { users: [], products: [], revisions: [], purchases: [], logs: [], jobs: [] };
    const password = `Temp-${token}!aA1`;
    const creatorEmail = `rt-append-creator-${token}@example.com`;
    const strangerEmail = `rt-append-stranger-${token}@example.com`;
    const buyerEmail = `rt-append-buyer-${token}@example.com`;

    try {
        const fk = await db.query(`
            select
              c.conname,
              pg_get_constraintdef(c.oid) as def
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public'
              and t.relname = 'ringtone_moderation_logs'
              and c.contype = 'f'
        `);
        const defs = (fk.rows || []).map((row) => String(row.def || ""));
        record(
            "DB FK restrict on ringtone_id",
            defs.some((d) => /ringtone_products/i.test(d) && /ON DELETE RESTRICT/i.test(d)),
            defs.join(" | "),
        );
        record(
            "DB FK restrict on revision_id",
            defs.some((d) => /ringtone_revisions/i.test(d) && /ON DELETE RESTRICT/i.test(d)),
            defs.join(" | "),
        );

        const creatorAuth = await admin.auth.admin.createUser({
            email: creatorEmail,
            password,
            email_confirm: true,
        });
        const strangerAuth = await admin.auth.admin.createUser({
            email: strangerEmail,
            password,
            email_confirm: true,
        });
        const buyerAuth = await admin.auth.admin.createUser({
            email: buyerEmail,
            password,
            email_confirm: true,
        });
        const creatorId = creatorAuth.data.user?.id;
        const strangerId = strangerAuth.data.user?.id;
        const buyerId = buyerAuth.data.user?.id;
        cleanup.users.push(creatorId, strangerId, buyerId);
        record("disposable users created", Boolean(creatorId && strangerId && buyerId));

        await admin.from("user_roles").upsert([
            { user_id: creatorId, role: "artist" },
        ], { onConflict: "user_id,role" });

        const product = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `Append Only Probe ${token}`,
            description: "lifecycle probe",
            artwork_url: "",
            preview_url: "https://example.com/preview.mp3",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            price_cents: 199,
            currency: "USD",
            status: "pending_review",
            ownership_confirmed: true,
            source_kind: "upload",
            source_storage_path: `${creatorId}/probe.wav`,
            preview_storage_path: `${creatorId}/preview.mp3`,
            iphone_storage_path: `${creatorId}/iphone.m4r`,
            android_storage_path: `${creatorId}/android.mp3`,
            iphone_available: true,
            android_available: true,
            revision_number: 1,
        }).select("*").single();
        const ringtoneId = product.data?.id;
        cleanup.products.push(ringtoneId);
        record("probe product created", Boolean(ringtoneId), product.error?.message || "");

        const revision = await admin.from("ringtone_revisions").insert({
            ringtone_id: ringtoneId,
            revision_number: 1,
            creator_id: creatorId,
            title: product.data.title,
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
            source_storage_path: `${creatorId}/probe.wav`,
            preview_storage_path: `${creatorId}/preview.mp3`,
            iphone_storage_path: `${creatorId}/iphone.m4r`,
            android_storage_path: `${creatorId}/android.mp3`,
            download_storage_path: `${creatorId}/android.mp3`,
            preview_url: "https://example.com/preview.mp3",
            status_at_snapshot: "pending_review",
        }).select("*").single();
        const revisionId = revision.data?.id;
        cleanup.revisions.push(revisionId);
        await admin.from("ringtone_products").update({ current_revision_id: revisionId }).eq("id", ringtoneId);

        const firstLog = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "approve",
            previous_status: "pending_review",
            new_status: "approved",
            actor_id: creatorId,
            actor_role: "admin",
            reason: "probe approve",
        }).select("*").single();
        cleanup.logs.push(firstLog.data?.id);
        record("append first moderation row", Boolean(firstLog.data?.id), firstLog.error?.message || "");

        const mutateUpdate = await admin.from("ringtone_moderation_logs").update({
            reason: "should fail",
        }).eq("id", firstLog.data.id).select("id");
        record("update moderation log blocked", Boolean(mutateUpdate.error), mutateUpdate.error?.message || "updated");

        const mutateDelete = await admin.from("ringtone_moderation_logs").delete().eq("id", firstLog.data.id);
        record("delete moderation log blocked", Boolean(mutateDelete.error), mutateDelete.error?.message || "deleted");

        // Publish then archive via product update + append-only log (mirrors admin path).
        await admin.from("ringtone_products").update({
            status: "published",
            published_at: new Date().toISOString(),
        }).eq("id", ringtoneId);
        const publishLog = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "publish",
            previous_status: "approved",
            new_status: "published",
            actor_id: creatorId,
            actor_role: "admin",
            reason: "",
        }).select("*").single();
        cleanup.logs.push(publishLog.data?.id);

        const purchase = await admin.from("ringtone_purchases").insert({
            ringtone_id: ringtoneId,
            buyer_id: buyerId,
            creator_id: creatorId,
            amount_cents: 199,
            platform_fee_cents: 20,
            creator_earnings_cents: 179,
            currency: "USD",
            payment_status: "paid",
            payment_provider: "test",
            payment_reference: `append-${token}`,
            idempotency_key: `append-${token}`,
            revision_id: revisionId,
            revision_number: 1,
        }).select("*").single();
        cleanup.purchases.push(purchase.data?.id);
        record("purchase pinned to revision", purchase.data?.revision_id === revisionId, purchase.error?.message || "");

        // Hard delete must not cascade-wipe logs (RESTRICT).
        const hardDelete = await admin.from("ringtone_products").delete().eq("id", ringtoneId);
        record(
            "product hard-delete blocked while logs exist",
            Boolean(hardDelete.error),
            hardDelete.error?.message || "deleted unexpectedly",
        );

        const logsBeforeArchive = await admin
            .from("ringtone_moderation_logs")
            .select("id,action,previous_status,new_status,reason,created_at")
            .eq("ringtone_id", ringtoneId)
            .order("created_at", { ascending: true });
        const beforeSnapshot = JSON.stringify(logsBeforeArchive.data || []);

        await admin.from("ringtone_products").update({ status: "archived" }).eq("id", ringtoneId);
        const archiveLog = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "archive",
            previous_status: "published",
            new_status: "archived",
            actor_id: creatorId,
            actor_role: "creator",
            reason: "",
        }).select("*").single();
        cleanup.logs.push(archiveLog.data?.id);
        record("archive appends new log row", Boolean(archiveLog.data?.id), archiveLog.error?.message || "");

        // Return to review (archived → draft) + append.
        await admin.from("ringtone_products").update({ status: "draft" }).eq("id", ringtoneId);
        const returnLog = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "return_to_review",
            previous_status: "archived",
            new_status: "draft",
            actor_id: creatorId,
            actor_role: "creator",
            reason: "",
        }).select("*").single();
        cleanup.logs.push(returnLog.data?.id);
        record("return-to-review appends new log row", Boolean(returnLog.data?.id), returnLog.error?.message || "");

        const logsAfter = await admin
            .from("ringtone_moderation_logs")
            .select("id,action,previous_status,new_status,reason,created_at")
            .eq("ringtone_id", ringtoneId)
            .order("created_at", { ascending: true });
        const priorIds = new Set((logsBeforeArchive.data || []).map((row) => row.id));
        const priorUnchanged = (logsAfter.data || [])
            .filter((row) => priorIds.has(row.id))
            .every((row) => {
                const original = (logsBeforeArchive.data || []).find((item) => item.id === row.id);
                return original
                    && original.action === row.action
                    && original.previous_status === row.previous_status
                    && original.new_status === row.new_status
                    && original.reason === row.reason
                    && original.created_at === row.created_at;
            });
        record("previous moderation rows unchanged", priorUnchanged, `before=${beforeSnapshot.length}`);
        record(
            "moderation history grew append-only",
            (logsAfter.data || []).length >= (logsBeforeArchive.data || []).length + 2,
            `count=${(logsAfter.data || []).length}`,
        );

        const pinned = await admin.from("ringtone_purchases").select("revision_id").eq("id", purchase.data.id).maybeSingle();
        const oldRev = await admin.from("ringtone_revisions").select("id,iphone_storage_path").eq("id", revisionId).maybeSingle();
        record(
            "revision-preservation after return-to-review",
            pinned.data?.revision_id === revisionId && Boolean(oldRev.data?.iphone_storage_path),
        );

        // Idempotent archived retain: product stays archived/draft; repeated archive log not required here.
        await admin.from("ringtone_products").update({ status: "archived" }).eq("id", ringtoneId);
        const status1 = await admin.from("ringtone_products").select("status").eq("id", ringtoneId).maybeSingle();
        await admin.from("ringtone_products").update({ status: "archived" }).eq("id", ringtoneId);
        const status2 = await admin.from("ringtone_products").select("status").eq("id", ringtoneId).maybeSingle();
        record("duplicate archive clicks are idempotent", status1.data?.status === "archived" && status2.data?.status === "archived");

        // Non-admin cannot insert moderation logs (RLS).
        const stranger = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await stranger.auth.signInWithPassword({ email: strangerEmail, password });
        const strangerInsert = await stranger.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "approve",
            previous_status: "draft",
            new_status: "approved",
            actor_id: strangerId,
            actor_role: "admin",
            reason: "should deny",
        });
        record("non-admin moderation insert denied", Boolean(strangerInsert.error), strangerInsert.error?.message || "allowed");

        const marketplace = await admin
            .from("ringtone_products")
            .select("id,title,status")
            .eq("status", "published");
        const titles = (marketplace.data || []).map((row) => String(row.title || ""));
        const hasHoney = titles.some((title) => /honey\s*comb/i.test(title));
        const hasQueen = titles.some((title) => /queen\s*and\s*lady/i.test(title));
        record(
            "marketplace published Honey Comb + Queen And Lady",
            hasHoney && hasQueen,
            titles.join(" | ") || "none",
        );
    } catch (error) {
        record("live probes", false, error instanceof Error ? error.message : String(error));
    } finally {
        try {
            if (cleanup.purchases.length) {
                await admin.from("ringtone_purchases").delete().in("id", cleanup.purchases.filter(Boolean));
            }
            if (cleanup.jobs.length) {
                await admin.from("ringtone_processing_jobs").delete().in("id", cleanup.jobs.filter(Boolean));
            }
            await db.query("alter table public.ringtone_moderation_logs disable trigger ringtone_moderation_logs_forbid_delete");
            if (cleanup.logs.length) {
                await db.query("delete from public.ringtone_moderation_logs where id = any($1::uuid[])", [cleanup.logs.filter(Boolean)]);
            }
            if (cleanup.products.length) {
                await db.query("delete from public.ringtone_moderation_logs where ringtone_id = any($1::uuid[])", [cleanup.products.filter(Boolean)]);
            }
            await db.query("alter table public.ringtone_moderation_logs enable trigger ringtone_moderation_logs_forbid_delete");
            if (cleanup.revisions.length) {
                await admin.from("ringtone_revisions").delete().in("id", cleanup.revisions.filter(Boolean));
            }
            if (cleanup.products.length) {
                await admin.from("ringtone_products").delete().in("id", cleanup.products.filter(Boolean));
            }
            for (const userId of cleanup.users.filter(Boolean)) {
                await admin.auth.admin.deleteUser(userId).catch(() => {});
            }
            record("disposable cleanup", true);
        } catch (cleanupError) {
            record("disposable cleanup", false, cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
        }
        await db.end().catch(() => {});
    }

    const failed = results.filter((row) => !row.ok).length;
    finish(failed ? 1 : 0);
}

function finish(code) {
    const failed = results.filter((row) => !row.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(code);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
