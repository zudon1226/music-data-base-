/**
 * Safe ringtone product deletion / archive lifecycle.
 * Hard-delete is only for disposable drafts with zero protected history.
 * Everything else archives (append-only moderation log) and never mutates prior audit rows.
 */

import {
    RINGTONE_ACTION_FAILED_MESSAGE,
    logRingtoneActionFailure,
    toPublicRingtoneActionError,
} from "@/lib/ringtone-action-errors";
import type { RingtoneStatus } from "@/lib/ringtone-constants";
import { writeRingtoneModerationLog } from "@/lib/ringtone-moderation-log";
import { canAdminTransitionStatus, canCreatorTransitionStatus } from "@/lib/ringtone-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type RingtoneDeleteAction = "deleted" | "archived" | "already_archived";

export type RingtoneDeleteDependencies = {
    moderationLogCount: number;
    processingJobCount: number;
    revisionCount: number;
    purchaseCount: number;
    downloadCount: number;
    favoriteCount: number;
    reviewCount: number;
    publishedAt: string | null;
    revisionNumber: number;
    hasPublishedHistory: boolean;
    hasProtectedStorage: boolean;
};

export type RingtoneDeleteResult =
    | {
        ok: true;
        success: true;
        action: RingtoneDeleteAction;
        status: number;
        ringtone?: Record<string, unknown> | null;
        dependencies?: RingtoneDeleteDependencies;
    }
    | {
        ok: false;
        error: string;
        code: string;
        status: number;
    };

const PRIVATE_PATH_FIELDS = [
    "source_storage_path",
    "preview_storage_path",
    "iphone_storage_path",
    "android_storage_path",
    "download_storage_path",
] as const;

async function countRows(table: string, column: string, ringtoneId: string) {
    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(column, ringtoneId);
    if (error) throw error;
    return count || 0;
}

function collectPrivatePaths(product: Record<string, unknown>) {
    const paths: Array<{ bucket: string; path: string }> = [];
    const source = String(product.source_storage_path || "").trim();
    if (source && product.source_kind === "upload") {
        paths.push({ bucket: "ringtone-source", path: source });
    }
    const preview = String(product.preview_storage_path || "").trim();
    if (preview) paths.push({ bucket: "ringtone-previews", path: preview });
    for (const field of ["iphone_storage_path", "android_storage_path", "download_storage_path"] as const) {
        const value = String(product[field] || "").trim();
        if (value) paths.push({ bucket: "ringtone-downloads", path: value });
    }
    return paths;
}

export async function loadRingtoneDeleteDependencies(product: Record<string, unknown>) {
    const ringtoneId = String(product.id || "");
    if (!isUuid(ringtoneId)) {
        throw new Error("Invalid ringtone id.");
    }

    const [
        moderationLogCount,
        processingJobCount,
        revisionCount,
        purchaseCount,
        downloadCount,
        favoriteCount,
        reviewCount,
    ] = await Promise.all([
        countRows("ringtone_moderation_logs", "ringtone_id", ringtoneId),
        countRows("ringtone_processing_jobs", "ringtone_id", ringtoneId),
        countRows("ringtone_revisions", "ringtone_id", ringtoneId),
        countRows("ringtone_purchases", "ringtone_id", ringtoneId),
        countRows("ringtone_downloads", "ringtone_id", ringtoneId),
        countRows("ringtone_favorites", "ringtone_id", ringtoneId),
        countRows("ringtone_reviews", "ringtone_id", ringtoneId),
    ]);

    const publishedAt = product.published_at == null ? null : String(product.published_at);
    const revisionNumber = Number(product.revision_number || 1) || 1;
    const status = String(product.status || "draft");
    const hasPublishedHistory = Boolean(
        publishedAt
        || status === "published"
        || status === "suspended"
        || status === "archived"
        || status === "approved"
        || revisionNumber > 1
        || revisionCount > 0,
    );
    const hasProtectedStorage = collectPrivatePaths(product).some((item) => Boolean(item.path))
        && (hasPublishedHistory || purchaseCount > 0 || revisionCount > 0 || moderationLogCount > 0);

    return {
        moderationLogCount,
        processingJobCount,
        revisionCount,
        purchaseCount,
        downloadCount,
        favoriteCount,
        reviewCount,
        publishedAt,
        revisionNumber,
        hasPublishedHistory,
        hasProtectedStorage,
    } satisfies RingtoneDeleteDependencies;
}

export function isHardDeleteEligible(
    status: string,
    dependencies: RingtoneDeleteDependencies,
) {
    return status === "draft"
        && dependencies.moderationLogCount === 0
        && dependencies.processingJobCount === 0
        && dependencies.revisionCount === 0
        && dependencies.purchaseCount === 0
        && dependencies.downloadCount === 0
        && dependencies.favoriteCount === 0
        && dependencies.reviewCount === 0
        && !dependencies.hasPublishedHistory
        && dependencies.publishedAt == null
        && dependencies.revisionNumber <= 1;
}

async function pathReferencedElsewhere(input: {
    ringtoneId: string;
    path: string;
    field: string;
}) {
    const supabase = getSupabaseServerClient();
    const products = await supabase
        .from("ringtone_products")
        .select("id")
        .neq("id", input.ringtoneId)
        .eq(input.field, input.path)
        .limit(1);
    if (products.error) throw products.error;
    if ((products.data || []).length > 0) return true;

    const revisions = await supabase
        .from("ringtone_revisions")
        .select("id")
        .neq("ringtone_id", input.ringtoneId)
        .eq(input.field, input.path)
        .limit(1);
    if (revisions.error) throw revisions.error;
    return (revisions.data || []).length > 0;
}

async function cleanupDisposableDraftStorage(product: Record<string, unknown>) {
    const supabase = getSupabaseServerClient();
    const ringtoneId = String(product.id || "");
    const removed: string[] = [];

    // Never delete shared owned-song sources.
    if (product.source_kind === "upload") {
        const sourcePath = String(product.source_storage_path || "").trim();
        if (sourcePath) {
            const shared = await pathReferencedElsewhere({
                ringtoneId,
                path: sourcePath,
                field: "source_storage_path",
            });
            if (!shared) {
                const result = await supabase.storage.from("ringtone-source").remove([sourcePath]);
                if (result.error) {
                    logRingtoneActionFailure("ringtone-delete-lifecycle storage source", result.error);
                } else {
                    removed.push(`ringtone-source:${sourcePath}`);
                }
            }
        }
    }

    for (const field of ["preview_storage_path"] as const) {
        const path = String(product[field] || "").trim();
        if (!path) continue;
        const shared = await pathReferencedElsewhere({ ringtoneId, path, field });
        if (shared) continue;
        const result = await supabase.storage.from("ringtone-previews").remove([path]);
        if (result.error) {
            logRingtoneActionFailure("ringtone-delete-lifecycle storage preview", result.error);
        } else {
            removed.push(`ringtone-previews:${path}`);
        }
    }

    for (const field of ["iphone_storage_path", "android_storage_path", "download_storage_path"] as const) {
        const path = String(product[field] || "").trim();
        if (!path) continue;
        const shared = await pathReferencedElsewhere({ ringtoneId, path, field });
        if (shared) continue;
        const result = await supabase.storage.from("ringtone-downloads").remove([path]);
        if (result.error) {
            logRingtoneActionFailure("ringtone-delete-lifecycle storage download", result.error);
        } else {
            removed.push(`ringtone-downloads:${path}`);
        }
    }

    return removed;
}

async function archiveProtectedRingtone(input: {
    product: Record<string, unknown>;
    actorId: string;
    isAdmin: boolean;
    dependencies: RingtoneDeleteDependencies;
    reason: string;
}) {
    const supabase = getSupabaseServerClient();
    const ringtoneId = String(input.product.id || "");
    const from = String(input.product.status || "draft") as RingtoneStatus;

    if (from === "archived") {
        return {
            ok: true as const,
            success: true as const,
            action: "already_archived" as const,
            status: 200,
            ringtone: input.product,
            dependencies: input.dependencies,
        };
    }

    const canTransition = input.isAdmin
        ? canAdminTransitionStatus(from, "archived")
        : canCreatorTransitionStatus(from, "archived");
    if (!canTransition) {
        return {
            ok: false as const,
            error: RINGTONE_ACTION_FAILED_MESSAGE,
            code: "ARCHIVE_NOT_ALLOWED",
            status: 409,
        };
    }

    const archived = await supabase
        .from("ringtone_products")
        .update({ status: "archived" })
        .eq("id", ringtoneId)
        .select("*")
        .single();
    if (archived.error) {
        logRingtoneActionFailure("ringtone-delete-lifecycle archive", archived.error);
        return {
            ok: false as const,
            error: toPublicRingtoneActionError(archived.error, RINGTONE_ACTION_FAILED_MESSAGE),
            code: "ACTION_FAILED",
            status: 500,
        };
    }

    await writeRingtoneModerationLog({
        ringtoneId,
        revisionId: typeof input.product.current_revision_id === "string"
            ? input.product.current_revision_id
            : null,
        revisionNumber: input.dependencies.revisionNumber,
        action: "archive",
        previousStatus: from,
        newStatus: "archived",
        actorId: input.actorId,
        actorRole: input.isAdmin ? "admin" : "creator",
        reason: input.reason,
        metadata: {
            deleteBlocked: true,
            dependencies: input.dependencies,
        },
    });

    return {
        ok: true as const,
        success: true as const,
        action: "archived" as const,
        status: 200,
        ringtone: archived.data,
        dependencies: input.dependencies,
    };
}

/**
 * Creator/admin delete entrypoint.
 * Never trusts client status — always reloads product + dependency counts.
 */
export async function deleteOrArchiveRingtoneProduct(input: {
    ringtoneId: string;
    actorId: string;
    isAdmin: boolean;
}): Promise<RingtoneDeleteResult> {
    if (!isUuid(input.ringtoneId) || !isUuid(input.actorId)) {
        return { ok: false, error: "Invalid ids.", code: "INVALID_IDS", status: 400 };
    }

    const supabase = getSupabaseServerClient();
    const existing = await supabase
        .from("ringtone_products")
        .select("*")
        .eq("id", input.ringtoneId)
        .maybeSingle();
    if (existing.error) {
        logRingtoneActionFailure("ringtone-delete-lifecycle load", existing.error);
        return {
            ok: false,
            error: toPublicRingtoneActionError(existing.error, RINGTONE_ACTION_FAILED_MESSAGE),
            code: "ACTION_FAILED",
            status: 500,
        };
    }
    if (!existing.data) {
        return { ok: false, error: "Ringtone not found.", code: "NOT_FOUND", status: 404 };
    }

    if (existing.data.creator_id !== input.actorId && !input.isAdmin) {
        return {
            ok: false,
            error: "You may only delete your own ringtone drafts.",
            code: "FORBIDDEN",
            status: 403,
        };
    }

    const status = String(existing.data.status || "draft") as RingtoneStatus;
    let dependencies: RingtoneDeleteDependencies;
    try {
        dependencies = await loadRingtoneDeleteDependencies(existing.data);
    } catch (error) {
        logRingtoneActionFailure("ringtone-delete-lifecycle dependencies", error);
        return {
            ok: false,
            error: toPublicRingtoneActionError(error, RINGTONE_ACTION_FAILED_MESSAGE),
            code: "ACTION_FAILED",
            status: 500,
        };
    }

    if (status === "archived") {
        return {
            ok: true,
            success: true,
            action: "already_archived",
            status: 200,
            ringtone: existing.data,
            dependencies,
        };
    }

    if (!isHardDeleteEligible(status, dependencies)) {
        return archiveProtectedRingtone({
            product: existing.data,
            actorId: input.actorId,
            isAdmin: input.isAdmin,
            dependencies,
            reason: "Protected ringtone history retained via archive instead of delete.",
        });
    }

    // Disposable draft hard-delete path.
    try {
        await cleanupDisposableDraftStorage(existing.data);
    } catch (error) {
        logRingtoneActionFailure("ringtone-delete-lifecycle storage", error);
        // Storage cleanup failure must not leave a 500 with SQL details; refuse destructive delete.
        return {
            ok: false,
            error: RINGTONE_ACTION_FAILED_MESSAGE,
            code: "STORAGE_CLEANUP_FAILED",
            status: 409,
        };
    }

    const deleted = await supabase.from("ringtone_products").delete().eq("id", input.ringtoneId);
    if (deleted.error) {
        logRingtoneActionFailure("ringtone-delete-lifecycle hard-delete", deleted.error);
        const message = getErrorMessage(deleted.error);
        if (/immutable|foreign key|restrict/i.test(message)) {
            return archiveProtectedRingtone({
                product: existing.data,
                actorId: input.actorId,
                isAdmin: input.isAdmin,
                dependencies,
                reason: "Delete blocked by protected references; archived instead.",
            });
        }
        return {
            ok: false,
            error: toPublicRingtoneActionError(deleted.error, RINGTONE_ACTION_FAILED_MESSAGE),
            code: "ACTION_FAILED",
            status: 500,
        };
    }

    return {
        ok: true,
        success: true,
        action: "deleted",
        status: 200,
        ringtone: null,
        dependencies,
    };
}

/** Pure helper for UI/tests: which destructive control a status should expose. */
export function ringtoneDestructiveControl(status: RingtoneStatus): "delete" | "archive" | "archived" | "none" {
    if (status === "draft") return "delete";
    if (status === "archived") return "archived";
    if (["published", "approved", "suspended", "rejected"].includes(status)) return "archive";
    return "none";
}

// Keep PRIVATE_PATH_FIELDS referenced for future expansion / lint stability.
void PRIVATE_PATH_FIELDS;
