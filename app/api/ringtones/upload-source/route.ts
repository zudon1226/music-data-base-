import { NextResponse } from "next/server";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import {
    RINGTONE_ALLOWED_AUDIO_MIME_TYPES,
    RINGTONE_SOURCE_MAX_BYTES,
    RINGTONE_STORAGE_BUCKETS,
} from "@/lib/ringtone-constants";
import { buildRingtoneStoragePath } from "@/lib/ringtone-processing";
import { validateRingtoneFileSize, validateRingtoneMimeType } from "@/lib/ringtone-validation";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function extensionForMime(mimeType: string) {
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("aac")) return "aac";
    return "m4a";
}

/** Prepare a signed upload into private ringtone-source/{userId}/... */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/upload-source", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const creator = await requireRingtoneCreator(userId);
        if (!creator.ok) return json({ error: creator.error }, creator.status);

        if (body.ownershipConfirmed !== true) {
            return json({ error: "Ownership confirmation is required before uploading ringtone source audio." }, 400);
        }

        const mime = validateRingtoneMimeType(body.mimeType || body.contentType);
        if (!mime.ok) return json({ error: mime.error, allowed: RINGTONE_ALLOWED_AUDIO_MIME_TYPES }, 400);
        const size = validateRingtoneFileSize(body.byteLength ?? body.fileSize);
        if (!size.ok) return json({ error: size.error, maxBytes: RINGTONE_SOURCE_MAX_BYTES }, 400);

        const storagePath = buildRingtoneStoragePath(userId, "source", extensionForMime(mime.mimeType));
        const supabase = getSupabaseServerClient();
        const signedUpload = await supabase.storage
            .from(RINGTONE_STORAGE_BUCKETS.source)
            .createSignedUploadUrl(storagePath, { upsert: false });

        if (signedUpload.error || !signedUpload.data?.token) {
            return json({
                error: getErrorMessage(signedUpload.error || "Signed upload URL was not created."),
            }, 500);
        }

        return json({
            bucket: RINGTONE_STORAGE_BUCKETS.source,
            storagePath: signedUpload.data.path || storagePath,
            token: signedUpload.data.token,
            signedUrl: signedUpload.data.signedUrl || "",
            maxBytes: RINGTONE_SOURCE_MAX_BYTES,
            allowedMimeTypes: RINGTONE_ALLOWED_AUDIO_MIME_TYPES,
        });
    } catch (error) {
        console.error("[api/ringtones/upload-source] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
