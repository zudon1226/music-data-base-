import { NextResponse } from "next/server";
import { requireMixtapeOwner } from "@/lib/mixtape-access";
import { requireMixtapeRequestCreator } from "@/lib/mixtape-route-auth";
import {
    buildMixtapeCoverStoragePath,
    buildMixtapeTrackStoragePath,
    MIXTAPE_BUCKET,
    validateMixtapeAudioDescriptor,
    validateMixtapeCoverDescriptor,
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

async function requireOwnedMixtape(mixtapeId: string, userId: string) {
    if (!isUuid(mixtapeId)) {
        return { ok: false as const, status: 400, error: "Choose a valid mixtape." };
    }
    const result = await getSupabaseServerClient()
        .from("mixtapes")
        .select("id,user_id")
        .eq("id", mixtapeId)
        .maybeSingle();
    if (result.error) return { ok: false as const, status: 500, error: getErrorMessage(result.error) };
    if (!result.data) return { ok: false as const, status: 404, error: "Mixtape not found." };
    const owner = await requireMixtapeOwner(userId, result.data.user_id);
    if (!owner.ok) return owner;
    return { ok: true as const, ownerId: String(result.data.user_id) };
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(
            request,
            body,
            "/api/mixtapes/uploads",
            { requireUploadUnlocked: true },
        );
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const action = cleanText(body.action, 40);
        const fileName = cleanText(body.fileName || body.file_name, 300);
        const contentType = cleanText(body.contentType || body.content_type || body.mimeType, 150);
        const fileSize = Number(body.fileSize ?? body.file_size ?? 0);
        const mixtapeId = cleanText(body.mixtapeId || body.mixtape_id, 100);
        const supabase = getSupabaseServerClient();

        if (action === "prepare-cover") {
            const descriptor = validateMixtapeCoverDescriptor({ fileName, contentType, fileSize });
            if (!descriptor.ok) return jsonResponse({ error: descriptor.error }, 400);
            if (!isUuid(mixtapeId)) return jsonResponse({ error: "Mixtape id is required for cover upload." }, 400);
            const mixtape = await requireOwnedMixtape(mixtapeId, auth.userId);
            if (!mixtape.ok) return jsonResponse({ error: mixtape.error }, mixtape.status);
            const storagePath = buildMixtapeCoverStoragePath({
                userId: mixtape.ownerId,
                mixtapeId,
                fileName,
            });
            const signed = await supabase.storage
                .from(MIXTAPE_BUCKET)
                .createSignedUploadUrl(storagePath, { upsert: false });
            if (signed.error || !signed.data?.token) {
                return jsonResponse({ error: getErrorMessage(signed.error || "Signed cover upload unavailable.") }, 500);
            }
            return jsonResponse({
                bucket: MIXTAPE_BUCKET,
                storagePath: signed.data.path || storagePath,
                token: signed.data.token,
                signedUrl: signed.data.signedUrl || "",
                contentType: descriptor.contentType,
            });
        }

        if (action === "prepare-audio") {
            const descriptor = validateMixtapeAudioDescriptor({ fileName, contentType, fileSize });
            if (!descriptor.ok) return jsonResponse({ error: descriptor.error }, 400);
            const mixtape = await requireOwnedMixtape(mixtapeId, auth.userId);
            if (!mixtape.ok) return jsonResponse({ error: mixtape.error }, mixtape.status);
            if (mixtape.ownerId !== auth.userId) {
                return jsonResponse({ error: "Upload audio from the mixtape owner's account." }, 403);
            }
            const storagePath = buildMixtapeTrackStoragePath({
                userId: auth.userId,
                mixtapeId,
                fileName,
            });
            const signed = await supabase.storage.from(MIXTAPE_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
            if (signed.error || !signed.data?.token) {
                return jsonResponse({ error: getErrorMessage(signed.error || "Signed mixtape upload unavailable.") }, 500);
            }
            return jsonResponse({
                bucket: MIXTAPE_BUCKET,
                storagePath: signed.data.path || storagePath,
                token: signed.data.token,
                signedUrl: signed.data.signedUrl || "",
                contentType: descriptor.contentType,
            });
        }

        return jsonResponse({ error: "Unsupported mixtape upload action." }, 400);
    }
    catch (error) {
        console.error("[api/mixtapes/uploads] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}