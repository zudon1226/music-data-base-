import { NextResponse } from "next/server";
import { isCatalogItemPubliclyPlayable } from "@/lib/moderation-status.mjs";
import { requireMixtapeOwner } from "@/lib/mixtape-access";
import { mapMixtapeRows, MIXTAPE_COLUMNS, MIXTAPE_TRACK_COLUMNS } from "@/lib/mixtape-data";
import { requireMixtapeRequestCreator, requireMixtapeRequestUser } from "@/lib/mixtape-route-auth";
import type { MixtapeTrackStatus } from "@/lib/mixtape-types";
import { applyMixtapeTrackPositionChange } from "@/lib/mixtape-track-position";
import { validateMixtapeTrackPublishRules } from "@/lib/mixtape-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

function positiveInteger(value: unknown) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 ? number : null;
}

function parseMixtapeTrackStatus(value: unknown): MixtapeTrackStatus {
    const raw = String(value || "draft").trim().toLowerCase();
    if (raw === "published") return "published";
    if (raw === "archived") return "archived";
    if (raw === "processing") return "processing";
    return "draft";
}

async function loadTrack(trackId: string) {
    return getSupabaseServerClient()
        .from("mixtape_tracks")
        .select(MIXTAPE_TRACK_COLUMNS)
        .eq("id", trackId)
        .maybeSingle();
}

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid mixtape track id." }, 400);
        const trackResult = await loadTrack(id);
        if (trackResult.error) return jsonResponse({ error: getErrorMessage(trackResult.error) }, 500);
        if (!trackResult.data) return jsonResponse({ error: "Mixtape track not found." }, 404);
        const trackRow = trackResult.data as unknown as Record<string, unknown>;
        const supabase = getSupabaseServerClient();
        const mixtapeResult = await supabase
            .from("mixtapes")
            .select(MIXTAPE_COLUMNS)
            .eq("id", String(trackRow.mixtape_id || ""))
            .maybeSingle();
        if (mixtapeResult.error) return jsonResponse({ error: getErrorMessage(mixtapeResult.error) }, 500);
        if (!mixtapeResult.data) return jsonResponse({ error: "Mixtape not found." }, 404);
        const mixtapeRow = mixtapeResult.data as unknown as Record<string, unknown>;
        const isPublic = trackRow.status === "published"
            && mixtapeRow.status === "published"
            && isCatalogItemPubliclyPlayable(trackRow)
            && isCatalogItemPubliclyPlayable(mixtapeRow);
        let canManage = false;
        if (!isPublic) {
            const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
            const auth = await requireMixtapeRequestUser(request, { userId }, `/api/mixtapes/tracks/${id}`);
            if (!auth.ok) return jsonResponse({ error: "Mixtape track not found." }, 404);
            canManage = await requireMixtapeOwner(auth.userId, trackRow.user_id).then((result) => result.ok);
            if (!canManage) return jsonResponse({ error: "Mixtape track not found." }, 404);
        }
        const mapped = await mapMixtapeRows({
            mixtapeRows: [mixtapeRow],
            trackRows: [trackRow],
        });
        return jsonResponse({
            track: canManage
                ? mapped.tracks[0]
                : { ...mapped.tracks[0], mediaUrl: "", storagePath: "" },
            mixtape: canManage ? mapped.mixtapes[0] : { ...mapped.mixtapes[0], coverStoragePath: "" },
            canManage,
        });
    }
    catch (error) {
        console.error("[api/mixtapes/tracks/:id] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid mixtape track id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(request, body, `/api/mixtapes/tracks/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const trackResult = await loadTrack(id);
        if (trackResult.error) return jsonResponse({ error: getErrorMessage(trackResult.error) }, 500);
        if (!trackResult.data) return jsonResponse({ error: "Mixtape track not found." }, 404);
        const trackRow = trackResult.data as unknown as Record<string, unknown>;
        const owner = await requireMixtapeOwner(auth.userId, trackRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);

        const supabase = getSupabaseServerClient();
        const updates: Record<string, unknown> = {};
        if ("title" in body) {
            const title = cleanText(body.title, 200);
            if (!title) return jsonResponse({ error: "Track title is required." }, 400);
            updates.title = title;
        }
        if ("description" in body) updates.description = cleanText(body.description, 4000);
        let positionApplied = false;
        if ("position" in body) {
            const position = positiveInteger(body.position);
            if (!position) return jsonResponse({ error: "Track position must be 1 or greater." }, 400);
            const reordered = await applyMixtapeTrackPositionChange(supabase, id, trackRow, position);
            if (!reordered.ok) return jsonResponse({ error: reordered.error }, 500);
            trackRow.position = reordered.position;
            positionApplied = true;
        }

        if ("durationSeconds" in body || "duration_seconds" in body) {
            const raw = Number(body.durationSeconds ?? body.duration_seconds ?? 0);
            updates.duration_seconds = Number.isFinite(raw) && raw > 0 ? raw : null;
        }
        const nextStatus = "status" in body
            ? parseMixtapeTrackStatus(body.status)
            : parseMixtapeTrackStatus(trackRow.status);
        if ("status" in body) {
            updates.status = nextStatus;
            updates.published_at = nextStatus === "published"
                ? String(trackRow.published_at || new Date().toISOString())
                : nextStatus === "draft"
                    ? null
                    : trackRow.published_at;
        }
        const durationForRules = "duration_seconds" in updates
            ? updates.duration_seconds as number | null
            : numberOrNull(trackRow.duration_seconds);
        const publishRules = validateMixtapeTrackPublishRules({
            status: nextStatus,
            durationSeconds: durationForRules,
        });
        if (!publishRules.ok) return jsonResponse({ error: publishRules.error }, 400);

        let updatedRow: Record<string, unknown> | null = null;
        if (Object.keys(updates).length > 0) {
            const updated = await supabase
                .from("mixtape_tracks")
                .update(updates)
                .eq("id", id)
                .select(MIXTAPE_TRACK_COLUMNS)
                .single();
            if (updated.error) return jsonResponse({ error: getErrorMessage(updated.error) }, 500);
            updatedRow = updated.data as unknown as Record<string, unknown>;
        }
        else if (!positionApplied) {
            return jsonResponse({ error: "No track updates were provided." }, 400);
        }
        else {
            const refreshed = await loadTrack(id);
            if (refreshed.error) return jsonResponse({ error: getErrorMessage(refreshed.error) }, 500);
            if (!refreshed.data) return jsonResponse({ error: "Mixtape track not found." }, 404);
            updatedRow = refreshed.data as unknown as Record<string, unknown>;
        }
        const mixtapeResult = await supabase
            .from("mixtapes")
            .select(MIXTAPE_COLUMNS)
            .eq("id", String(trackRow.mixtape_id))
            .maybeSingle();
        const mapped = await mapMixtapeRows({
            mixtapeRows: mixtapeResult.data ? [mixtapeResult.data as unknown as Record<string, unknown>] : [],
            trackRows: [updatedRow as Record<string, unknown>],
        });
        return jsonResponse({ ok: true, track: mapped.tracks[0] });
    }
    catch (error) {
        console.error("[api/mixtapes/tracks/:id] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

function numberOrNull(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid mixtape track id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(request, body, `/api/mixtapes/tracks/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const trackResult = await loadTrack(id);
        if (trackResult.error) return jsonResponse({ error: getErrorMessage(trackResult.error) }, 500);
        if (!trackResult.data) return jsonResponse({ error: "Mixtape track not found." }, 404);
        const trackRow = trackResult.data as unknown as Record<string, unknown>;
        const owner = await requireMixtapeOwner(auth.userId, trackRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);
        const result = await getSupabaseServerClient()
            .from("mixtape_tracks")
            .update({ status: "archived", published_at: null })
            .eq("id", id)
            .select("id,status")
            .single();
        if (result.error) return jsonResponse({ error: getErrorMessage(result.error) }, 500);
        return jsonResponse({ ok: true, archived: true, trackId: id });
    }
    catch (error) {
        console.error("[api/mixtapes/tracks/:id] DELETE failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}