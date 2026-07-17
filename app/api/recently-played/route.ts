import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_TYPES = new Set(["song", "video", "beat", "album", "ringtone"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function mapRow(row: Record<string, unknown>) {
    return {
        id: String(row.id || ""),
        mediaType: String(row.media_type || ""),
        mediaId: String(row.media_id || ""),
        lastPlayedAt: String(row.last_played_at || ""),
        playbackPosition: Number(row.playback_position_seconds ?? row.playback_position ?? 0),
        completed: Boolean(row.completed),
        title: row.title ? String(row.title) : null,
        artist: String(row.creator_name ?? row.artist ?? "") || null,
        coverUrl: String(row.artwork_url ?? row.cover_url ?? "") || null,
    };
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/recently-played", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("user_recently_played")
            .select("id,media_type,media_id,last_played_at,playback_position_seconds,completed,title,creator_name,artwork_url")
            .eq("user_id", userId)
            .order("last_played_at", { ascending: false })
            .limit(limit);

        if (error) {
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ items: (data || []).map((row) => mapRow(row as Record<string, unknown>)) });
    }
    catch (error) {
        console.error("[api/recently-played] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(body.action || "upsert").trim();
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(
            request,
            "/api/recently-played",
            userId,
            getSessionTokensFromRecord(body),
        );
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();

        if (action === "upsert" || action === "record") {
            const mediaType = String(body.mediaType || "").trim().toLowerCase();
            const mediaId = String(body.mediaId || "").trim();
            if (!MEDIA_TYPES.has(mediaType) || !mediaId) {
                return jsonResponse({ error: "Valid mediaType and mediaId are required." }, 400);
            }
            const playbackPosition = Math.max(0, Number(body.playbackPosition ?? body.position ?? 0) || 0);
            const completed = Boolean(body.completed);
            const title = body.title ? String(body.title).slice(0, 200) : "";
            const artist = body.artist ? String(body.artist).slice(0, 200) : "";
            const coverUrl = body.coverUrl ? String(body.coverUrl).slice(0, 500) : null;
            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from("user_recently_played")
                .upsert(
                    {
                        user_id: userId,
                        media_type: mediaType,
                        media_id: mediaId,
                        last_played_at: now,
                        playback_position_seconds: playbackPosition,
                        completed,
                        title,
                        creator_name: artist,
                        artwork_url: coverUrl,
                        updated_at: now,
                    },
                    { onConflict: "user_id,media_type,media_id" },
                )
                .select("id,media_type,media_id,last_played_at,playback_position_seconds,completed,title,creator_name,artwork_url")
                .maybeSingle();

            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true, item: data ? mapRow(data as Record<string, unknown>) : null });
        }

        if (action === "remove") {
            const mediaType = String(body.mediaType || "").trim().toLowerCase();
            const mediaId = String(body.mediaId || "").trim();
            const id = String(body.id || "").trim();
            let query = supabase.from("user_recently_played").delete().eq("user_id", userId);
            if (id) {
                query = query.eq("id", id);
            }
            else if (MEDIA_TYPES.has(mediaType) && mediaId) {
                query = query.eq("media_type", mediaType).eq("media_id", mediaId);
            }
            else {
                return jsonResponse({ error: "id or mediaType+mediaId required." }, 400);
            }
            const { error } = await query;
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true });
        }

        if (action === "clear") {
            const { error } = await supabase
                .from("user_recently_played")
                .delete()
                .eq("user_id", userId);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "Unsupported action." }, 400);
    }
    catch (error) {
        console.error("[api/recently-played] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
