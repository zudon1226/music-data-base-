import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { assertOwnsSourceSong, requireRingtoneCreator } from "@/lib/ringtone-access";
import {
    RINGTONE_ACTION_FAILED_CODE,
    RINGTONE_ACTION_FAILED_MESSAGE,
    logRingtoneActionFailure,
    toPublicRingtoneActionError,
} from "@/lib/ringtone-action-errors";
import { RINGTONE_DEFAULT_DURATION_SECONDS, type RingtoneStatus } from "@/lib/ringtone-constants";
import { deleteOrArchiveRingtoneProduct } from "@/lib/ringtone-delete-lifecycle";
import { writeRingtoneModerationLog } from "@/lib/ringtone-moderation-log";
import { beginPublishedRingtoneRevision } from "@/lib/ringtone-revisions";
import {
    canAdminTransitionStatus,
    canCreatorTransitionStatus,
    isCreatorEditableStatus,
    isPublicRingtoneStatus,
    isRingtoneStatus,
    sanitizeRingtoneText,
    validateRingtoneClip,
    validateRingtonePriceCents,
    normalizeRingtoneCurrency,
    normalizeRingtoneSourceDurationSeconds,
} from "@/lib/ringtone-validation";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function publicError(error: unknown, status = 500) {
    logRingtoneActionFailure("api/ringtones/:id", error);
    return json({
        error: toPublicRingtoneActionError(error, RINGTONE_ACTION_FAILED_MESSAGE),
        code: RINGTONE_ACTION_FAILED_CODE,
    }, status);
}

type Params = { params: Promise<{ id: string }> };

async function appendStatusTransitionLog(input: {
    ringtoneId: string;
    product: Record<string, unknown>;
    previousStatus: string;
    newStatus: string;
    actorId: string;
    actorRole: "creator" | "admin";
    action?: string;
}) {
    if (input.previousStatus === input.newStatus) return;
    const action = input.action
        || (input.newStatus === "archived"
            ? "archive"
            : input.newStatus === "draft" && ["archived", "published", "suspended", "rejected", "pending_review"].includes(input.previousStatus)
                ? "return_to_review"
                : "status_change");
    await writeRingtoneModerationLog({
        ringtoneId: input.ringtoneId,
        revisionId: typeof input.product.current_revision_id === "string" ? input.product.current_revision_id : null,
        revisionNumber: typeof input.product.revision_number === "number" ? input.product.revision_number : null,
        action,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        actorId: input.actorId,
        actorRole: input.actorRole,
        reason: "",
        metadata: {},
    });
}

export async function GET(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("ringtone_products")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error) return publicError(error, 500);
        if (!data) return json({ error: "Ringtone not found." }, 404);

        const status = String(data.status || "") as RingtoneStatus;
        if (isPublicRingtoneStatus(status)) {
            return json({ ringtone: data });
        }

        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "Ringtone not found." }, 404);
        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]", userId);
        if (!auth.ok) return json({ error: "Ringtone not found." }, 404);
        if (data.creator_id !== userId && !(await isAdminUserId(userId))) {
            return json({ error: "Ringtone not found." }, 404);
        }
        return json({ ringtone: data });
    } catch (error) {
        return publicError(error, 500);
    }
}

export async function PATCH(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase.from("ringtone_products").select("*").eq("id", id).maybeSingle();
        if (existing.error) return publicError(existing.error, 500);
        if (!existing.data) return json({ error: "Ringtone not found." }, 404);

        const isAdmin = await isAdminUserId(userId);
        if (existing.data.creator_id !== userId && !isAdmin) {
            return json({ error: "You may only manage your own ringtone records." }, 403);
        }
        if (!isAdmin) {
            const creator = await requireRingtoneCreator(userId);
            if (!creator.ok) return json({ error: creator.error }, creator.status);
        }

        const currentStatus = String(existing.data.status || "draft") as RingtoneStatus;
        const updates: Record<string, unknown> = {};
        const creatorMayEditFields = isAdmin || isCreatorEditableStatus(currentStatus);
        const statusOnlyUnlock = !isAdmin && (currentStatus === "published" || currentStatus === "archived");
        let statusTransitionAction: string | undefined;

        if (creatorMayEditFields) {
            if (body.title != null) {
                const title = sanitizeRingtoneText(body.title, 160);
                // Draft updates may clear the title temporarily; keep a schema-safe placeholder.
                updates.title = title || "Untitled draft";
            }
            if (body.description != null) {
                updates.description = sanitizeRingtoneText(body.description, 4000);
            }
            if (body.artworkUrl != null) {
                updates.artwork_url = sanitizeRingtoneText(body.artworkUrl, 1000);
            }
            if (body.sourceKind === "owned_song" || body.sourceKind === "upload") {
                updates.source_kind = body.sourceKind;
            }
            if (body.sourceSongId !== undefined) {
                const songId = String(body.sourceSongId || "").trim();
                if (!songId) {
                    updates.source_song_id = null;
                } else {
                    if (!isUuid(songId)) return json({ error: "sourceSongId must be a valid owned song UUID." }, 400);
                    const ownership = await assertOwnsSourceSong(userId, songId);
                    if (!ownership.ok) return json({ error: ownership.error }, 403);
                    updates.source_song_id = songId;
                    updates.source_kind = "owned_song";
                    updates.ownership_confirmed = true;
                }
            }
            if (body.ownershipConfirmed != null) {
                updates.ownership_confirmed = body.ownershipConfirmed === true;
            }
            if (body.sourceStoragePath != null) {
                const path = sanitizeRingtoneText(body.sourceStoragePath, 500);
                const nextKind = String(updates.source_kind || existing.data.source_kind || "");
                // Only ringtone-source upload paths are stored here; owned songs resolve at process time.
                if (nextKind === "upload" || body.sourceKind === "upload") {
                    if (path && !path.startsWith(`${userId}/`)) {
                        return json({ error: "sourceStoragePath must be owner-scoped under the creator id." }, 400);
                    }
                    updates.source_storage_path = path;
                } else if (body.sourceKind === "owned_song" || nextKind === "owned_song") {
                    updates.source_storage_path = "";
                }
            }
            if (body.priceCents != null) {
                let price = validateRingtonePriceCents(body.priceCents);
                if (!price.ok && (currentStatus === "draft" || currentStatus === "rejected")) {
                    price = validateRingtonePriceCents(0);
                }
                if (!price.ok) return json({ error: price.error, code: "VALIDATION_FAILED" }, 400);
                updates.price_cents = price.priceCents;
            }
            if (body.currency != null) {
                const currency = normalizeRingtoneCurrency(body.currency);
                if (!currency) return json({ error: "Unsupported currency." }, 400);
                updates.currency = currency;
            }
            if (body.isExplicit != null) updates.is_explicit = body.isExplicit === true;
            if (body.iphoneAvailable != null) updates.iphone_available = body.iphoneAvailable === true;
            if (body.androidAvailable != null) updates.android_available = body.androidAvailable === true;

            if (
                body.clipStartSeconds != null
                || body.durationSeconds != null
                || body.clipEndSeconds != null
            ) {
                let trustedSourceDuration = normalizeRingtoneSourceDurationSeconds(body.sourceDurationSeconds);
                const nextKind = String(updates.source_kind || existing.data.source_kind || "");
                const nextSongId = updates.source_song_id != null
                    ? String(updates.source_song_id || "")
                    : String(existing.data.source_song_id || "");
                if (nextKind === "owned_song" && nextSongId && isUuid(nextSongId)) {
                    const ownership = await assertOwnsSourceSong(userId, nextSongId);
                    if (!ownership.ok) return json({ error: ownership.error, code: "SOURCE_NOT_AUTHORIZED" }, 403);
                    if (ownership.sourceDurationSeconds != null) {
                        trustedSourceDuration = ownership.sourceDurationSeconds;
                    }
                }

                let clip = validateRingtoneClip({
                    clipStartSeconds: Number(body.clipStartSeconds ?? existing.data.clip_start_seconds),
                    durationSeconds: body.durationSeconds == null
                        ? Number(existing.data.duration_seconds)
                        : Number(body.durationSeconds),
                    clipEndSeconds: body.clipEndSeconds == null
                        ? undefined
                        : Number(body.clipEndSeconds),
                    sourceDurationSeconds: trustedSourceDuration,
                });
                if (!clip.ok) {
                    // Draft updates keep a schema-safe 0–30s window; submit validates strictly.
                    if (currentStatus === "draft" || currentStatus === "rejected") {
                        clip = validateRingtoneClip({
                            clipStartSeconds: 0,
                            durationSeconds: RINGTONE_DEFAULT_DURATION_SECONDS,
                            sourceDurationSeconds: null,
                        });
                    }
                    if (!clip.ok) return json({ error: clip.error, code: "VALIDATION_FAILED" }, 400);
                }
                updates.clip_start_seconds = clip.clipStartSeconds;
                updates.clip_end_seconds = clip.clipEndSeconds;
                updates.duration_seconds = clip.durationSeconds;
            }
        } else if (!statusOnlyUnlock && body.status == null) {
            return json({ error: "This ringtone is locked for creator edits." }, 403);
        }

        if (body.status != null) {
            if (!isRingtoneStatus(body.status)) return json({ error: "Invalid status." }, 400);
            const nextStatus = body.status as RingtoneStatus;
            if (currentStatus === nextStatus) {
                return json({ ringtone: existing.data, idempotent: true });
            }
            if (!isAdmin && nextStatus === "pending_review") {
                return json({
                    error: "Submit for review by starting secure processing. Creators cannot skip processing.",
                    code: "PROCESSING_REQUIRED",
                }, 400);
            }
            if (!isAdmin && (nextStatus === "approved" || nextStatus === "published" || nextStatus === "suspended")) {
                return json({ error: "Creators cannot approve, publish, or suspend ringtones.", code: "FORBIDDEN_STATUS" }, 403);
            }
            if (isAdmin) {
                if (!canAdminTransitionStatus(currentStatus, nextStatus)) {
                    return json({ error: `Invalid admin status transition ${currentStatus} -> ${nextStatus}.` }, 400);
                }
            } else if (!canCreatorTransitionStatus(currentStatus, nextStatus)) {
                return json({ error: `Creators cannot transition status from ${currentStatus} to ${nextStatus}.` }, 403);
            }
            updates.status = nextStatus;
            if (nextStatus === "published") updates.published_at = new Date().toISOString();
            statusTransitionAction = nextStatus === "archived"
                ? "archive"
                : nextStatus === "draft"
                    ? "return_to_review"
                    : "status_change";
        } else if (!creatorMayEditFields && !isAdmin) {
            if (currentStatus === "published" || currentStatus === "suspended") {
                const revision = await beginPublishedRingtoneRevision({ ringtoneId: id, actorId: userId });
                if (!revision.ok) {
                    return json({
                        error: toPublicRingtoneActionError(revision.error, RINGTONE_ACTION_FAILED_MESSAGE),
                        code: RINGTONE_ACTION_FAILED_CODE,
                    }, revision.status || 400);
                }
                // Apply field updates onto the new draft revision.
                const fieldBody = { ...body };
                delete fieldBody.status;
                delete fieldBody.userId;
                delete fieldBody.sessionUserId;
                const hasFields = Object.keys(fieldBody).some((key) => fieldBody[key] != null);
                if (!hasFields) return json({ ringtone: revision.ringtone, revisionStarted: true });
                const refreshed = await supabase.from("ringtone_products").select("*").eq("id", id).maybeSingle();
                if (!refreshed.data) return json({ error: "Ringtone not found after revision start." }, 404);
                Object.assign(existing, { data: refreshed.data });
                const draftUpdates: Record<string, unknown> = {};
                if (body.title != null) {
                    const title = sanitizeRingtoneText(body.title, 160);
                    if (!title) return json({ error: "Title is required." }, 400);
                    draftUpdates.title = title;
                }
                if (body.description != null) draftUpdates.description = sanitizeRingtoneText(body.description, 4000);
                if (body.artworkUrl != null) draftUpdates.artwork_url = sanitizeRingtoneText(body.artworkUrl, 1000);
                if (body.priceCents != null) {
                    const price = validateRingtonePriceCents(body.priceCents);
                    if (!price.ok) return json({ error: price.error }, 400);
                    draftUpdates.price_cents = price.priceCents;
                }
                if (Object.keys(draftUpdates).length === 0) {
                    return json({ ringtone: refreshed.data, revisionStarted: true });
                }
                const { data, error } = await supabase
                    .from("ringtone_products")
                    .update(draftUpdates)
                    .eq("id", id)
                    .select("*")
                    .single();
                if (error) return publicError(error, 500);
                return json({ ringtone: data, revisionStarted: true });
            }
            return json({ error: "This ringtone is locked for creator edits." }, 403);
        }

        if (Object.keys(updates).length === 0) {
            return json({ ringtone: existing.data });
        }

        const { data, error } = await supabase
            .from("ringtone_products")
            .update(updates)
            .eq("id", id)
            .select("*")
            .single();
        if (error) return publicError(error, 500);

        if (typeof updates.status === "string") {
            await appendStatusTransitionLog({
                ringtoneId: id,
                product: data,
                previousStatus: currentStatus,
                newStatus: String(updates.status),
                actorId: userId,
                actorRole: isAdmin ? "admin" : "creator",
                action: statusTransitionAction,
            });
        }

        return json({ ringtone: data });
    } catch (error) {
        return publicError(error, 500);
    }
}

export async function DELETE(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const isAdmin = await isAdminUserId(userId);
        if (!isAdmin) {
            const creator = await requireRingtoneCreator(userId);
            if (!creator.ok) return json({ error: creator.error }, creator.status);
        }

        const result = await deleteOrArchiveRingtoneProduct({
            ringtoneId: id,
            actorId: userId,
            isAdmin,
        });

        if (!result.ok) {
            return json({
                success: false,
                error: result.error,
                code: result.code,
            }, result.status);
        }

        return json({
            success: true,
            action: result.action,
            ringtone: result.ringtone || null,
        }, result.status);
    } catch (error) {
        return publicError(error, 500);
    }
}
