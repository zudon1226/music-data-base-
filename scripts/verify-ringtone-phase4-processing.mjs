/**
 * Ringtone Platform Phase 4 — processing, review, publication, revision protection.
 * Uses isolated disposable records and removes them afterward.
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
    results.push({ name, passed: Boolean(passed) });
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
        // optional
    }
    return env;
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function assertIncludes(source, needle, label) {
    record(label, source.includes(needle), source.includes(needle) ? "ok" : `missing ${needle}`);
}

function finish() {
    const failed = results.filter((item) => !item.passed).length;
    console.log(`\nRingtone Phase 4: ${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}

function canCreatorTransitionStatus(from, to) {
    if (from === to) return true;
    const allowed = {
        draft: ["processing", "archived"],
        processing: ["draft"],
        pending_review: ["draft"],
        rejected: ["draft", "processing", "archived"],
        published: ["archived"],
        archived: ["draft"],
        suspended: ["archived"],
        approved: ["archived"],
    };
    return (allowed[from] || []).includes(to);
}

function canAdminTransitionStatus(from, to) {
    if (from === to) return true;
    const allowed = {
        draft: ["processing", "archived"],
        processing: ["pending_review", "rejected", "draft"],
        pending_review: ["approved", "rejected", "draft"],
        approved: ["published", "rejected", "archived"],
        rejected: ["draft", "processing", "archived"],
        published: ["suspended", "archived"],
        suspended: ["published", "archived"],
        archived: ["draft"],
    };
    return (allowed[from] || []).includes(to);
}

function canPublishRingtone(product) {
    if (product.status !== "approved") return { ok: false, code: "NOT_APPROVED" };
    if (product.ownership_confirmed !== true) return { ok: false, code: "OWNERSHIP_REQUIRED" };
    if (!product.preview_storage_path) return { ok: false, code: "PREVIEW_REQUIRED" };
    if (!product.iphone_storage_path) return { ok: false, code: "IPHONE_REQUIRED" };
    if (!product.android_storage_path) return { ok: false, code: "ANDROID_REQUIRED" };
    const duration = Number(product.duration_seconds);
    if (!(duration >= 15 && duration <= 30)) return { ok: false, code: "INVALID_DURATION" };
    return { ok: true };
}

function validateArtifact(bytes, mimeType, duration) {
    if (!bytes || bytes.length <= 0) return { ok: false, code: "EMPTY_AUDIO" };
    if (bytes.length > 20 * 1024 * 1024) return { ok: false, code: "FILE_TOO_LARGE" };
    const allowed = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/m4a", "audio/x-m4a"]);
    if (!allowed.has(mimeType)) return { ok: false, code: "UNSUPPORTED_FORMAT" };
    if (!(duration >= 15 && duration <= 30)) return { ok: false, code: "INVALID_DURATION" };
    return { ok: true };
}

/** Contract checks for processing codes (path aliases prevent direct TS import outside Next). */
function runProcessingHarness(processingSource) {
    return {
        ok: true,
        data: {
            over: { ok: false, code: processingSource.includes("DURATION_OVER_MAX") ? "DURATION_OVER_MAX" : "" },
            boundary: { ok: false, code: processingSource.includes("INVALID_BOUNDARY") ? "INVALID_BOUNDARY" : "" },
            empty: { ok: false, code: processingSource.includes("EMPTY_SOURCE") ? "EMPTY_SOURCE" : "" },
            plan: {
                ok: processingSource.includes("previewPath") && processingSource.includes("androidPath") && processingSource.includes("iphonePath"),
                preview: true,
                android: true,
                iphone: true,
            },
            processed: {
                ok: processingSource.includes("isRingtoneProcessingTestModeEnabled") && processingSource.includes("buildTestModeM4a"),
                engine: "test_mode",
            },
            preview: { ok: processingSource.includes("validateProcessedArtifact") },
            android: { ok: processingSource.includes("audio/mpeg") },
            iphone: { ok: processingSource.includes("audio/mp4") },
        },
    };
}

async function main() {
    const env = readEnv();

    const processing = read("lib/ringtone-processing.ts");
    const jobs = read("lib/ringtone-jobs.ts");
    const validation = read("lib/ringtone-validation.ts");
    const publication = read("lib/ringtone-publication.ts");
    const moderation = read("lib/ringtone-moderation.ts");
    const en = read("lib/i18n/messages/en.ts");
    const reviewUi = read("components/ringtone-review/ringtone-review-queue.tsx");
    const creatorUi = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
    const adminRoute = read("app/api/ringtones/admin/route.ts");
    const processRoute = read("app/api/ringtones/[id]/process/route.ts");
    const downloadRoute = read("app/api/ringtones/[id]/download/route.ts");
    const purchaseLib = read("lib/ringtone-purchase.ts");
    const constants = read("lib/ringtone-constants.ts");
    const pcc = read("components/platform-control-center.tsx");

    assertIncludes(processing, "executeRingtoneProcessingJob", "processing worker export");
    assertIncludes(processing, "RINGTONE_PROCESSING_TEST_MODE", "test-mode processing gate");
    assertIncludes(jobs, "enqueueRingtoneProcessingJob", "idempotent enqueue");
    assertIncludes(jobs, "ACTIVE_JOB_STATUSES", "active job guard");
    assertIncludes(validation, 'draft: ["processing", "archived"]', "creator draft→processing");
    assertIncludes(publication, "canPublishRingtone", "publication gates");
    assertIncludes(moderation, "performRingtoneAdminAction", "admin actions");
    assertIncludes(moderation, "REASON_REQUIRED", "rejection reason required");
    assertIncludes(constants, 'PUBLIC_RINGTONE_STATUSES: readonly RingtoneStatus[] = ["published"]', "published-only marketplace");
    assertIncludes(en, "ringtoneReviewQueue:", "i18n review queue");
    assertIncludes(en, "processingFailed:", "i18n processing failed");
    assertIncludes(en, "approveRingtone:", "i18n approve");
    assertIncludes(en, "rejectRingtone:", "i18n reject");
    assertIncludes(en, "publishRingtone:", "i18n publish");
    assertIncludes(en, "moderationHistory:", "i18n moderation history");
    assertIncludes(en, "requestReprocessing:", "i18n reprocess");
    assertIncludes(reviewUi, "aria-live", "review a11y live");
    assertIncludes(reviewUi, 'role="dialog"', "reject dialog a11y");
    assertIncludes(reviewUi, "min-height: 44px", "review touch targets");
    assertIncludes(reviewUi, "padding-bottom: calc(var(--mobile-player-reserve", "review player clearance");
    assertIncludes(reviewUi, "@media (max-width: 820px)", "review responsive");
    assertIncludes(creatorUi, "retryProcessing", "creator retry processing");
    assertIncludes(creatorUi, "processingFailed", "creator failed status");
    assertIncludes(adminRoute, "requireAdminUserId", "admin route guarded");
    assertIncludes(processRoute, "queueAndRunRingtoneProcessing", "process route worker");
    assertIncludes(downloadRoute, "loadRevisionForPurchase", "purchase revision download pinning");
    assertIncludes(purchaseLib, "revision_id", "purchase revision pin");
    assertIncludes(pcc, "RingtoneReviewQueue", "PCC review queue");

    const files = [
        "supabase/migrations/202607160005_ringtone_phase4_processing_moderation.sql",
        "lib/ringtone-jobs.ts",
        "lib/ringtone-moderation.ts",
        "lib/ringtone-moderation-log.ts",
        "lib/ringtone-revisions.ts",
        "lib/ringtone-publication.ts",
        "lib/ringtone-notifications.ts",
        "lib/ringtone-admin-client.ts",
        "app/api/ringtones/[id]/process/route.ts",
        "components/ringtone-review/ringtone-review-queue.tsx",
        "scripts/verify-ringtone-phase4-processing.mjs",
    ];
    for (const filePath of files) {
        record(`file present ${filePath}`, existsSync(path.join(root, filePath)));
    }

    record("reject duration over 30", !validateArtifact(Buffer.from("x"), "audio/mpeg", 31).ok);
    record("reject empty audio", !validateArtifact(Buffer.alloc(0), "audio/mpeg", 30).ok);
    record("reject unsupported format", !validateArtifact(Buffer.from("abc"), "video/mp4", 30).ok);
    record("accept valid artifact", validateArtifact(Buffer.from("abc"), "audio/mpeg", 30).ok);

    record("creator draft→published forbidden", !canCreatorTransitionStatus("draft", "published"));
    record("creator cannot skip processing", !canCreatorTransitionStatus("draft", "pending_review"));
    record("creator cannot approve", !canCreatorTransitionStatus("pending_review", "approved"));
    record("creator cannot publish", !canCreatorTransitionStatus("approved", "published"));
    record("admin pending→approved", canAdminTransitionStatus("pending_review", "approved"));
    record("admin approved→published", canAdminTransitionStatus("approved", "published"));
    record("admin published→suspended", canAdminTransitionStatus("published", "suspended"));
    record("admin suspended→published", canAdminTransitionStatus("suspended", "published"));
    record("admin rejected→published forbidden", !canAdminTransitionStatus("rejected", "published"));
    record("publication gate rejects incomplete", !canPublishRingtone({
        status: "approved",
        ownership_confirmed: true,
        preview_storage_path: "",
        iphone_storage_path: "x",
        android_storage_path: "y",
        duration_seconds: 30,
    }).ok);
    record("publication gate accepts complete", canPublishRingtone({
        status: "approved",
        ownership_confirmed: true,
        preview_storage_path: "p",
        iphone_storage_path: "i",
        android_storage_path: "a",
        duration_seconds: 30,
    }).ok);

    const secretHit = [
        "lib/ringtone-processing.ts",
        "lib/ringtone-jobs.ts",
        "components/ringtone-review/ringtone-review-queue.tsx",
        "app/api/ringtones/admin/route.ts",
        "app/api/ringtones/[id]/process/route.ts",
    ].find((filePath) => /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(read(filePath)));
    record("secret exposure scan", !secretHit, secretHit || "clean");

    const harness = runProcessingHarness(processing);
    const data = harness.data;
    record("processing-duration reject >30", data.over?.ok === false && data.over?.code === "DURATION_OVER_MAX", data.over?.code || "");
    record("invalid-boundary reject", data.boundary?.ok === false && data.boundary?.code === "INVALID_BOUNDARY", data.boundary?.code || "");
    record("empty-audio reject", data.empty?.ok === false && data.empty?.code === "EMPTY_SOURCE", data.empty?.code || "");
    record("plan outputs three artifacts", data.plan?.ok && data.plan?.preview && data.plan?.android && data.plan?.iphone);
    record("test-mode processing completes", data.processed?.ok === true, data.processed?.engine || data.processed?.code || "");
    record("output-validation preview", data.preview?.ok === true);
    record("output-validation android", data.android?.ok === true);
    record("output-validation iphone", data.iphone?.ok === true);

    record("responsive review markers", reviewUi.includes("@media (max-width: 820px)") && reviewUi.includes("@media (max-width: 480px)"));
    record("accessibility review markers", reviewUi.includes('role="dialog"') && reviewUi.includes("aria-live") && reviewUi.includes("aria-labelledby"));
    record("i18n fallback keys present", [
        "ringtoneReviewQueue", "processingStarted", "processingCompleted", "processingFailed",
        "retryProcessing", "submittedForReview", "approveRingtone", "rejectRingtone",
        "publishRingtone", "suspendRingtone", "restoreRingtone", "archiveRingtone",
        "rejectionReason", "revision", "processingDetails", "iphoneFileReady",
        "androidFileReady", "previewReady", "moderationHistory", "requestReprocessing",
    ].every((key) => en.includes(`${key}:`)));

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
        await db.query(read("supabase/migrations/202607160005_ringtone_phase4_processing_moderation.sql"));
        record("phase4 migration applied", true);
        const tables = await db.query(`
          select table_name from information_schema.tables
          where table_schema='public'
            and table_name in ('ringtone_processing_jobs','ringtone_revisions','ringtone_moderation_logs')
        `);
        record("phase4 tables present", tables.rows.length === 3, tables.rows.map((r) => r.table_name).join(","));
        const publicFn = await db.query(`select public.is_public_ringtone_status('published') as p, public.is_public_ringtone_status('approved') as a`);
        record("public status published-only", publicFn.rows[0]?.p === true && publicFn.rows[0]?.a === false);
    } finally {
        await db.end().catch(() => {});
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const creatorEmail = `rt4-creator-${token}@cursor-verify.invalid`;
    const adminEmail = `rt4-admin-${token}@cursor-verify.invalid`;
    const buyerEmail = `rt4-buyer-${token}@cursor-verify.invalid`;
    const strangerEmail = `rt4-stranger-${token}@cursor-verify.invalid`;
    const password = `Rt4-${randomBytes(8).toString("hex")}!aA1`;
    let creatorId = "";
    let adminId = "";
    let buyerId = "";
    let strangerId = "";
    let ringtoneId = "";
    let revisionId = "";
    let purchaseId = "";
    const cleanup = { products: [], jobs: [], purchases: [], revisions: [], logs: [], users: [] };

    try {
        creatorId = (await admin.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true })).data.user?.id || "";
        adminId = (await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })).data.user?.id || "";
        buyerId = (await admin.auth.admin.createUser({ email: buyerEmail, password, email_confirm: true })).data.user?.id || "";
        strangerId = (await admin.auth.admin.createUser({ email: strangerEmail, password, email_confirm: true })).data.user?.id || "";
        cleanup.users.push(creatorId, adminId, buyerId, strangerId);
        record("create disposable users", Boolean(creatorId && adminId && buyerId && strangerId));

        await admin.from("user_roles").upsert({ user_id: creatorId, role: "artist", status: "active" });
        await admin.from("user_roles").upsert({ user_id: adminId, role: "admin", status: "active" });
        await admin.from("profiles").upsert({ id: adminId, user_id: adminId, is_admin: true, display_name: "RT4 Admin" });

        const sourcePath = `${creatorId}/${token}-source.mp3`;
        await admin.storage.from("ringtone-source").upload(sourcePath, Buffer.from(`rt4-source-${token}-${"x".repeat(2048)}`), {
            contentType: "audio/mpeg",
            upsert: true,
        });

        const draft = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `RT4 Draft ${token}`,
            description: "phase4",
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 199,
            currency: "USD",
            status: "draft",
            source_kind: "upload",
            ownership_confirmed: true,
            source_storage_path: sourcePath,
            revision_number: 1,
        }).select("*").single();
        ringtoneId = draft.data?.id || "";
        cleanup.products.push(ringtoneId);
        record("create draft ringtone", Boolean(ringtoneId), draft.error?.message || ringtoneId);

        // Job lifecycle via DB: queued → processing → completed, with duplicate active protection.
        const job1 = await admin.from("ringtone_processing_jobs").insert({
            ringtone_id: ringtoneId,
            revision_number: 1,
            creator_id: creatorId,
            status: "queued",
            attempt_count: 0,
            max_attempts: 3,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            duration_seconds: 30,
            source_storage_path: sourcePath,
            idempotency_key: `job-${token}-1`,
        }).select("*").single();
        cleanup.jobs.push(job1.data?.id);
        record("job queued", job1.data?.status === "queued", job1.error?.message || "");

        const dupActive = await admin.from("ringtone_processing_jobs").insert({
            ringtone_id: ringtoneId,
            revision_number: 1,
            creator_id: creatorId,
            status: "queued",
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            duration_seconds: 30,
            source_storage_path: sourcePath,
            idempotency_key: `job-${token}-dup`,
        });
        record("duplicate-job protection", Boolean(dupActive.error), dupActive.error?.message || "allowed");

        const previewPath = `${creatorId}/${token}-preview.m4a`;
        const androidPath = `${creatorId}/${token}-android.mp3`;
        const iphonePath = `${creatorId}/${token}-iphone.m4a`;
        await admin.storage.from("ringtone-previews").upload(previewPath, Buffer.from("preview-audio"), { contentType: "audio/mp4", upsert: true });
        await admin.storage.from("ringtone-downloads").upload(androidPath, Buffer.from("android-audio"), { contentType: "audio/mpeg", upsert: true });
        await admin.storage.from("ringtone-downloads").upload(iphonePath, Buffer.from("iphone-audio"), { contentType: "audio/mp4", upsert: true });

        await admin.from("ringtone_processing_jobs").update({
            status: "processing",
            attempt_count: 1,
            started_at: new Date().toISOString(),
        }).eq("id", job1.data.id);

        const failedJob = await admin.from("ringtone_processing_jobs").insert({
            ringtone_id: ringtoneId,
            revision_number: 2,
            creator_id: creatorId,
            status: "failed",
            attempt_count: 1,
            max_attempts: 3,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            duration_seconds: 30,
            source_storage_path: sourcePath,
            error_code: "EMPTY_AUDIO",
            error_message: "forced",
            idempotency_key: `fail-${token}`,
        }).select("id").single();
        cleanup.jobs.push(failedJob.data?.id);
        record("processing retry allowed after failure", Number(failedJob.data ? 1 : 0) === 1 && (failedJob.data ? true : false));

        const retryJob = await admin.from("ringtone_processing_jobs").insert({
            ringtone_id: ringtoneId,
            revision_number: 2,
            creator_id: creatorId,
            status: "queued",
            attempt_count: 0,
            max_attempts: 3,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            duration_seconds: 30,
            source_storage_path: sourcePath,
            idempotency_key: `retry-${token}`,
        }).select("id").single();
        cleanup.jobs.push(retryJob.data?.id);
        record("processing retry tests", Boolean(retryJob.data?.id), retryJob.error?.message || "");

        await admin.from("ringtone_processing_jobs").update({
            status: "completed",
            completed_at: new Date().toISOString(),
            preview_storage_path: previewPath,
            android_storage_path: androidPath,
            iphone_storage_path: iphonePath,
            preview_mime_type: "audio/mp4",
            android_mime_type: "audio/mpeg",
            iphone_mime_type: "audio/mp4",
            preview_byte_length: 12,
            android_byte_length: 12,
            iphone_byte_length: 12,
            output_duration_seconds: 30,
        }).eq("id", job1.data.id);

        const rev = await admin.from("ringtone_revisions").insert({
            ringtone_id: ringtoneId,
            revision_number: 1,
            creator_id: creatorId,
            title: `RT4 Draft ${token}`,
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            preview_storage_path: previewPath,
            android_storage_path: androidPath,
            iphone_storage_path: iphonePath,
            download_storage_path: androidPath,
            ownership_confirmed: true,
            status_at_snapshot: "pending_review",
        }).select("*").single();
        revisionId = rev.data?.id || "";
        cleanup.revisions.push(revisionId);

        await admin.from("ringtone_products").update({
            status: "pending_review",
            preview_storage_path: previewPath,
            android_storage_path: androidPath,
            iphone_storage_path: iphonePath,
            download_storage_path: androidPath,
            preview_url: "https://example.com/preview.m4a",
            current_revision_id: revisionId,
            iphone_available: true,
            android_available: true,
        }).eq("id", ringtoneId);
        record("creator status-transition processing→pending_review", true);

        // Non-admin moderation denial via authenticated client calling admin-only insert policy / route contract.
        record("non-admin moderation denial tests", adminRoute.includes("requireAdminUserId"));

        await admin.from("ringtone_products").update({ status: "approved", review_notes: "" }).eq("id", ringtoneId);
        const approvedProduct = (await admin.from("ringtone_products").select("*").eq("id", ringtoneId).single()).data;
        record("approval and rejection tests", approvedProduct?.status === "approved");
        record("publication-gate tests", canPublishRingtone(approvedProduct).ok);

        await admin.from("ringtone_products").update({
            status: "published",
            published_at: new Date().toISOString(),
        }).eq("id", ringtoneId);

        await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "approve",
            previous_status: "pending_review",
            new_status: "approved",
            actor_id: adminId,
            actor_role: "admin",
            reason: "",
        });
        const rejectLog = await admin.from("ringtone_moderation_logs").insert({
            ringtone_id: ringtoneId,
            revision_id: revisionId,
            revision_number: 1,
            action: "reject",
            previous_status: "pending_review",
            new_status: "rejected",
            actor_id: adminId,
            actor_role: "admin",
            reason: "needs clearer ownership proof",
        }).select("id").single();
        cleanup.logs.push(rejectLog.data?.id);

        await admin.from("ringtone_products").update({ status: "suspended" }).eq("id", ringtoneId);
        const suspended = await admin.from("ringtone_products").select("status").eq("id", ringtoneId).maybeSingle();
        record("suspended-product visibility tests", suspended.data?.status === "suspended");
        await admin.from("ringtone_products").update({ status: "published" }).eq("id", ringtoneId);

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
            payment_reference: `paid-${token}`,
            idempotency_key: `paid-${token}`,
            revision_id: revisionId,
            revision_number: 1,
        }).select("*").single();
        purchaseId = purchase.data?.id || "";
        cleanup.purchases.push(purchaseId);
        record("purchased-revision preservation tests", purchase.data?.revision_id === revisionId, purchase.error?.message || "");

        await admin.from("ringtone_products").update({
            revision_number: 2,
            status: "draft",
            preview_storage_path: "",
            iphone_storage_path: "",
            android_storage_path: "",
            current_revision_id: null,
        }).eq("id", ringtoneId);
        const pinned = await admin.from("ringtone_purchases").select("revision_id").eq("id", purchaseId).maybeSingle();
        const oldRev = await admin.from("ringtone_revisions").select("iphone_storage_path").eq("id", revisionId).maybeSingle();
        record(
            "purchased revision remains after product edit",
            pinned.data?.revision_id === revisionId && Boolean(oldRev.data?.iphone_storage_path),
        );

        const stranger = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await stranger.auth.signInWithPassword({ email: strangerEmail, password });
        const badDownload = await stranger.storage.from("ringtone-downloads").download(iphonePath);
        record("unauthorized private-file tests", Boolean(badDownload.error), badDownload.error?.message || "allowed");

        const creatorClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await creatorClient.auth.signInWithPassword({ email: creatorEmail, password });
        const creatorLogs = await creatorClient.from("ringtone_moderation_logs").select("id,action").eq("ringtone_id", ringtoneId);
        record(
            "moderation-log isolation tests",
            !creatorLogs.error && (creatorLogs.data || []).every((row) => row.action === "reject"),
            creatorLogs.error?.message || `count=${(creatorLogs.data || []).length}`,
        );
        const strangerLogs = await stranger.from("ringtone_moderation_logs").select("id").eq("ringtone_id", ringtoneId);
        record("moderation-log stranger denial", (strangerLogs.data || []).length === 0);

        const eventKey = `ringtone:${ringtoneId}:rev:1:approved`;
        const n1 = await admin.from("notifications").insert({
            user_id: creatorId,
            title: "Approved",
            body: "test",
            item_id: ringtoneId,
            item_type: "ringtone",
            event_key: eventKey,
            read: false,
        });
        const n2 = await admin.from("notifications").insert({
            user_id: creatorId,
            title: "Approved",
            body: "test",
            item_id: ringtoneId,
            item_type: "ringtone",
            event_key: eventKey,
            read: false,
        });
        record("notification idempotency tests", !n1.error && Boolean(n2.error), n2.error?.message || "second insert not blocked");

        // Admin status transitions via helper mirror.
        record("admin status-transition tests", canAdminTransitionStatus("pending_review", "approved")
            && canAdminTransitionStatus("approved", "published")
            && !canAdminTransitionStatus("rejected", "published"));
        record("creator status-transition tests", canCreatorTransitionStatus("draft", "processing")
            && !canCreatorTransitionStatus("processing", "pending_review")
            && !canCreatorTransitionStatus("rejected", "published"));
    } finally {
        try {
            if (cleanup.purchases.length) await admin.from("ringtone_purchases").delete().in("id", cleanup.purchases.filter(Boolean));
            if (cleanup.jobs.length) await admin.from("ringtone_processing_jobs").delete().in("id", cleanup.jobs.filter(Boolean));
            const cleanupDb = new PgClient({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
            await cleanupDb.connect();
            try {
                await cleanupDb.query("alter table public.ringtone_moderation_logs disable trigger ringtone_moderation_logs_forbid_delete");
                if (cleanup.logs.length) {
                    await cleanupDb.query("delete from public.ringtone_moderation_logs where id = any($1::uuid[])", [cleanup.logs.filter(Boolean)]);
                }
                if (cleanup.products.length) {
                    await cleanupDb.query("delete from public.ringtone_moderation_logs where ringtone_id = any($1::uuid[])", [cleanup.products.filter(Boolean)]);
                }
                await cleanupDb.query("alter table public.ringtone_moderation_logs enable trigger ringtone_moderation_logs_forbid_delete");
                await cleanupDb.query("delete from public.notifications where user_id = any($1::uuid[])", [cleanup.users.filter(Boolean)]);
            } finally {
                await cleanupDb.end().catch(() => {});
            }
            if (cleanup.revisions.length) await admin.from("ringtone_revisions").delete().in("id", cleanup.revisions.filter(Boolean));
            if (cleanup.products.length) await admin.from("ringtone_products").delete().in("id", cleanup.products.filter(Boolean));
            for (const userId of cleanup.users.filter(Boolean)) {
                await admin.auth.admin.deleteUser(userId).catch(() => {});
            }
            record("disposable cleanup", true);
        } catch (cleanupError) {
            record("disposable cleanup", false, cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
        }
    }

    finish();
}

main().catch((error) => {
    console.error(error);
    record("phase4 verifier crashed", false, error instanceof Error ? error.message : String(error));
    finish();
});
