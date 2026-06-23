import { getErrorMessage, getSupabaseLibraryClient } from "@/lib/server-supabase";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isMissingUserStateTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || message.includes("user_music_state") || message.includes("does not exist");
}
function asArray(value: unknown) {
    return Array.isArray(value) ? value : [];
}
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ libraryIds: [], recentlyPlayed: [], playlists: [], activePlaylistId: "" });
        }
        const auth = await requireMatchingUserId(request, "/api/user-music-state", userId);
        if (!auth.ok) {
            return jsonResponse({
                error: auth.error,
                libraryIds: [],
                recentlyPlayed: [],
                playlists: [],
                activePlaylistId: "",
            }, auth.status);
        }
        const supabase = getSupabaseLibraryClient();
        const { data, error } = await supabase
            .from("user_music_state")
            .select("library_ids,recently_played,playlists,active_playlist_id")
            .eq("user_id", userId)
            .maybeSingle();
        if (error) {
            if (isMissingUserStateTable(error)) {
                return jsonResponse({
                    libraryIds: [],
                    recentlyPlayed: [],
                    playlists: [],
                    activePlaylistId: "",
                    setupRequired: true,
                    error: getErrorMessage(error),
                });
            }
            console.error("[api/user-music-state] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({
            hasState: Boolean(data),
            libraryIds: asArray(data?.library_ids),
            recentlyPlayed: asArray(data?.recently_played),
            playlists: asArray(data?.playlists),
            activePlaylistId: typeof data?.active_playlist_id === "string" ? data.active_playlist_id : "",
        });
    }
    catch (error) {
        console.error("[api/user-music-state] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Log in before syncing music state." }, 401);
        }
        const auth = await requireMatchingUserId(request, "/api/user-music-state", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        const supabase = getSupabaseLibraryClient();
        const { error } = await supabase.from("user_music_state").upsert({
            user_id: userId,
            library_ids: asArray(body.libraryIds),
            recently_played: asArray(body.recentlyPlayed).slice(0, 100),
            playlists: asArray(body.playlists),
            active_playlist_id: typeof body.activePlaylistId === "string" ? body.activePlaylistId : "",
            updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) {
            if (isMissingUserStateTable(error)) {
                return jsonResponse({ error: "User music state table is not ready yet.", setupRequired: true }, 409);
            }
            console.error("[api/user-music-state] save failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/user-music-state] post server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
