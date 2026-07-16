import { NextResponse } from "next/server";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Songs owned by the authenticated creator for ringtone source selection. */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/source-songs", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const creator = await requireRingtoneCreator(userId);
        if (!creator.ok) return json({ error: creator.error }, creator.status);

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("songs")
            .select("id,title,artist,cover_url,audio_url,storage_path,duration,duration_seconds,created_at,user_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200);
        if (error) return json({ error: getErrorMessage(error) }, 500);

        const songs = (data || []).map((row) => {
            const durationSeconds = Number(
                (row as { duration_seconds?: unknown }).duration_seconds
                ?? (row as { duration?: unknown }).duration
                ?? 0,
            );
            return {
                id: row.id,
                title: row.title,
                artist: row.artist || "",
                artworkUrl: row.cover_url || "",
                audioUrl: row.audio_url || "",
                storagePath: row.storage_path || "",
                durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
                createdAt: row.created_at || null,
            };
        });

        return json({ songs });
    } catch (error) {
        console.error("[api/ringtones/source-songs] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
