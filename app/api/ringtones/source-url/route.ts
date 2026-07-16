import { NextResponse } from "next/server";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import { RINGTONE_STORAGE_BUCKETS } from "@/lib/ringtone-constants";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Short-lived signed read URL for the creator's private ringtone source object. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const storagePath = String(body.storagePath || "").trim().replace(/^\/+/, "");
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!storagePath) return json({ error: "storagePath is required." }, 400);
        if (!storagePath.startsWith(`${userId}/`)) {
            return json({ error: "You may only sign URLs for your own ringtone source files." }, 403);
        }

        const auth = await requireMatchingUserId(request, "/api/ringtones/source-url", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const creator = await requireRingtoneCreator(userId);
        if (!creator.ok) return json({ error: creator.error }, creator.status);

        const supabase = getSupabaseServerClient();
        const signed = await supabase.storage
            .from(RINGTONE_STORAGE_BUCKETS.source)
            .createSignedUrl(storagePath, 120);
        if (signed.error || !signed.data?.signedUrl) {
            return json({ error: getErrorMessage(signed.error || "Signed URL failed.") }, 500);
        }
        return json({
            bucket: RINGTONE_STORAGE_BUCKETS.source,
            storagePath,
            signedUrl: signed.data.signedUrl,
            expiresInSeconds: 120,
        });
    } catch (error) {
        console.error("[api/ringtones/source-url] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
