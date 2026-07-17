/**
 * Ringtone revision snapshots for purchase-safe file preservation (Phase 4).
 * Editing a published ringtone bumps revision_number and does not replace
 * prior purchase-linked storage paths.
 */

import { writeRingtoneModerationLog } from "@/lib/ringtone-moderation-log";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function snapshotRingtoneRevision(input: {
    product: Record<string, unknown>;
    processingResult?: Record<string, unknown>;
    statusAtSnapshot?: string;
}) {
    const product = input.product;
    const ringtoneId = String(product.id || "");
    if (!isUuid(ringtoneId)) return { ok: false as const, error: "Invalid ringtone id." };

    const supabase = getSupabaseServerClient();
    const revisionNumber = Number(product.revision_number || 1);

    const existing = await supabase
        .from("ringtone_revisions")
        .select("*")
        .eq("ringtone_id", ringtoneId)
        .eq("revision_number", revisionNumber)
        .maybeSingle();
    if (existing.data) {
        return { ok: true as const, revision: existing.data, created: false };
    }

    const insert = await supabase.from("ringtone_revisions").insert({
        ringtone_id: ringtoneId,
        revision_number: revisionNumber,
        creator_id: product.creator_id,
        title: product.title || "",
        description: product.description || "",
        artwork_url: product.artwork_url || "",
        duration_seconds: product.duration_seconds,
        clip_start_seconds: product.clip_start_seconds,
        clip_end_seconds: product.clip_end_seconds,
        price_cents: product.price_cents || 0,
        currency: product.currency || "USD",
        is_explicit: product.is_explicit === true,
        ownership_confirmed: product.ownership_confirmed === true,
        source_kind: product.source_kind || "upload",
        source_storage_path: product.source_storage_path || "",
        source_checksum: product.source_checksum || "",
        preview_storage_path: product.preview_storage_path || "",
        iphone_storage_path: product.iphone_storage_path || "",
        android_storage_path: product.android_storage_path || "",
        download_storage_path: product.download_storage_path || product.android_storage_path || "",
        preview_url: product.preview_url || "",
        processing_version: product.processing_version || "",
        processing_result: input.processingResult || {},
        status_at_snapshot: input.statusAtSnapshot || String(product.status || "draft"),
    }).select("*").single();

    if (insert.error) {
        // Concurrent insert of same revision.
        const raced = await supabase
            .from("ringtone_revisions")
            .select("*")
            .eq("ringtone_id", ringtoneId)
            .eq("revision_number", revisionNumber)
            .maybeSingle();
        if (raced.data) return { ok: true as const, revision: raced.data, created: false };
        return { ok: false as const, error: getErrorMessage(insert.error) };
    }

    await supabase.from("ringtone_products").update({
        current_revision_id: insert.data.id,
    }).eq("id", ringtoneId);

    return { ok: true as const, revision: insert.data, created: true };
}

/**
 * Create a new draft revision when a published product is edited.
 * Prior revision storage paths remain for existing purchases.
 */
export async function beginPublishedRingtoneRevision(input: {
    ringtoneId: string;
    actorId: string;
}) {
    if (!isUuid(input.ringtoneId)) return { ok: false as const, error: "Invalid ringtone id.", status: 400 };
    const supabase = getSupabaseServerClient();
    const existing = await supabase.from("ringtone_products").select("*").eq("id", input.ringtoneId).maybeSingle();
    if (existing.error) return { ok: false as const, error: getErrorMessage(existing.error), status: 500 };
    if (!existing.data) return { ok: false as const, error: "Ringtone not found.", status: 404 };

    const status = String(existing.data.status || "");
    if (status !== "published" && status !== "suspended") {
        return { ok: false as const, error: "Only published or suspended ringtones start a new revision.", status: 400 };
    }

    // Freeze current published assets into a revision if missing.
    await snapshotRingtoneRevision({
        product: existing.data,
        statusAtSnapshot: status,
    });

    const nextRevision = Number(existing.data.revision_number || 1) + 1;
    const updated = await supabase.from("ringtone_products").update({
        revision_number: nextRevision,
        status: "draft",
        published_at: null,
        // Clear processed outputs so the new revision must reprocess.
        preview_storage_path: "",
        iphone_storage_path: "",
        android_storage_path: "",
        download_storage_path: "",
        preview_url: "",
        ringtone_file_url: "",
        iphone_file_url: "",
        android_file_url: "",
        iphone_available: false,
        android_available: false,
        current_revision_id: null,
        last_processing_error: "",
        last_processing_error_code: "",
        review_notes: "",
    }).eq("id", input.ringtoneId).select("*").single();

    if (updated.error) return { ok: false as const, error: getErrorMessage(updated.error), status: 500 };

    await writeRingtoneModerationLog({
        ringtoneId: input.ringtoneId,
        revisionId: existing.data.current_revision_id,
        revisionNumber: nextRevision,
        action: "return_to_review",
        previousStatus: status,
        newStatus: "draft",
        actorId: input.actorId,
        actorRole: "creator",
        reason: "",
        metadata: {
            previousRevisionNumber: Number(existing.data.revision_number || 1),
            nextRevisionNumber: nextRevision,
        },
    });

    return { ok: true as const, ringtone: updated.data, revisionNumber: nextRevision };
}

export async function loadRevisionForPurchase(revisionId: string | null | undefined) {
    if (!revisionId || !isUuid(revisionId)) return null;
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.from("ringtone_revisions").select("*").eq("id", revisionId).maybeSingle();
    return data || null;
}
