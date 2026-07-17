/**
 * Owner/admin ringtone moderation actions (Phase 4).
 */

import { notifyRingtoneEvent } from "@/lib/ringtone-notifications";
import { writeRingtoneModerationLog } from "@/lib/ringtone-moderation-log";
import { canPublishRingtone } from "@/lib/ringtone-publication";
import { canAdminTransitionStatus, sanitizeRingtoneText } from "@/lib/ringtone-validation";
import type { RingtoneStatus } from "@/lib/ringtone-constants";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { queueAndRunRingtoneProcessing } from "@/lib/ringtone-jobs";

export { writeRingtoneModerationLog } from "@/lib/ringtone-moderation-log";

export type RingtoneAdminAction =
    | "approve"
    | "reject"
    | "publish"
    | "suspend"
    | "restore"
    | "archive"
    | "reprocess"
    | "feature"
    | "unfeature";

const ACTION_TARGET_STATUS: Partial<Record<RingtoneAdminAction, RingtoneStatus>> = {
    approve: "approved",
    reject: "rejected",
    publish: "published",
    suspend: "suspended",
    restore: "published",
    archive: "archived",
};

export async function performRingtoneAdminAction(input: {
    ringtoneId: string;
    actorId: string;
    action: RingtoneAdminAction;
    reason?: string;
    isFeatured?: boolean;
}) {
    if (!isUuid(input.ringtoneId) || !isUuid(input.actorId)) {
        return { ok: false as const, error: "Invalid ids.", status: 400 };
    }

    const supabase = getSupabaseServerClient();
    const existing = await supabase.from("ringtone_products").select("*").eq("id", input.ringtoneId).maybeSingle();
    if (existing.error) return { ok: false as const, error: getErrorMessage(existing.error), status: 500 };
    if (!existing.data) return { ok: false as const, error: "Ringtone not found.", status: 404 };

    const from = String(existing.data.status || "draft") as RingtoneStatus;

    if (input.action === "reprocess") {
        const ran = await queueAndRunRingtoneProcessing({
            ringtoneId: input.ringtoneId,
            actorId: input.actorId,
            actorRole: "admin",
            forceRetry: true,
        });
        if (!ran.ok) {
            return {
                ok: false as const,
                error: ran.error,
                status: ran.status || 422,
                code: ran.code,
                job: "job" in ran ? ran.job : null,
            };
        }
        await writeRingtoneModerationLog({
            ringtoneId: input.ringtoneId,
            revisionId: existing.data.current_revision_id,
            revisionNumber: existing.data.revision_number,
            action: "request_reprocessing",
            previousStatus: from,
            newStatus: String(ran.ringtone?.status || "processing"),
            actorId: input.actorId,
            actorRole: "admin",
            reason: input.reason || "",
            metadata: { jobId: ran.job?.id },
        });
        return { ok: true as const, ringtone: ran.ringtone, job: ran.job, idempotent: Boolean(ran.duplicate) };
    }

    if (input.action === "feature" || input.action === "unfeature") {
        const featured = input.action === "feature";
        if (existing.data.is_featured === featured) {
            return { ok: true as const, ringtone: existing.data, idempotent: true };
        }
        const updated = await supabase.from("ringtone_products").update({
            is_featured: featured,
        }).eq("id", input.ringtoneId).select("*").single();
        if (updated.error) return { ok: false as const, error: getErrorMessage(updated.error), status: 500 };
        await writeRingtoneModerationLog({
            ringtoneId: input.ringtoneId,
            revisionId: existing.data.current_revision_id,
            revisionNumber: existing.data.revision_number,
            action: input.action,
            previousStatus: from,
            newStatus: from,
            actorId: input.actorId,
            actorRole: "admin",
            reason: input.reason || "",
            metadata: { isFeatured: featured },
        });
        return { ok: true as const, ringtone: updated.data, idempotent: false };
    }

    const to = ACTION_TARGET_STATUS[input.action];
    if (!to) return { ok: false as const, error: "Unsupported admin action.", status: 400 };

    if (from === to) {
        return { ok: true as const, ringtone: existing.data, idempotent: true };
    }

    if (!canAdminTransitionStatus(from, to)) {
        return {
            ok: false as const,
            error: `Invalid admin status transition ${from} -> ${to}.`,
            status: 400,
            code: "INVALID_TRANSITION",
        };
    }

    if (input.action === "reject") {
        const reason = sanitizeRingtoneText(input.reason || "", 2000);
        if (!reason) {
            return { ok: false as const, error: "Rejection reason is required.", status: 400, code: "REASON_REQUIRED" };
        }
    }

    if (input.action === "publish") {
        const gate = canPublishRingtone(existing.data);
        if (!gate.ok) {
            return { ok: false as const, error: gate.error, status: 400, code: gate.code || "PUBLICATION_GATE" };
        }
    }

    if (input.action === "restore" && from !== "suspended") {
        return { ok: false as const, error: "Only suspended ringtones can be restored.", status: 400 };
    }

    const updates: Record<string, unknown> = { status: to };
    if (to === "published") updates.published_at = new Date().toISOString();
    if (input.action === "reject") {
        updates.review_notes = sanitizeRingtoneText(input.reason || "", 2000);
    }
    if (input.action === "approve") {
        updates.review_notes = "";
    }

    const updated = await supabase
        .from("ringtone_products")
        .update(updates)
        .eq("id", input.ringtoneId)
        .select("*")
        .single();
    if (updated.error) return { ok: false as const, error: getErrorMessage(updated.error), status: 500 };

    await writeRingtoneModerationLog({
        ringtoneId: input.ringtoneId,
        revisionId: updated.data.current_revision_id,
        revisionNumber: updated.data.revision_number,
        action: input.action,
        previousStatus: from,
        newStatus: to,
        actorId: input.actorId,
        actorRole: "admin",
        reason: sanitizeRingtoneText(input.reason || "", 2000),
        metadata: {},
    });

    const creatorId = String(updated.data.creator_id);
    const title = String(updated.data.title || "Ringtone");
    if (input.action === "approve") {
        await notifyRingtoneEvent({
            userId: creatorId,
            title: "Approved",
            body: `"${title}" was approved and can be published by an administrator.`,
            ringtoneId: input.ringtoneId,
            eventKey: `ringtone:${input.ringtoneId}:rev:${updated.data.revision_number}:approved`,
            itemType: "ringtone",
        });
    } else if (input.action === "reject") {
        await notifyRingtoneEvent({
            userId: creatorId,
            title: "Rejected",
            body: `"${title}" was rejected. Reason: ${sanitizeRingtoneText(input.reason || "", 400)}`,
            ringtoneId: input.ringtoneId,
            eventKey: `ringtone:${input.ringtoneId}:rev:${updated.data.revision_number}:rejected`,
            itemType: "ringtone",
        });
    } else if (input.action === "publish") {
        await notifyRingtoneEvent({
            userId: creatorId,
            title: "Published",
            body: `"${title}" is now published in the ringtone marketplace.`,
            ringtoneId: input.ringtoneId,
            eventKey: `ringtone:${input.ringtoneId}:rev:${updated.data.revision_number}:published`,
            itemType: "ringtone",
        });
    } else if (input.action === "suspend") {
        await notifyRingtoneEvent({
            userId: creatorId,
            title: "Suspended",
            body: `"${title}" was suspended and is hidden from the marketplace.`,
            ringtoneId: input.ringtoneId,
            eventKey: `ringtone:${input.ringtoneId}:rev:${updated.data.revision_number}:suspended`,
            itemType: "ringtone",
        });
    }

    return { ok: true as const, ringtone: updated.data, idempotent: false };
}
