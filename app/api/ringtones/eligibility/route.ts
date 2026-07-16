import { NextResponse } from "next/server";
import { canUserCreateRingtones } from "@/lib/ringtone-access";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Creator eligibility for ringtone UI (artists, producers, approved creators, owner/admin). */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/eligibility", userId);
        if (!auth.ok) return json({ error: auth.error, canCreateRingtones: false }, auth.status);
        const canCreateRingtones = await canUserCreateRingtones(userId);
        return json({ canCreateRingtones, userId });
    } catch (error) {
        console.error("[api/ringtones/eligibility] GET failed:", error);
        return json({ error: getErrorMessage(error), canCreateRingtones: false }, 500);
    }
}
