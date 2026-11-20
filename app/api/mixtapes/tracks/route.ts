import { NextResponse } from "next/server";
import { requireMixtapeOwner } from "@/lib/mixtape-access";
import { mapMixtapeRows, MIXTAPE_COLUMNS, MIXTAPE_TRACK_COLUMNS } from "@/lib/mixtape-data";
import { requireMixtapeRequestCreator } from "@/lib/mixtape-route-auth";
import {
    validateMixtapeOwnedTrackStoragePath,
    validateMixtapeTrackPublishRules,
} from "@/lib/mixtape-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

function positiveInteger(value: unknown, required: boolean) {
    if (value == null || value === "") return required ? null : 0;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 ? number : null;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(
            request,
            body,
            "/api/mixtapes/tracks",
            { requireUploadUnlocked: true },
        );
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const mixtapeId = cleanText(body.mixtapeId || body.mixtape_id, 100);
        if (!isUuid(mixtapeId)) return jsonResponse({ error: "Choose a valid mixtape." }, 400);
        const supabase = getSupabaseServerClient();
        const mixtapeResult = await supabase
            .from("mixtapes")
            .select(MIXTAPE_COLUMNS)
            .eq("id", mixtapeId)
            .maybeSingle();
        if (mixtapeResult.error) return jsonResponse({ error: getErrorMessage(mixtapeResult.error) }, 500);
        if (!mixtapeResult.data) return jsonResponse({ error: "Mixtape not found." }, 404);
        const mixtapeRow = mixtapeResult.data as unknown as Record<string, unknown>;
        const owner = await requireMixtapeOwner(auth.userId, mixtapeRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);

        const title = cleanText(body.title, 200);
        if (!title) return jsonResponse({ error: "Track title is required." }, 400);
        const position = positiveInteger(body.position, true);
        if (!position) return jsonResponse({ error: "Track position must be 1 or greater." }, 400);
        const storagePath = cleanText(body.storagePath || body.storage_path, 700);
        const storageOwner = validateMixtapeOwnedTrackStoragePath(
            storagePath,
            String(mixtapeRow.user_id),
            mixtapeId,
        );
        if (!storageOwner.ok) return jsonResponse({ error: storageOwner.error }, 403);
        const status = body.status === "published" ? "published" : "draft";
        const rawDuration = Number(body.durationSeconds ?? body.duration_seconds ?? 0);
        const durationSeconds = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
        const publishRules = validateMixtapeTrackPublishRules({ status, durationSeconds });
        if (!publishRules.ok) return jsonResponse({ error: publishRules.error }, 400);
        const now = new Date().toISOString();
        const payload = {
            mixtape_id: mixtapeId,
            user_id: String(mixtapeRow.user_id),
            position,
            title,
            description: cleanText(body.description, 4000),
            storage_path: storageOwner.storagePath,
            media_url: "",
            file_name: cleanText(body.fileName || body.file_name, 300),
            file_size: Number(body.fileSize ?? body.file_size ?? 0) || null,
            mime_type: cleanText(body.mimeType || body.mime_type, 150),
            duration_seconds: durationSeconds,
            status,
            published_at: status === "published" ? now : null,
        };
        const trackResult = await supabase
            .from("mixtape_tracks")
            .insert(payload)
            .select(MIXTAPE_TRACK_COLUMNS)
            .single();
        if (trackResult.error) return jsonResponse({ error: getErrorMessage(trackResult.error) }, 500);
        const mapped = await mapMixtapeRows({
            mixtapeRows: [mixtapeRow],
            trackRows: [trackResult.data as unknown as Record<string, unknown>],
        });
        return jsonResponse({ ok: true, track: mapped.tracks[0] }, 201);
    }
    catch (error) {
        console.error("[api/mixtapes/tracks] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}