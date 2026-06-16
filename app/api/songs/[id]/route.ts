import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformOwnerUserId } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SONGS_BUCKET = "songs";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return String(record.message || record.error || JSON.stringify(record));
    }
    return "Unknown server error";
}
function isMissingSongLikesTableError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || message.includes("song_likes") || message.includes("does not exist");
}
function isMissingOptionalTableError(error: unknown, tableName: string) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || message.includes(tableName) || message.includes("does not exist");
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getSupabaseServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
async function removeSongFromUserMusicState(supabase: ReturnType<typeof getSupabaseServerClient>, songId: string) {
    const { data, error } = await supabase
        .from("user_music_state")
        .select("user_id,library_ids,recently_played,playlists");
    if (error) {
        if (isMissingOptionalTableError(error, "user_music_state"))
            return;
        throw error;
    }
    await Promise.all((data || []).map(async (row) => {
        const libraryIds = Array.isArray(row.library_ids) ? row.library_ids.filter((id) => id !== songId) : [];
        const recentlyPlayed = Array.isArray(row.recently_played)
            ? row.recently_played.filter((entry) => {
                if (!entry || typeof entry !== "object")
                    return true;
                return (entry as Record<string, unknown>).songId !== songId;
            })
            : [];
        const playlists = Array.isArray(row.playlists)
            ? row.playlists.map((playlist) => {
                if (!playlist || typeof playlist !== "object")
                    return playlist;
                const playlistRecord = playlist as Record<string, unknown>;
                return {
                    ...playlistRecord,
                    songIds: Array.isArray(playlistRecord.songIds)
                        ? playlistRecord.songIds.filter((id) => id !== songId)
                        : playlistRecord.songIds,
                    updatedAt: new Date().toISOString(),
                };
            })
            : [];
        const { error: updateError } = await supabase
            .from("user_music_state")
            .update({
            library_ids: libraryIds,
            recently_played: recentlyPlayed,
            playlists,
            updated_at: new Date().toISOString(),
        })
            .eq("user_id", row.user_id);
        if (updateError)
            throw updateError;
    }));
}
async function deleteOptionalSongRows(supabase: ReturnType<typeof getSupabaseServerClient>, tableName: string, songId: string) {
    const { error } = await supabase.from(tableName).delete().eq("song_id", songId);
    if (error && !isMissingOptionalTableError(error, tableName)) {
        throw error;
    }
}
async function deleteOptionalTypedItemRows(supabase: ReturnType<typeof getSupabaseServerClient>, tableName: string, itemId: string, itemType: string) {
    const { error } = await supabase.from(tableName).delete().eq("item_id", itemId).eq("item_type", itemType);
    if (error && !isMissingOptionalTableError(error, tableName)) {
        throw error;
    }
}
export async function DELETE(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!id) {
            return jsonResponse({ error: "Missing song id." }, 400);
        }
        if (!isUuid(id)) {
            return jsonResponse({ error: "Song delete requires a real database row id." }, 400);
        }
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Log in before deleting uploaded tracks." }, 401);
        }
        const isOwnerAdmin = await isPlatformOwnerUserId(userId);
        const supabase = getSupabaseServerClient();
        const { data: song, error: readError } = await supabase
            .from("songs")
            .select("storage_path,user_id")
            .eq("id", id)
            .maybeSingle();
        if (readError) {
            console.error("[api/songs/:id] read before delete failed:", readError);
            return jsonResponse({ error: getErrorMessage(readError) }, 500);
        }
        if (!song) {
            return jsonResponse({ ok: true, alreadyDeleted: true });
        }
        if (!isOwnerAdmin && (!song.user_id || song.user_id !== userId)) {
            return jsonResponse({ error: "Only the owner can delete this uploaded track." }, 403);
        }
        const { error: likesError } = await supabase.from("song_likes").delete().eq("song_id", id);
        if (likesError && !isMissingSongLikesTableError(likesError)) {
            console.error("[api/songs/:id] song likes delete failed:", likesError);
            return jsonResponse({ error: getErrorMessage(likesError) }, 500);
        }
        const relatedTables = ["favorites", "likes", "playlist_songs", "recent_plays", "library_saves", "queue", "streams"];
        try {
            await Promise.all([
                ...relatedTables.map((tableName) => deleteOptionalSongRows(supabase, tableName, id)),
                deleteOptionalTypedItemRows(supabase, "library_saves", id, "song"),
                deleteOptionalTypedItemRows(supabase, "playlist_items", id, "song"),
                deleteOptionalTypedItemRows(supabase, "comments", id, "song"),
                deleteOptionalTypedItemRows(supabase, "moderation_reports", id, "song"),
            ]);
        }
        catch (relatedDeleteError) {
            console.error("[api/songs/:id] related records delete failed:", relatedDeleteError);
            return jsonResponse({ error: getErrorMessage(relatedDeleteError) }, 500);
        }
        await removeSongFromUserMusicState(supabase, id);
        const { error: deleteError } = await supabase.from("songs").delete().eq("id", id);
        if (deleteError) {
            console.error("[api/songs/:id] delete failed:", deleteError);
            return jsonResponse({ error: getErrorMessage(deleteError) }, 500);
        }
        if (song?.storage_path) {
            const { error: storageError } = await supabase.storage.from(SONGS_BUCKET).remove([song.storage_path]);
            if (storageError) {
            }
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/songs/:id] delete server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function PATCH(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const body = (await request.json().catch(() => ({}))) as {
            producer?: unknown;
            producer_id?: unknown;
            producerId?: unknown;
            beat_id?: unknown;
            beatId?: unknown;
        };
        if (!id) {
            return jsonResponse({ error: "Missing song id." }, 400);
        }
        const updates: Record<string, unknown> = {};
        if (body.producer !== undefined)
            updates.producer = String(body.producer || "").trim();
        if (body.producer_id !== undefined || body.producerId !== undefined) {
            updates.producer_id = String(body.producer_id || body.producerId || "").trim() || null;
        }
        if (body.beat_id !== undefined || body.beatId !== undefined) {
            updates.beat_id = String(body.beat_id || body.beatId || "").trim() || null;
        }
        if (Object.keys(updates).length === 0) {
            return jsonResponse({ error: "No song updates provided." }, 400);
        }
        const supabase = getSupabaseServerClient();
        const { error } = await supabase.from("songs").update(updates).eq("id", id);
        if (error) {
            console.error("[api/songs/:id] update failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/songs/:id] patch server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
