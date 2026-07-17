/**
 * Ringtone processing job lifecycle (Phase 4).
 * Statuses: queued → processing → completed | failed | canceled
 */

import { RINGTONE_STORAGE_BUCKETS } from "@/lib/ringtone-constants";
import {
    RINGTONE_PROCESSING_VERSION,
    planRingtoneProcessing,
    executeRingtoneProcessingJob,
    checksumBuffer,
} from "@/lib/ringtone-processing";
import { notifyRingtoneEvent } from "@/lib/ringtone-notifications";
import { snapshotRingtoneRevision } from "@/lib/ringtone-revisions";
import { writeRingtoneModerationLog } from "@/lib/ringtone-moderation-log";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const RINGTONE_JOB_STATUSES = [
    "queued",
    "processing",
    "completed",
    "failed",
    "canceled",
] as const;

export type RingtoneJobStatus = (typeof RINGTONE_JOB_STATUSES)[number];

const ACTIVE_JOB_STATUSES = ["queued", "processing"] as const;

function creatorSafeError(code: string, message: string) {
    const safeCodes = new Set([
        "EMPTY_SOURCE",
        "EMPTY_AUDIO",
        "DURATION_OVER_MAX",
        "DURATION_UNDER_MIN",
        "INVALID_BOUNDARY",
        "UNSUPPORTED_FORMAT",
        "FILE_TOO_LARGE",
        "SOURCE_MISSING",
        "PLAN_FAILED",
        "UPLOAD_FAILED",
        "FFMPEG_UNAVAILABLE",
        "RETRY_LIMIT",
        "DUPLICATE_JOB",
        "NOT_READY",
    ]);
    if (safeCodes.has(code)) return message;
    return "Processing failed. Please retry or contact support.";
}

export async function findActiveRingtoneJob(ringtoneId: string, revisionNumber?: number) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("ringtone_processing_jobs")
        .select("*")
        .eq("ringtone_id", ringtoneId)
        .in("status", [...ACTIVE_JOB_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1);
    if (revisionNumber != null) query = query.eq("revision_number", revisionNumber);
    const { data, error } = await query.maybeSingle();
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    return { ok: true as const, job: data || null };
}

export async function getLatestRingtoneJob(ringtoneId: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("ringtone_processing_jobs")
        .select("*")
        .eq("ringtone_id", ringtoneId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    return { ok: true as const, job: data || null };
}

/**
 * Idempotent job creation: one active job per ringtone revision.
 * Returns the existing active job when present.
 */
export async function enqueueRingtoneProcessingJob(input: {
    ringtoneId: string;
    actorId: string;
    actorRole?: string;
    forceRetry?: boolean;
}) {
    if (!isUuid(input.ringtoneId) || !isUuid(input.actorId)) {
        return { ok: false as const, error: "Invalid ringtone or actor id.", status: 400, code: "INVALID_ID" };
    }

    const supabase = getSupabaseServerClient();
    const product = await supabase.from("ringtone_products").select("*").eq("id", input.ringtoneId).maybeSingle();
    if (product.error) return { ok: false as const, error: getErrorMessage(product.error), status: 500, code: "DB_ERROR" };
    if (!product.data) return { ok: false as const, error: "Ringtone not found.", status: 404, code: "NOT_FOUND" };

    const row = product.data;
    const revisionNumber = Number(row.revision_number || 1);
    const status = String(row.status || "draft");

    if (!["draft", "processing", "rejected", "pending_review"].includes(status) && !input.forceRetry) {
        return {
            ok: false as const,
            error: `Cannot queue processing from status ${status}.`,
            status: 400,
            code: "INVALID_STATUS",
        };
    }

    const active = await findActiveRingtoneJob(input.ringtoneId, revisionNumber);
    if (!active.ok) return { ok: false as const, error: active.error, status: 500, code: "DB_ERROR" };
    if (active.job) {
        return {
            ok: true as const,
            job: active.job,
            created: false,
            duplicate: true,
            ringtone: row,
        };
    }

    if (input.forceRetry) {
        const latest = await getLatestRingtoneJob(input.ringtoneId);
        if (latest.ok && latest.job && String(latest.job.status) === "failed") {
            const attempts = Number(latest.job.attempt_count || 0);
            const maxAttempts = Number(latest.job.max_attempts || 3);
            if (attempts >= maxAttempts) {
                return {
                    ok: false as const,
                    error: "Retry limit reached for this ringtone revision.",
                    status: 409,
                    code: "RETRY_LIMIT",
                };
            }
        }
    }

    const sourcePath = String(row.source_storage_path || "");
    if (!sourcePath) {
        return { ok: false as const, error: "Source audio is required before processing.", status: 400, code: "SOURCE_MISSING" };
    }

    const plan = planRingtoneProcessing({
        ringtoneId: input.ringtoneId,
        creatorId: String(row.creator_id),
        sourceBucket: RINGTONE_STORAGE_BUCKETS.source,
        sourcePath,
        clipStartSeconds: Number(row.clip_start_seconds),
        clipEndSeconds: Number(row.clip_end_seconds),
        durationSeconds: Number(row.duration_seconds),
        revisionNumber,
        sourceChecksum: String(row.source_checksum || ""),
    });
    if (!plan.ok) {
        return { ok: false as const, error: plan.error, status: 400, code: "PLAN_FAILED" };
    }

    const idempotencyKey = `${input.ringtoneId}:${revisionNumber}:${RINGTONE_PROCESSING_VERSION}:${sourcePath}:${row.clip_start_seconds}:${row.clip_end_seconds}`;

    const existingIdempotent = await supabase
        .from("ringtone_processing_jobs")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .in("status", ["queued", "processing", "completed"])
        .maybeSingle();
    if (existingIdempotent.data && String(existingIdempotent.data.status) !== "failed") {
        return {
            ok: true as const,
            job: existingIdempotent.data,
            created: false,
            duplicate: true,
            ringtone: row,
        };
    }

    const insert = await supabase.from("ringtone_processing_jobs").insert({
        ringtone_id: input.ringtoneId,
        revision_number: revisionNumber,
        creator_id: row.creator_id,
        status: "queued",
        attempt_count: 0,
        max_attempts: 3,
        processing_version: RINGTONE_PROCESSING_VERSION,
        source_storage_path: sourcePath,
        source_checksum: String(row.source_checksum || ""),
        source_bucket: RINGTONE_STORAGE_BUCKETS.source,
        clip_start_seconds: Number(row.clip_start_seconds),
        clip_end_seconds: Number(row.clip_end_seconds),
        duration_seconds: Number(row.duration_seconds),
        preview_storage_path: plan.previewPath,
        iphone_storage_path: plan.iphonePath,
        android_storage_path: plan.androidPath,
        idempotency_key: idempotencyKey,
        queued_at: new Date().toISOString(),
    }).select("*").single();

    if (insert.error) {
        // Race: another active job won the unique index.
        const raced = await findActiveRingtoneJob(input.ringtoneId, revisionNumber);
        if (raced.ok && raced.job) {
            return { ok: true as const, job: raced.job, created: false, duplicate: true, ringtone: row };
        }
        return { ok: false as const, error: getErrorMessage(insert.error), status: 500, code: "DB_ERROR" };
    }

    await supabase.from("ringtone_products").update({
        status: "processing",
        last_processing_error: "",
        last_processing_error_code: "",
        processing_version: RINGTONE_PROCESSING_VERSION,
    }).eq("id", input.ringtoneId);

    await writeRingtoneModerationLog({
        ringtoneId: input.ringtoneId,
        revisionId: row.current_revision_id || null,
        revisionNumber,
        action: "queue_processing",
        previousStatus: status,
        newStatus: "processing",
        actorId: input.actorId,
        actorRole: input.actorRole || "creator",
        reason: "",
        metadata: { jobId: insert.data.id, duplicate: false },
    });

    await notifyRingtoneEvent({
        userId: String(row.creator_id),
        title: "Processing Started",
        body: `"${row.title}" is queued for secure ringtone processing.`,
        ringtoneId: input.ringtoneId,
        eventKey: `ringtone:${input.ringtoneId}:rev:${revisionNumber}:processing_started:${insert.data.id}`,
        itemType: "ringtone",
    });

    return {
        ok: true as const,
        job: insert.data,
        created: true,
        duplicate: false,
        ringtone: { ...row, status: "processing" },
    };
}

/** Run a queued job to completion. Safe to call repeatedly; completed/failed jobs no-op. */
export async function runRingtoneProcessingJob(jobId: string, actorId?: string) {
    if (!isUuid(jobId)) return { ok: false as const, error: "Invalid job id.", code: "INVALID_ID" };
    const supabase = getSupabaseServerClient();

    const existing = await supabase.from("ringtone_processing_jobs").select("*").eq("id", jobId).maybeSingle();
    if (existing.error) return { ok: false as const, error: getErrorMessage(existing.error), code: "DB_ERROR" };
    if (!existing.data) return { ok: false as const, error: "Job not found.", code: "NOT_FOUND" };

    const job = existing.data;
    if (job.status === "completed") return { ok: true as const, job, alreadyCompleted: true };
    if (job.status === "canceled") return { ok: false as const, error: "Job was canceled.", code: "CANCELED" };
    if (job.status === "processing") {
        // Another worker may own it; allow reclaim if started_at is stale (>10m) later if needed.
        return { ok: true as const, job, alreadyProcessing: true };
    }
    if (job.status !== "queued" && job.status !== "failed") {
        return { ok: false as const, error: `Cannot run job in status ${job.status}.`, code: "INVALID_STATUS" };
    }

    const attempts = Number(job.attempt_count || 0) + 1;
    const maxAttempts = Number(job.max_attempts || 3);
    if (attempts > maxAttempts) {
        return { ok: false as const, error: "Retry limit reached.", code: "RETRY_LIMIT" };
    }

    const claim = await supabase.from("ringtone_processing_jobs").update({
        status: "processing",
        attempt_count: attempts,
        started_at: new Date().toISOString(),
        error_code: "",
        error_message: "",
    }).eq("id", jobId).eq("status", job.status).select("*").single();
    if (claim.error || !claim.data) {
        return { ok: false as const, error: getErrorMessage(claim.error) || "Unable to claim job.", code: "CLAIM_FAILED" };
    }

    const product = await supabase.from("ringtone_products").select("*").eq("id", job.ringtone_id).maybeSingle();
    if (product.error || !product.data) {
        await failJob(jobId, "NOT_FOUND", "Ringtone product missing during processing.");
        return { ok: false as const, error: "Ringtone product missing.", code: "NOT_FOUND" };
    }

    // Always use DB clip bounds — ignore any client-supplied window.
    const clipStart = Number(product.data.clip_start_seconds);
    const clipEnd = Number(product.data.clip_end_seconds);
    const duration = Number(product.data.duration_seconds);

    const download = await supabase.storage
        .from(String(job.source_bucket || RINGTONE_STORAGE_BUCKETS.source))
        .download(String(job.source_storage_path || product.data.source_storage_path));

    if (download.error || !download.data) {
        const failed = await failJob(jobId, "SOURCE_MISSING", "Unable to retrieve private source audio.");
        await markProductFailed(product.data, "SOURCE_MISSING", "Unable to retrieve private source audio.");
        return { ok: false as const, error: "Unable to retrieve private source audio.", code: "SOURCE_MISSING", job: failed };
    }

    const sourceBytes = Buffer.from(await download.data.arrayBuffer());
    const sourceChecksum = checksumBuffer(sourceBytes);

    const executed = await executeRingtoneProcessingJob({
        ringtoneId: String(job.ringtone_id),
        creatorId: String(job.creator_id),
        sourceBucket: String(job.source_bucket || RINGTONE_STORAGE_BUCKETS.source),
        sourcePath: String(job.source_storage_path || product.data.source_storage_path),
        clipStartSeconds: clipStart,
        clipEndSeconds: clipEnd,
        durationSeconds: duration,
        revisionNumber: Number(job.revision_number || product.data.revision_number || 1),
        sourceChecksum,
    }, sourceBytes);

    if (!executed.ok) {
        const safe = creatorSafeError(executed.code, executed.error);
        const failed = await failJob(jobId, executed.code, safe, { details: executed.details || {} });
        await markProductFailed(product.data, executed.code, safe);
        await notifyRingtoneEvent({
            userId: String(product.data.creator_id),
            title: "Processing Failed",
            body: `"${product.data.title}" failed processing: ${safe}`,
            ringtoneId: String(product.data.id),
            eventKey: `ringtone:${product.data.id}:rev:${job.revision_number}:processing_failed:${jobId}:${attempts}`,
            itemType: "ringtone",
        });
        await notifyAdminsProcessingFailure(product.data, safe, jobId);
        return { ok: false as const, error: safe, code: executed.code, job: failed };
    }

    const previewUpload = await supabase.storage
        .from(executed.previewBucket)
        .upload(executed.previewPath, executed.previewBytes, {
            contentType: executed.previewMimeType,
            upsert: false,
        });
    const androidUpload = await supabase.storage
        .from(executed.downloadBucket)
        .upload(executed.androidPath, executed.androidBytes, {
            contentType: executed.androidMimeType,
            upsert: false,
        });
    const iphoneUpload = await supabase.storage
        .from(executed.downloadBucket)
        .upload(executed.iphonePath, executed.iphoneBytes, {
            contentType: executed.iphoneMimeType,
            upsert: false,
        });

    if (previewUpload.error || androidUpload.error || iphoneUpload.error) {
        const message = "Failed to store processed ringtone outputs.";
        const failed = await failJob(jobId, "UPLOAD_FAILED", message, {
            preview: previewUpload.error?.message,
            android: androidUpload.error?.message,
            iphone: iphoneUpload.error?.message,
        });
        await markProductFailed(product.data, "UPLOAD_FAILED", message);
        return { ok: false as const, error: message, code: "UPLOAD_FAILED", job: failed };
    }

    const { data: publicUrlData } = supabase.storage
        .from(executed.previewBucket)
        .getPublicUrl(executed.previewPath);
    const previewUrl = publicUrlData?.publicUrl || "";

    const completed = await supabase.from("ringtone_processing_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        source_checksum: executed.sourceChecksum,
        preview_storage_path: executed.previewPath,
        android_storage_path: executed.androidPath,
        iphone_storage_path: executed.iphonePath,
        preview_mime_type: executed.previewMimeType,
        android_mime_type: executed.androidMimeType,
        iphone_mime_type: executed.iphoneMimeType,
        preview_byte_length: executed.previewBytes.byteLength,
        android_byte_length: executed.androidBytes.byteLength,
        iphone_byte_length: executed.iphoneBytes.byteLength,
        output_duration_seconds: executed.outputDurationSeconds,
        processing_version: executed.processingVersion,
        result: executed.result,
        error_code: "",
        error_message: "",
    }).eq("id", jobId).select("*").single();

    if (completed.error || !completed.data) {
        return { ok: false as const, error: getErrorMessage(completed.error) || "Failed to complete job.", code: "DB_ERROR" };
    }

    const revision = await snapshotRingtoneRevision({
        product: {
            ...product.data,
            preview_storage_path: executed.previewPath,
            android_storage_path: executed.androidPath,
            iphone_storage_path: executed.iphonePath,
            download_storage_path: executed.androidPath,
            preview_url: previewUrl,
            source_checksum: executed.sourceChecksum,
            processing_version: executed.processingVersion,
        },
        processingResult: executed.result,
        statusAtSnapshot: "pending_review",
    });

    await supabase.from("ringtone_products").update({
        status: "pending_review",
        preview_storage_path: executed.previewPath,
        android_storage_path: executed.androidPath,
        iphone_storage_path: executed.iphonePath,
        download_storage_path: executed.androidPath,
        preview_url: previewUrl,
        ringtone_file_url: previewUrl,
        iphone_file_url: "",
        android_file_url: "",
        source_checksum: executed.sourceChecksum,
        processing_version: executed.processingVersion,
        last_processing_error: "",
        last_processing_error_code: "",
        current_revision_id: revision.ok ? revision.revision.id : product.data.current_revision_id,
        iphone_available: true,
        android_available: true,
    }).eq("id", product.data.id);

    await writeRingtoneModerationLog({
        ringtoneId: String(product.data.id),
        revisionId: revision.ok ? revision.revision.id : null,
        revisionNumber: Number(job.revision_number || 1),
        action: "processing_completed",
        previousStatus: "processing",
        newStatus: "pending_review",
        actorId: actorId || String(product.data.creator_id),
        actorRole: "system",
        reason: "",
        metadata: { jobId, engine: executed.engine },
    });

    await notifyRingtoneEvent({
        userId: String(product.data.creator_id),
        title: "Processing Completed",
        body: `"${product.data.title}" finished processing and was submitted for review.`,
        ringtoneId: String(product.data.id),
        eventKey: `ringtone:${product.data.id}:rev:${job.revision_number}:processing_completed:${jobId}`,
        itemType: "ringtone",
    });
    await notifyRingtoneEvent({
        userId: String(product.data.creator_id),
        title: "Submitted for Review",
        body: `"${product.data.title}" is pending owner/admin review.`,
        ringtoneId: String(product.data.id),
        eventKey: `ringtone:${product.data.id}:rev:${job.revision_number}:submitted_for_review:${jobId}`,
        itemType: "ringtone",
    });
    await notifyAdminsNewSubmission(product.data, jobId);

    return { ok: true as const, job: completed.data, revision: revision.ok ? revision.revision : null };
}

async function failJob(jobId: string, code: string, message: string, details: Record<string, unknown> = {}) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.from("ringtone_processing_jobs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: code,
        error_message: message,
        result: { ...(details || {}), failed: true },
    }).eq("id", jobId).select("*").single();
    return data;
}

async function markProductFailed(product: Record<string, unknown>, code: string, message: string) {
    const supabase = getSupabaseServerClient();
    await supabase.from("ringtone_products").update({
        status: "draft",
        last_processing_error: message,
        last_processing_error_code: code,
    }).eq("id", product.id);
}

async function notifyAdminsProcessingFailure(product: Record<string, unknown>, message: string, jobId: string) {
    const adminIds = await listAdminUserIds();
    await Promise.all(adminIds.map((adminId) => notifyRingtoneEvent({
        userId: adminId,
        title: "Processing Failed",
        body: `"${product.title}" processing failed and needs review: ${message}`,
        ringtoneId: String(product.id),
        eventKey: `ringtone_review:${product.id}:processing_failure:${jobId}:${adminId}`,
        itemType: "ringtone_review",
    })));
}

async function notifyAdminsNewSubmission(product: Record<string, unknown>, jobId: string) {
    const adminIds = await listAdminUserIds();
    const isResubmit = Number(product.revision_number || 1) > 1;
    await Promise.all(adminIds.map((adminId) => notifyRingtoneEvent({
        userId: adminId,
        title: isResubmit ? "Creator Resubmission" : "New Ringtone Submitted",
        body: `"${product.title}" is ready for review.`,
        ringtoneId: String(product.id),
        eventKey: `ringtone_review:${product.id}:rev:${product.revision_number}:submitted:${jobId}:${adminId}`,
        itemType: "ringtone_review",
    })));
}

async function listAdminUserIds(): Promise<string[]> {
    const supabase = getSupabaseServerClient();
    const ids = new Set<string>();
    const roles = await supabase.from("user_roles").select("user_id").eq("role", "admin").eq("status", "active");
    for (const row of roles.data || []) {
        if (row.user_id) ids.add(String(row.user_id));
    }
    const profiles = await supabase.from("profiles").select("id,user_id,is_admin").eq("is_admin", true);
    for (const row of profiles.data || []) {
        if (row.user_id) ids.add(String(row.user_id));
        else if (row.id) ids.add(String(row.id));
    }
    return [...ids];
}

/** Queue then immediately run (inline worker). Used by process API routes. */
export async function queueAndRunRingtoneProcessing(input: {
    ringtoneId: string;
    actorId: string;
    actorRole?: string;
    forceRetry?: boolean;
}) {
    const queued = await enqueueRingtoneProcessingJob(input);
    if (!queued.ok) return queued;
    if (queued.duplicate && String(queued.job.status) === "processing") {
        return { ok: true as const, job: queued.job, ringtone: queued.ringtone, duplicate: true };
    }
    if (String(queued.job.status) === "completed") {
        return { ok: true as const, job: queued.job, ringtone: queued.ringtone, duplicate: true };
    }
    const ran = await runRingtoneProcessingJob(String(queued.job.id), input.actorId);
    if (!ran.ok) {
        return {
            ok: false as const,
            error: ran.error,
            status: 422,
            code: ran.code || "PROCESSING_FAILED",
            job: ran.job || queued.job,
        };
    }
    const supabase = getSupabaseServerClient();
    const refreshed = await supabase.from("ringtone_products").select("*").eq("id", input.ringtoneId).maybeSingle();
    return {
        ok: true as const,
        job: ran.job,
        ringtone: refreshed.data || queued.ringtone,
        duplicate: queued.duplicate,
        revision: ran.revision || null,
    };
}
